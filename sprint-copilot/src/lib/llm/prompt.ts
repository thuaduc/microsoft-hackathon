import type { GitHubIssue } from "@/types";

const BODY_TRUNCATE_LENGTH = 500;
const POINT_SCALE = [1, 2, 3, 5, 8, 13];

function truncateBody(body: string | null): string {
  if (!body) return "(no description)";
  return body.length > BODY_TRUNCATE_LENGTH
    ? `${body.slice(0, BODY_TRUNCATE_LENGTH)}…`
    : body;
}

export function buildClassificationPrompt(
  issues: GitHubIssue[],
  sprintFocus?: string
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
    "Classify every issue given — do not skip or invent any.",
    ...(sprintFocus?.trim()
      ? [
          "",
          "The user has also given this sprint's focus, to weigh when classifying",
          "(it can shift how you judge effort or urgency, but never override the",
          "type/points/duplicate_of rules above):",
          sprintFocus.trim(),
        ]
      : []),
  ].join("\n");

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
