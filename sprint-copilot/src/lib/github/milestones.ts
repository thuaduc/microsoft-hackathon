import { githubFetch, githubRequest, GitHubApiError, parseNextLink } from "./client";

export interface GitHubMilestone {
  number: number;
  id: number;
  html_url: string;
  title: string;
}

export async function createMilestone(
  owner: string,
  repo: string,
  title: string,
  description?: string
): Promise<GitHubMilestone> {
  return githubRequest<GitHubMilestone>(`/repos/${owner}/${repo}/milestones`, {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
}

// Lists all sprints (open + closed), sorted by number ascending — GitHub's
// own default sort is by due_on, which we never set, so we sort ourselves.
export async function listMilestones(owner: string, repo: string): Promise<GitHubMilestone[]> {
  const milestones: GitHubMilestone[] = [];
  let path: string | null = `/repos/${owner}/${repo}/milestones?state=all&per_page=100`;

  while (path) {
    const res = await githubFetch(path);
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new GitHubApiError(res.status, body, `Failed to list milestones: ${res.status}`);
    }

    milestones.push(...(body as GitHubMilestone[]));
    path = parseNextLink(res.headers.get("link"));
  }

  return milestones.sort((a, b) => a.number - b.number);
}
