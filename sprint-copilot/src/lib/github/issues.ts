import type { GitHubIssue } from "@/types";
import { GitHubApiError, githubFetch, githubRequest, parseNextLink } from "./client";

interface RawIssue {
  number: number;
  id: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<{ name: string } | string>;
  state: "open" | "closed";
  pull_request?: unknown;
}

function toGitHubIssue(raw: RawIssue): GitHubIssue {
  return {
    number: raw.number,
    id: raw.id,
    title: raw.title,
    body: raw.body,
    html_url: raw.html_url,
    labels: raw.labels.map((label) => (typeof label === "string" ? label : label.name)),
    state: "open",
  };
}

// GET /repos/{owner}/{repo}/issues also returns pull requests, and is
// paginated via the Link response header — both handled here so callers
// just get a clean list of open issues.
export async function listOpenIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  let path: string | null = `/repos/${owner}/${repo}/issues?state=open&per_page=100`;

  while (path) {
    const res = await githubFetch(path);
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new GitHubApiError(res.status, body, `Failed to list issues: ${res.status}`);
    }

    for (const raw of body as RawIssue[]) {
      if (raw.pull_request) continue;
      issues.push(toGitHubIssue(raw));
    }

    path = parseNextLink(res.headers.get("link"));
  }

  return issues;
}

// Additive — never use PATCH .../issues/{n} with a `labels` field, which
// replaces the whole set and clobbers existing labels.
export async function applyLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels }),
  });
}

export async function assignIssueToMilestone(
  owner: string,
  repo: string,
  issueNumber: number,
  milestoneNumber: number
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ milestone: milestoneNumber }),
  });
}

// Creates a new issue, then links it as a sub-issue of parentIssueNumber.
// The sub_issues endpoint takes the child's numeric database `id`, NOT its
// `number` — that's what gets captured from the create call below.
export async function createSubIssue(
  owner: string,
  repo: string,
  parentIssueNumber: number,
  title: string,
  body?: string
): Promise<GitHubIssue> {
  const created = await githubRequest<RawIssue>(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });

  await githubRequest(`/repos/${owner}/${repo}/issues/${parentIssueNumber}/sub_issues`, {
    method: "POST",
    body: JSON.stringify({ sub_issue_id: created.id }),
  });

  return toGitHubIssue(created);
}
