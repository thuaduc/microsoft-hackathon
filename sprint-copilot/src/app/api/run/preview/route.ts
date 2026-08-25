import { NextRequest } from "next/server";
import {
  CAPACITY_POINTS,
  FEATURE_RATIO,
  BUG_RATIO,
  getTargetRepo,
} from "@/config";
import { listOpenIssues } from "@/lib/github/issues";
import { findPreviousMilestone, listMilestones } from "@/lib/github/milestones";
import { getReadme, getRepoTree } from "@/lib/github/repo";
import { classifyIssues } from "@/lib/llm/classify";
import type { RepoContext } from "@/lib/llm/prompt";
import { allocate } from "@/lib/allocation/allocate";
import { consolidateDuplicates } from "@/lib/allocation/consolidate";
import { ndjsonStream } from "@/lib/stream/ndjson";
import type { ClassifiedIssue, PipelineEvent } from "@/types";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Phase 1 of the two-phase pipeline: scrape -> classify -> allocate,
// streamed as NDJSON progress events. Makes no GitHub writes — the result
// is a PreviewResult the user can review and adapt before confirming
// (see /api/run/confirm for the write phase).
export async function POST(request: NextRequest) {
  // Optional body — the sprint-planning page's free-text "this sprint's
  // focus" field, passed through to classification. Malformed/empty body
  // just means none set.
  const body = await request.json().catch(() => ({}) as { sprintFocus?: string });
  const sprintFocus = typeof body.sprintFocus === "string" ? body.sprintFocus.trim() : "";

  return ndjsonStream(async (emit: (event: PipelineEvent) => void) => {
    const { owner, repo } = getTargetRepo();

    if (sprintFocus) {
      emit({ type: "log", message: `Applying custom instructions:\n${sprintFocus}` });
    }

    emit({ type: "log", message: "Fetching open issues…" });
    let issues;
    try {
      issues = await listOpenIssues(owner, repo);
    } catch (err) {
      emit({ type: "error", stage: "fetch", message: message(err) });
      return;
    }
    emit({ type: "log", message: `Fetched ${issues.length} open issues` });

    // Force-carry still-open issues from the previous sprint's milestone
    // into this one, rather than letting them silently compete on point
    // size with fresh backlog issues (or drop out of view entirely) — see
    // CLAUDE.md's carry-over note. Non-fatal: a milestone-lookup failure
    // just means no carry-over this run, not an aborted preview.
    let previousMilestoneTitle: string | null = null;
    let carryOverNumbers = new Set<number>();
    try {
      const milestones = await listMilestones(owner, repo);
      const previousMilestone = findPreviousMilestone(milestones);
      if (previousMilestone) {
        previousMilestoneTitle = previousMilestone.title;
        carryOverNumbers = new Set(
          issues
            .filter((issue) => issue.milestone?.number === previousMilestone.number)
            .map((issue) => issue.number)
        );
      }
    } catch (err) {
      emit({ type: "log", message: `Couldn't check for carry-over issues, skipping — ${message(err)}` });
    }
    if (carryOverNumbers.size > 0) {
      emit({
        type: "log",
        message: `Carrying over ${carryOverNumbers.size} unfinished issue${carryOverNumbers.size === 1 ? "" : "s"} from "${previousMilestoneTitle}"`,
      });
    }

    if (issues.length === 0) {
      emit({
        type: "preview",
        payload: {
          selected: [],
          unselected: [],
          consolidated: [],
          totals: { featurePointsUsed: 0, bugPointsUsed: 0, totalPointsUsed: 0, capacity: CAPACITY_POINTS },
        },
      });
      return;
    }

    // Non-fatal, same as the carry-over lookup above: a failure here just
    // means classification proceeds without repo-relevance context, not an
    // aborted preview.
    emit({ type: "log", message: "Reading repository for relevance context…" });
    let repoContext: RepoContext | undefined;
    try {
      const [paths, readme] = await Promise.all([getRepoTree(owner, repo), getReadme(owner, repo)]);
      repoContext = { paths, readme };
    } catch (err) {
      emit({
        type: "log",
        message: `Couldn't read repository context, skipping relevance check — ${message(err)}`,
      });
    }

    emit({ type: "log", message: `Classifying ${issues.length} issues with OpenAI…` });
    let classifications;
    try {
      classifications = await classifyIssues(issues, sprintFocus, repoContext);
    } catch (err) {
      emit({ type: "error", stage: "classify", message: message(err) });
      return;
    }

    const classificationByNumber = new Map(classifications.map((c) => [c.issue_number, c]));
    const classified: ClassifiedIssue[] = issues.map((issue) => ({
      ...issue,
      classification: classificationByNumber.get(issue.number)!,
      ...(carryOverNumbers.has(issue.number) && previousMilestoneTitle
        ? { carriedOverFromMilestone: previousMilestoneTitle }
        : {}),
    }));
    const featureCount = classifications.filter((c) => c.type === "feature").length;
    const bugCount = classifications.filter((c) => c.type === "bug").length;
    emit({
      type: "log",
      message: `Classified ${classifications.length} issues (${featureCount} feature / ${bugCount} bug)`,
    });

    const { deduped, consolidated } = consolidateDuplicates(classified);
    for (const entry of consolidated) {
      emit({
        type: "log",
        message: `Excluded #${entry.issue.number} as a duplicate of #${entry.duplicateOfIssue.number}`,
      });
    }

    let allocationResult;
    try {
      allocationResult = allocate(
        deduped,
        {
          capacityPoints: CAPACITY_POINTS,
          featureRatio: FEATURE_RATIO,
          bugRatio: BUG_RATIO,
        },
        carryOverNumbers
      );
    } catch (err) {
      emit({ type: "error", stage: "allocate", message: message(err) });
      return;
    }

    for (const issue of allocationResult.selected) {
      emit({
        type: "log",
        message: `Selected #${issue.number} "${issue.title}" (${issue.bucket}, ${issue.classification.points} pts)`,
      });
    }
    emit({
      type: "log",
      message: `Sprint proposal: ${allocationResult.totals.totalPointsUsed}/${allocationResult.totals.capacity} pts across ${allocationResult.selected.length} issues`,
    });

    emit({
      type: "preview",
      payload: {
        selected: allocationResult.selected,
        unselected: allocationResult.unselected,
        consolidated,
        totals: allocationResult.totals,
      },
    });
  }, "fetch");
}
