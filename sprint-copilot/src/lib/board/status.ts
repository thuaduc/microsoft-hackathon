import { STATUS_IN_PROGRESS_LABEL, STATUS_TODO_LABEL } from "../../config.ts";
import type { BoardStatus, GitHubIssue } from "../../types.ts";

type StatusInput = Pick<GitHubIssue, "state" | "labels" | "state_reason">;

// Single source of truth for how a GitHub issue maps onto a kanban column.
// Closed issues are Done/Cancel regardless of any status label they carry —
// state/state_reason wins over labels once an issue is closed.
export function computeBoardStatus(issue: StatusInput): BoardStatus {
  if (issue.state === "closed") {
    return issue.state_reason === "not_planned" ? "cancelled" : "done";
  }
  if (issue.labels.includes(STATUS_IN_PROGRESS_LABEL)) return "in_progress";
  if (issue.labels.includes(STATUS_TODO_LABEL)) return "todo";
  return "backlog";
}

type ColumnMatchInput = { status: BoardStatus; milestone: { number: number } | null };

// Which sprint-nav column an issue belongs in, given the currently
// selected milestone. Backlog always shows regardless of milestone (it's
// the pool sprints get built from). Todo/In Progress scope to whichever
// sprint is selected — except a milestone-less issue in one of those two,
// which would otherwise be invisible in *every* sprint view (its milestone
// can never equal a specific selected number), so it shows regardless of
// which sprint you're looking at instead. Done/Cancel do NOT get that
// exception: a closed issue with no milestone isn't "still active" the way
// an unmilestoned todo/in-progress issue is, so it only shows under the
// sprint it actually belongs to — never shows at all if it was never
// milestoned, rather than cluttering every sprint's Done/Cancel column.
export function isIssueInColumn(
  issue: ColumnMatchInput,
  columnKey: BoardStatus,
  selectedMilestone: number | null
): boolean {
  if (issue.status !== columnKey) return false;
  if (columnKey === "backlog" || selectedMilestone === null) return true;
  if (columnKey === "done" || columnKey === "cancelled") {
    return issue.milestone !== null && issue.milestone.number === selectedMilestone;
  }
  return issue.milestone === null || issue.milestone.number === selectedMilestone;
}
