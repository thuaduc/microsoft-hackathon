import { githubFetch, githubRequest } from "./client";

const MAX_TREE_PATHS = 400;
const README_TRUNCATE_LENGTH = 2000;

interface RawRepo {
  default_branch: string;
}

interface RawTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
}

interface RawTree {
  tree: RawTreeEntry[];
}

// File paths in the repo's default branch (blobs only, capped) — gives the
// classifier a cheap sense of what already exists without fetching any file
// contents. Recursive tree, so nested paths are included.
export async function getRepoTree(owner: string, repo: string): Promise<string[]> {
  const repoInfo = await githubRequest<RawRepo>(`/repos/${owner}/${repo}`);
  const tree = await githubRequest<RawTree>(
    `/repos/${owner}/${repo}/git/trees/${repoInfo.default_branch}?recursive=1`
  );
  return tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .slice(0, MAX_TREE_PATHS);
}

// Raw README content, truncated — null if the repo has none (a 404 here is
// a normal, common case, not an error).
export async function getReadme(owner: string, repo: string): Promise<string | null> {
  const res = await githubFetch(`/repos/${owner}/${repo}/readme`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text.length > README_TRUNCATE_LENGTH ? `${text.slice(0, README_TRUNCATE_LENGTH)}…` : text;
}
