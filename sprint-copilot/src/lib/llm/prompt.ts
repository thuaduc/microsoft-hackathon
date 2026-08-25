import type { GitHubIssue } from "@/types";

const BODY_TRUNCATE_LENGTH = 500;
const POINT_SCALE = [1, 2, 3, 5, 8, 13];

// The target repo's file tree + README, for judging whether an issue looks
// already-implemented or no-longer-relevant — see getRepoTree/getReadme in
// lib/github/repo.ts. Either field can be empty if the fetch failed or the
// repo has no README; the prompt section is simply omitted in that case.
export interface RepoContext {
  paths: string[];
  readme: string | null;
}

function truncateBody(body: string | null): string {
  if (!body) return "(no description)";
  return body.length > BODY_TRUNCATE_LENGTH
    ? `${body.slice(0, BODY_TRUNCATE_LENGTH)}…`
    : body;
}

function formatRepoContext(repoContext?: RepoContext): string {
  if (!repoContext || (repoContext.paths.length === 0 && !repoContext.readme)) return "";
  const sections: string[] = [
    "",
    "Repository context (current state of the target repo) — use this only to",
    "judge whether an issue looks already implemented or no longer relevant;",
    "never use it to change type/points/duplicate_of judgments.",
  ];
  if (repoContext.readme) {
    sections.push("", "README:", repoContext.readme);
  }
  if (repoContext.paths.length > 0) {
    sections.push("", "File tree:", repoContext.paths.join("\n"));
  }
  return sections.join("\n");
}

export function buildClassificationPrompt(
  issues: GitHubIssue[],
  sprintFocus?: string,
  repoContext?: RepoContext
): {
  system: string;
  user: string;
} {
  const system = [
    "You are a sprint planning assistant classifying GitHub issues for a software team.",
    "For every issue given, decide:",
    '- type: "feature" (new capability/enhancement) or "bug" (something broken).',
    `- points: estimated effort, chosen ONLY from this fixed scale: ${POINT_SCALE.join(", ")}.`,
    "- duplicate_of: if this issue clearly describes the same underlying problem or",
    "  request as another issue IN THIS SAME BATCH (not something you recall from",
    "  elsewhere), set this to that other issue's number. Only flag near-duplicates —",
    "  same bug, same feature request, substantially overlapping scope — not issues",
    "  that are merely related or in the same area. Otherwise null. If two issues in",
    "  the batch duplicate each other, pick either one as the canonical issue and set",
    "  duplicate_of only on the other.",
    "- possibly_stale_reason: if the repository context below clearly shows this",
    "  issue is already implemented (a matching file/feature already exists) or no",
    "  longer applies to the project as the README describes it, give a brief",
    "  one-sentence reason why. Otherwise null. Only set this when the repository",
    "  context actually supports it — don't guess from the issue text alone, and",
    "  don't set it just because you can't tell either way.",
    "Classify every issue given — do not skip or invent any.",
    ...(sprintFocus?.trim()
      ? [
          "",
          "The user has also given this sprint's focus, to weigh when classifying",
          "(it can shift how you judge effort or urgency, but never override the",
          "type/points/duplicate_of/possibly_stale_reason rules above):",
          sprintFocus.trim(),
        ]
      : []),
    formatRepoContext(repoContext),
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    "Classify these issues:",
    "",
    ...issues.map((issue) =>
      [
        `#${issue.number}: ${issue.title}`,
        `Labels: ${issue.labels.length > 0 ? issue.labels.join(", ") : "(none)"}`,
        `Body: ${truncateBody(issue.body)}`,
      ].join("\n")
    ),
  ].join("\n\n");

  return { system, user };
}
