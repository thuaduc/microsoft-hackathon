import { NextResponse } from "next/server";
import { CAPACITY_POINTS, FEATURE_RATIO, BUG_RATIO, getTargetRepo } from "@/config";
import {
  applyLabels,
  assignIssueToMilestone,
  createSubIssue,
  listOpenIssues,
} from "@/lib/github/issues";
import { createMilestone } from "@/lib/github/milestones";
import { classifyIssues } from "@/lib/llm/classify";
import { allocate } from "@/lib/allocation/allocate";
import type { ClassifiedIssue, SprintRunResult, WriteOutcome } from "@/types";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// The single atomic pipeline: scrape -> classify -> allocate -> write.
// No review/confirm step. Errors before the write stage abort with no
// GitHub writes made; once the milestone exists, per-issue write failures
// are recorded on that issue's WriteOutcome rather than aborting the rest —
// partial writes are an acceptable, visible failure state (see CLAUDE.md).
export async function POST() {
  let owner: string, repo: string, issues;
  try {
    ({ owner, repo } = getTargetRepo());
    issues = await listOpenIssues(owner, repo);
  } catch (err) {
    return NextResponse.json<SprintRunResult>({
      ok: false,
      error: { stage: "fetch", message: message(err) },
    });
  }

  let classifications;
  try {
    classifications = await classifyIssues(issues);
  } catch (err) {
    return NextResponse.json<SprintRunResult>({
      ok: false,
      error: { stage: "classify", message: message(err) },
    });
  }

  const classificationByNumber = new Map(classifications.map((c) => [c.issue_number, c]));
  const classified: ClassifiedIssue[] = issues.map((issue) => ({
    ...issue,
    classification: classificationByNumber.get(issue.number)!,
  }));

  let allocationResult;
  try {
    allocationResult = allocate(classified, {
      capacityPoints: CAPACITY_POINTS,
      featureRatio: FEATURE_RATIO,
      bugRatio: BUG_RATIO,
    });
  } catch (err) {
    return NextResponse.json<SprintRunResult>({
      ok: false,
      error: { stage: "allocate", message: message(err) },
    });
  }

  let milestone;
  try {
    milestone = await createMilestone(owner, repo, `Sprint ${new Date().toISOString().slice(0, 10)}`);
  } catch (err) {
    return NextResponse.json<SprintRunResult>({
      ok: false,
      error: { stage: "write", message: message(err) },
    });
  }

  const writeOutcomes: WriteOutcome[] = [];
  for (const issue of allocationResult.selected) {
    const outcome: WriteOutcome = {
      issueNumber: issue.number,
      bucket: issue.bucket,
      milestoneAssigned: false,
      labelsApplied: false,
      subIssuesRequested: issue.classification.subticket_suggestions?.length ?? 0,
      subIssuesCreated: 0,
      errors: [],
    };

    try {
      await assignIssueToMilestone(owner, repo, issue.number, milestone.number);
      outcome.milestoneAssigned = true;
    } catch (err) {
      outcome.errors.push(`milestone assign: ${message(err)}`);
    }

    try {
      await applyLabels(owner, repo, issue.number, ["agent-drafted", `type: ${issue.bucket}`]);
      outcome.labelsApplied = true;
    } catch (err) {
      outcome.errors.push(`labels: ${message(err)}`);
    }

    if (issue.classification.is_epic && issue.classification.subticket_suggestions) {
      for (const subtitle of issue.classification.subticket_suggestions) {
        try {
          await createSubIssue(owner, repo, issue.number, subtitle);
          outcome.subIssuesCreated += 1;
        } catch (err) {
          outcome.errors.push(`sub-issue "${subtitle}": ${message(err)}`);
        }
      }
    }

    writeOutcomes.push(outcome);
  }

  const result: SprintRunResult = {
    ok: true,
    milestone: { number: milestone.number, html_url: milestone.html_url, title: milestone.title },
    writeOutcomes,
    totals: allocationResult.totals,
  };
  return NextResponse.json(result);
}
