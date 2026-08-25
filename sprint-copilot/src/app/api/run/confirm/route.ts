import { NextRequest } from "next/server";
import { BUCKET_LABEL, STATUS_IN_PROGRESS_LABEL, STATUS_TODO_LABEL, getTargetRepo } from "@/config";
import { applyLabels, assignIssueToMilestone, assignIssueToUser, getAuthenticatedUserLogin, removeLabel } from "@/lib/github/issues";
import { createMilestone } from "@/lib/github/milestones";
import { ndjsonStream } from "@/lib/stream/ndjson";
import type {
  AllocationResult,
  ConfirmSelection,
  PipelineEvent,
  SprintRunResult,
  WriteOutcome,
} from "@/types";

const SPRINT_LENGTH_DAYS = 14;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface ConfirmBody {
  selected: ConfirmSelection[];
  milestoneTitle: string;
  totals: AllocationResult["totals"];
}

// Phase 2 of the two-phase pipeline: takes the user-reviewed (possibly
// adapted) selection from /api/run/preview and writes it to GitHub —
// milestone, then per-issue milestone assignment + labels — streamed as
// NDJSON progress events. Same minimal-error-handling bar as before: per-
// issue failures land on that issue's WriteOutcome rather than aborting
// the rest; only milestone creation itself failing aborts the whole run.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as ConfirmBody;
  if (!Array.isArray(body.selected) || typeof body.milestoneTitle !== "string") {
    return ndjsonStream(async (emit: (event: PipelineEvent) => void) => {
      emit({ type: "error", stage: "write", message: "Malformed confirm request." });
    }, "write");
  }

  return ndjsonStream(async (emit: (event: PipelineEvent) => void) => {
    const { owner, repo } = getTargetRepo();

    emit({ type: "log", message: `Creating milestone "${body.milestoneTitle}"…` });
    let milestone;
    try {
      const dueOn = new Date(Date.now() + SPRINT_LENGTH_DAYS * 24 * 60 * 60 * 1000).toISOString();
      milestone = await createMilestone(owner, repo, body.milestoneTitle, undefined, dueOn);
    } catch (err) {
      emit({ type: "error", stage: "write", message: message(err) });
      return;
    }
    emit({ type: "log", message: `Created milestone "${milestone.title}"` });

    // Solo project for now — every written issue gets self-assigned. A
    // lookup failure here doesn't abort the run; it just means no issue
    // gets an assignee below (already-logged once, not per-issue).
    let assigneeLogin: string | null = null;
    try {
      assigneeLogin = await getAuthenticatedUserLogin();
    } catch (err) {
      emit({ type: "log", message: `Couldn't resolve your GitHub login, skipping assignment — ${message(err)}` });
    }

    const writeOutcomes: WriteOutcome[] = [];
    for (const issue of body.selected) {
      const outcome: WriteOutcome = {
        issueNumber: issue.issueNumber,
        bucket: issue.bucket,
        milestoneAssigned: false,
        labelsApplied: false,
        assigneeApplied: false,
        errors: [],
      };

      try {
        await assignIssueToMilestone(owner, repo, issue.issueNumber, milestone.number);
        outcome.milestoneAssigned = true;
        emit({ type: "log", message: `Assigned #${issue.issueNumber} to milestone` });
      } catch (err) {
        outcome.errors.push(`milestone assign: ${message(err)}`);
        emit({ type: "log", message: `#${issue.issueNumber}: milestone assign failed — ${message(err)}` });
      }

      // A carried-over issue may still have status:in-progress on it from
      // the previous sprint — labels are additive-only (see CLAUDE.md
      // gotcha #3), so status:todo below would just stack on top of it
      // rather than replace it. Strip the stale one first.
      if (issue.labels.includes(STATUS_IN_PROGRESS_LABEL)) {
        try {
          await removeLabel(owner, repo, issue.issueNumber, STATUS_IN_PROGRESS_LABEL);
        } catch (err) {
          outcome.errors.push(`remove stale in-progress label: ${message(err)}`);
        }
      }

      try {
        await applyLabels(owner, repo, issue.issueNumber, [
          BUCKET_LABEL[issue.bucket],
          STATUS_TODO_LABEL,
        ]);
        outcome.labelsApplied = true;
        emit({ type: "log", message: `Labeled #${issue.issueNumber}` });
      } catch (err) {
        outcome.errors.push(`labels: ${message(err)}`);
        emit({ type: "log", message: `#${issue.issueNumber}: labeling failed — ${message(err)}` });
      }

      if (assigneeLogin) {
        try {
          await assignIssueToUser(owner, repo, issue.issueNumber, assigneeLogin);
          outcome.assigneeApplied = true;
          emit({ type: "log", message: `Assigned #${issue.issueNumber} to ${assigneeLogin}` });
        } catch (err) {
          outcome.errors.push(`assignee: ${message(err)}`);
          emit({ type: "log", message: `#${issue.issueNumber}: assignee failed — ${message(err)}` });
        }
      }

      writeOutcomes.push(outcome);
    }

    const result: SprintRunResult = {
      ok: true,
      milestone: { number: milestone.number, html_url: milestone.html_url, title: milestone.title },
      writeOutcomes,
      totals: body.totals,
    };
    emit({ type: "result", payload: result });
  }, "write");
}
