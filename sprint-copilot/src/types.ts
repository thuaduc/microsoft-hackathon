export interface GitHubIssue {
  number: number;
  id: number; // numeric DB id — required for sub-issue linking
  title: string;
  body: string | null;
  html_url: string;
  labels: string[]; // label names only
  state: "open";
}

export type IssueType = "feature" | "bug";

export interface IssueClassification {
  issue_number: number; // correlates back to GitHubIssue.number
  type: IssueType;
  is_epic: boolean;
  points: number; // small fixed scale, e.g. 1/2/3/5/8/13
  subticket_suggestions?: string[]; // present only if is_epic
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
  subIssuesRequested: number;
  subIssuesCreated: number;
  errors: string[]; // per-item, non-fatal
}

export interface SprintRunResult {
  ok: boolean;
  milestone?: { number: number; html_url: string; title: string };
  writeOutcomes?: WriteOutcome[];
  consolidated?: ConsolidatedEntry[]; // duplicates excluded before allocation
  totals?: AllocationResult["totals"];
  error?: { stage: "fetch" | "classify" | "allocate" | "write"; message: string };
}
