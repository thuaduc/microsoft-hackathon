import type { Bucket } from "./types";

export const CAPACITY_POINTS = 18; // 3 devs (mocked) x 6 pts/dev
export const FEATURE_RATIO = 0.7;
export const BUG_RATIO = 0.3;

// Labels marking the two open-and-not-backlog kanban columns. Backlog is
// the absence of both; Done/Cancel are derived from state_reason instead
// of a label — see lib/board/status.ts.
export const STATUS_TODO_LABEL = "status:todo";
export const STATUS_IN_PROGRESS_LABEL = "status:in-progress";

// GitHub Copilot coding agent's assignable bot login — see
// https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/assign-copilot-to-an-issue
export const COPILOT_ASSIGNEE_LOGIN = "copilot-swe-agent";

// Canonical GitHub label per allocation bucket. Consolidated onto GitHub's
// own default labels (bug/enhancement) rather than a separate "type: *"
// scheme, since bug/enhancement were already the more heavily-used labels
// on the target repo — see the labels-consolidation cleanup.
export const BUCKET_LABEL: Record<Bucket, string> = {
  feature: "enhancement",
  bug: "bug",
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see .env.local.example)`);
  }
  return value;
}

export function getGitHubPat(): string {
  return requireEnv("GITHUB_PAT");
}

export function getTargetRepo(): { owner: string; repo: string } {
  return { owner: requireEnv("GITHUB_OWNER"), repo: requireEnv("GITHUB_REPO") };
}

export function getOpenAIKey(): string {
  return requireEnv("OPENAI_API_KEY");
}
