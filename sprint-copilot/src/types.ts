export interface GitHubIssue {
  number: number;
  id: number; // numeric DB id — required for sub-issue linking
  title: string;
  body: string | null;
  html_url: string;
  labels: string[]; // label names only
  labelColors?: Record<string, string>; // label name -> GitHub hex color (no "#"), when known
  assignees: { login: string; avatarUrl: string }[];
  milestone: { number: number; title: string } | null;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  state_reason: "completed" | "not_planned" | null;
}

// Kanban column. Derived from state/state_reason/labels — see
// lib/board/status.ts for the single source of truth on this mapping.
export type BoardStatus = "backlog" | "todo" | "in_progress" | "done" | "cancelled";

export interface BoardIssue extends GitHubIssue {
  status: BoardStatus;
}

// A pull request cross-referenced against an issue — surfaced on Todo/In
// Progress cards as a small badge so a Copilot-opened PR shows up without
// any new sync mechanism, just whatever GitHub's timeline reports right now.
export interface LinkedPullRequest {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged: boolean;
}

export type IssueType = "feature" | "bug";

export interface IssueClassification {
  issue_number: number; // correlates back to GitHubIssue.number
  type: IssueType;
  points: number; // small fixed scale, e.g. 1/2/3/5/8/13
  duplicate_of: number | null; // issue_number of a near-duplicate/overlapping issue, if any
  // Set when the repo's file tree/README suggest this issue is already
  // implemented or no longer applies to the project — a flag for the human
  // to review, not auto-excluded from allocation like duplicate_of is.
  possibly_stale_reason: string | null;
}

// A duplicate issue excluded from allocation, and the canonical issue it
// was consolidated into. Both issues are always present in the input
// batch — this is not a partial/best-effort record, it's a full exclusion.
// Carries enough of each issue's own data (not just numbers) so the review
// screen can show a real per-item row instead of just a count.
export interface ConsolidatedEntry {
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  duplicateOfIssueNumber: number;
  duplicateOfTitle: string;
}

export interface ClassifiedIssue extends GitHubIssue {
  classification: IssueClassification;
  // Title of the previous sprint's milestone this issue is still open
  // under, when it's being force-carried into the new sprint's allocation
  // (see findPreviousMilestone in lib/github/milestones.ts). Undefined for
  // every other issue.
  carriedOverFromMilestone?: string;
}

export type Bucket = "feature" | "bug";

export interface AllocatedIssue extends ClassifiedIssue {
  bucket: Bucket;
}

export interface AllocationConfig {
  capacityPoints: number; // 18
  featureRatio: number; // 0.7
  bugRatio: number; // 0.3
}

export interface AllocationResult {
  selected: AllocatedIssue[];
  unselected: ClassifiedIssue[];
  totals: {
    featurePointsUsed: number;
    bugPointsUsed: number;
    totalPointsUsed: number;
    capacity: number;
  };
}

export interface WriteOutcome {
  issueNumber: number;
  bucket: Bucket;
  milestoneAssigned: boolean;
  labelsApplied: boolean;
  assigneeApplied: boolean;
  errors: string[]; // per-item, non-fatal
}

export type PipelineStage = "fetch" | "classify" | "allocate" | "write";

export interface SprintRunResult {
  ok: boolean;
  milestone?: { number: number; html_url: string; title: string };
  writeOutcomes?: WriteOutcome[];
  consolidated?: ConsolidatedEntry[]; // duplicates excluded before allocation
  totals?: AllocationResult["totals"];
  error?: { stage: PipelineStage; message: string };
}

// The preview phase's output: what the algorithm proposes, before anything
// is written to GitHub. selected/unselected can be edited by the user
// (moved between the two) before confirming — see ConfirmSelection.
export interface PreviewResult {
  selected: AllocatedIssue[];
  unselected: ClassifiedIssue[];
  consolidated: ConsolidatedEntry[];
  totals: AllocationResult["totals"];
}

// One issue's final in/out-of-sprint decision, as sent back to the confirm
// endpoint after the user has reviewed and optionally adjusted the preview.
export interface ConfirmSelection {
  issueNumber: number;
  bucket: Bucket;
  // The issue's labels as of preview time — lets confirm strip a stale
  // status:in-progress label before adding status:todo, since labels are
  // additive-only (see CLAUDE.md gotcha #3) and would otherwise stack.
  labels: string[];
}

// NDJSON events streamed by both /api/run/preview and /api/run/confirm —
// one JSON object per line. "log" lines are narration; "preview"/"result"
// are the terminal success payload for each endpoint; "error" ends the
// stream early (no retries — see CLAUDE.md).
export type PipelineEvent =
  | { type: "log"; message: string }
  | { type: "preview"; payload: PreviewResult }
  | { type: "result"; payload: SprintRunResult }
  | { type: "error"; stage: PipelineStage; message: string };
