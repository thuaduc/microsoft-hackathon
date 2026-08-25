import { COPILOT_ASSIGNEE_LOGIN, STATUS_IN_PROGRESS_LABEL, STATUS_TODO_LABEL } from "@/config";
import type { BoardStatus, GitHubIssue, LinkedPullRequest } from "@/types";
import { GitHubApiError, githubFetch, githubGraphQL, githubRequest, parseNextLink } from "./client";

interface RawIssue {
  number: number;
  id: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<{ name: string; color?: string } | string>;
  assignees: Array<{ login: string; avatar_url: string }> | null;
  milestone: { number: number; title: string } | null;
  state: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  state_reason: "completed" | "not_planned" | "reopened" | null;
  pull_request?: unknown;
}

function toGitHubIssue(raw: RawIssue): GitHubIssue {
  const labelColors: Record<string, string> = {};
  for (const label of raw.labels) {
    if (typeof label !== "string" && label.color) {
      labelColors[label.name] = label.color;
    }
  }

  return {
    number: raw.number,
    id: raw.id,
    title: raw.title,
    body: raw.body,
    html_url: raw.html_url,
    labels: raw.labels.map((label) => (typeof label === "string" ? label : label.name)),
    labelColors,
    assignees: (raw.assignees ?? []).map((assignee) => ({
      login: assignee.login,
      avatarUrl: assignee.avatar_url,
    })),
    milestone: raw.milestone ? { number: raw.milestone.number, title: raw.milestone.title } : null,
    state: raw.state,
    created_at: raw.created_at,
    closed_at: raw.closed_at,
    // "reopened" is a state_reason value GitHub uses transiently; it never
    // applies to a currently-closed issue, so it collapses to null here.
    state_reason: raw.state_reason === "reopened" ? null : raw.state_reason,
  };
}

async function listIssues(owner: string, repo: string, state: "open" | "all"): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  let path: string | null = `/repos/${owner}/${repo}/issues?state=${state}&per_page=100`;

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

// GET /repos/{owner}/{repo}/issues also returns pull requests, and is
// paginated via the Link response header — both handled here so callers
// just get a clean list of open issues.
export async function listOpenIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  return listIssues(owner, repo, "open");
}

// Same as listOpenIssues but includes closed issues too — for the kanban
// board, which needs the Done/Cancel columns.
export async function listAllIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  return listIssues(owner, repo, "all");
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

export async function removeLabel(
  owner: string,
  repo: string,
  issueNumber: number,
  label: string
): Promise<void> {
  await githubRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" }
  );
}

export async function commentOnIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

// Moves an issue to the given kanban column: swaps the status:* label (for
// the open columns) and opens/closes the issue with the matching
// state_reason (for Done/Cancel) — see lib/board/status.ts for the mapping
// this is the inverse of. Reads current labels/state first rather than
// blindly removing both status labels, since DELETE on an absent label 404s.
export async function setIssueBoardStatus(
  owner: string,
  repo: string,
  issueNumber: number,
  status: BoardStatus
): Promise<void> {
  const current = await githubRequest<RawIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const currentLabels = current.labels.map((label) => (typeof label === "string" ? label : label.name));

  for (const label of [STATUS_TODO_LABEL, STATUS_IN_PROGRESS_LABEL]) {
    if (currentLabels.includes(label)) {
      await removeLabel(owner, repo, issueNumber, label);
    }
  }

  if (status === "todo") {
    await applyLabels(owner, repo, issueNumber, [STATUS_TODO_LABEL]);
  } else if (status === "in_progress") {
    await applyLabels(owner, repo, issueNumber, [STATUS_IN_PROGRESS_LABEL]);
  }

  const isOpenColumn = status === "backlog" || status === "todo" || status === "in_progress";
  if (isOpenColumn && current.state === "closed") {
    await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "open" }),
    });
  } else if (!isOpenColumn) {
    await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: "PATCH",
      body: JSON.stringify({
        state: "closed",
        state_reason: status === "done" ? "completed" : "not_planned",
      }),
    });
  }
}

const SUGGESTED_ASSIGNEES_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 10) {
        nodes { __typename ... on Bot { id login } }
      }
      issue(number: $number) { id }
    }
  }
`;

const ADD_ASSIGNEE_MUTATION = `
  mutation($issueId: ID!, $actorId: ID!) {
    addAssigneesToAssignable(input: { assignableId: $issueId, assigneeIds: [$actorId] }) {
      clientMutationId
    }
  }
