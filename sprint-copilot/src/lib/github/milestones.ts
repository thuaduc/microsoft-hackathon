import { githubRequest } from "./client";

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
