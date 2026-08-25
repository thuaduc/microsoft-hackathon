import { githubFetch, githubRequest, GitHubApiError, parseNextLink } from "./client";

export interface GitHubMilestone {
  number: number;
  id: number;
  html_url: string;
  title: string;
  state: "open" | "closed";
  due_on: string | null;
  created_at: string;
}

export async function createMilestone(
  owner: string,
  repo: string,
  title: string,
  description?: string,
  dueOn?: string
): Promise<GitHubMilestone> {
  return githubRequest<GitHubMilestone>(`/repos/${owner}/${repo}/milestones`, {
    method: "POST",
    body: JSON.stringify({ title, description, due_on: dueOn }),
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

// The "previous sprint" for carry-over purposes: whichever milestone most
// recently reached its due date (due_on <= now), since an overdue-but-still-
// open milestone is exactly a past sprint that ran out of time. Falls back
// to the most recently created milestone if none have a due date at all
// (e.g. milestones created outside this app).
export function findPreviousMilestone(
  milestones: GitHubMilestone[],
  now: Date = new Date()
): GitHubMilestone | null {
  const dueByNow = milestones.filter((m) => m.due_on && new Date(m.due_on) <= now);
  if (dueByNow.length > 0) {
    return dueByNow.reduce((latest, m) => (new Date(m.due_on!) > new Date(latest.due_on!) ? m : latest));
  }
  if (milestones.length === 0) return null;
  return milestones.reduce((latest, m) => (new Date(m.created_at) > new Date(latest.created_at) ? m : latest));
}
