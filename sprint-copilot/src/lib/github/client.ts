import { getGitHubPat } from "@/config";

const GITHUB_API_BASE = "https://api.github.com";

export class GitHubApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `GitHub API error: ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Low-level authed fetch — used directly by callers that need response
// headers (e.g. Link header pagination), and wrapped by githubRequest for
// the common JSON-body case.
export async function githubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${getGitHubPat()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await githubFetch(path, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new GitHubApiError(
      res.status,
      body,
      `GitHub API ${init.method ?? "GET"} ${path} failed: ${res.status}`
    );
  }

  return body as T;
}

// GraphQL errors come back as HTTP 200 with an `errors` array, not a
// non-2xx status — githubRequest's status check alone won't catch them.
export async function githubGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const body = await githubRequest<{ data?: T; errors?: Array<{ message: string }> }>("/graphql", {
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify({ query, variables }),
  });
  if (body.errors?.length) {
    throw new GitHubApiError(
      200,
      body.errors,
      `GitHub GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`
    );
  }
  return body.data as T;
}

// Extracts the "next" URL from a GitHub Link response header, e.g.
// `<https://api.github.com/...&page=2>; rel="next", <...>; rel="last"`.
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}
