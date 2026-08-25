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