`;

interface SuggestedActorsResult {
  repository: {
    suggestedActors: { nodes: Array<{ __typename: string; id?: string; login?: string }> };
    issue: { id: string } | null;
  };
}

// Hands the issue to GitHub's Copilot coding agent. This is NOT the plain
// REST `POST .../assignees` call other assignees would use — verified
// against a live repo that the REST endpoint returns 201 but silently
// drops the copilot-swe-agent login (empty assignees, no error). The
// documented, actually-working mechanism is the GraphQL
// addAssigneesToAssignable mutation with the bot's actor id and the
// `GraphQL-Features: issues_copilot_assignment_api_support` header — see
// https://github.blog/changelog/2025-12-03-assign-issues-to-copilot-using-the-api/
export async function assignCopilotToIssue(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  const { repository } = await githubGraphQL<SuggestedActorsResult>(SUGGESTED_ASSIGNEES_QUERY, {
    owner,
    repo,
    number: issueNumber,
  });

  const copilot = repository.suggestedActors.nodes.find(
    (actor) => actor.__typename === "Bot" && actor.login === COPILOT_ASSIGNEE_LOGIN
  );
  if (!copilot?.id) {
    throw new Error(
      "Copilot coding agent isn't assignable on this repo — check it's enabled under repo Settings > Copilot."
    );
  }
  if (!repository.issue?.id) {
    throw new Error(`Issue #${issueNumber} not found.`);
  }

  await githubGraphQL(
    ADD_ASSIGNEE_MUTATION,
    { issueId: repository.issue.id, actorId: copilot.id },
    { "GraphQL-Features": "issues_copilot_assignment_api_support" }
  );
}

interface RawTimelineEvent {
  event: string;
  source?: {
    type: string;
    issue?: {
      number: number;
      html_url: string;
      state: "open" | "closed";
      pull_request?: { merged_at: string | null };
    };
  };
}

// Finds the most recent PR cross-referenced against this issue (e.g. one
// Copilot opened) via the issue's timeline — no separate PR-tracking state,
// just whatever GitHub currently reports. Returns null if none.
export async function getLinkedPullRequest(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<LinkedPullRequest | null> {
  const events = await githubRequest<RawTimelineEvent[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/timeline?per_page=100`
  );

  let latest: LinkedPullRequest | null = null;
  for (const event of events) {
    const pr = event.source?.issue?.pull_request;
    if (event.event !== "cross-referenced" || !event.source?.issue || !pr) continue;
    latest = {
      number: event.source.issue.number,
      html_url: event.source.issue.html_url,
      state: event.source.issue.state,
      merged: pr.merged_at != null,
    };
  }
  return latest;
}

// The PAT's own login — used to self-assign newly-written sprint issues,
// since (for now) it's a solo project and there's no team roster to pick
// an assignee from.
export async function getAuthenticatedUserLogin(): Promise<string> {
  const user = await githubRequest<{ login: string }>("/user");
  return user.login;
}

// Plain REST assignees endpoint — fine for a real human login. (Only
// Copilot's bot login silently no-ops here; see assignCopilotToIssue.) That
// same silent no-op can also happen for a human login that isn't a fully
// assignable collaborator (e.g. team-inherited access, or a scoped
// fine-grained PAT) — GitHub returns 201 with the login just missing from
// the response body's `assignees`, so that body is checked rather than
// trusting a 2xx status.
export async function assignIssueToUser(
  owner: string,
  repo: string,
  issueNumber: number,
  login: string
): Promise<void> {
  const updated = await githubRequest<{ assignees: Array<{ login: string }> | null }>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    {
      method: "POST",
      body: JSON.stringify({ assignees: [login] }),
    }
  );
  const applied = (updated.assignees ?? []).some((assignee) => assignee.login === login);
  if (!applied) {
    throw new Error(`GitHub silently dropped assignee "${login}" — not an assignable collaborator on this repo.`);
  }
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

// Same endpoint as assignIssueToMilestone, milestone: null instead of a
// number — GitHub's way of clearing an issue's milestone. Called when a
// card is dragged back to Backlog: without this, the issue keeps its old
// milestone forever (status labels get cleared, but nothing else touches
// milestone), so it silently stays a carry-over candidate for that sprint
// even though it visually reads as "back in backlog" on the board.
export async function unassignIssueFromMilestone(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ milestone: null }),
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
