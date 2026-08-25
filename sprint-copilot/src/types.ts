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

export type IssueType = "feature" | "bug";

export interface IssueClassification {
  issue_number: number; // correlates back to GitHubIssue.number
  type: IssueType;
  points: number; // small fixed scale, e.g. 1/2/3/5/8/13
  duplicate_of: number | null; // issue_number of a near-duplicate/overlapping issue, if any
}

// A duplicate issue excluded from allocation, and the canonical issue it
// was consolidated into. Both numbers are always present in the input
// batch — this is not a partial/best-effort record, it's a full exclusion.
export interface ConsolidatedEntry {
  issueNumber: number;
  duplicateOfIssueNumber: number;
}

export interface ClassifiedIssue extends GitHubIssue {
  classification: IssueClassification;
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
