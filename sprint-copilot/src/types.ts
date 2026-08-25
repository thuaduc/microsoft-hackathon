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
  totals?: AllocationResult["totals"];
  error?: { stage: "fetch" | "classify" | "allocate" | "write"; message: string };
}
