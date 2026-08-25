import type { GitHubIssue } from "@/types";

const BODY_TRUNCATE_LENGTH = 500;
const POINT_SCALE = [1, 2, 3, 5, 8, 13];

function truncateBody(body: string | null): string {
  if (!body) return "(no description)";
  return body.length > BODY_TRUNCATE_LENGTH
    ? `${body.slice(0, BODY_TRUNCATE_LENGTH)}…`
    : body;
}

export function buildClassificationPrompt(issues: GitHubIssue[]): {
  system: string;
  user: string;
} {
  const system = [
    "You are a sprint planning assistant classifying GitHub issues for a software team.",
    "For every issue given, decide:",
    '- type: "feature" (new capability/enhancement) or "bug" (something broken).',
    "- is_epic: true if the issue describes work large enough to be split into several",
    "  independent sub-tickets (e.g. it spans multiple components or clearly bundles",
    "  several pieces of work); false for a single, well-scoped change.",
    `- points: estimated effort, chosen ONLY from this fixed scale: ${POINT_SCALE.join(", ")}.`,
    "- subticket_suggestions: when is_epic is true, 2-5 short titles for the sub-tickets",
    "  this epic should be split into; an empty array when is_epic is false.",
    "Classify every issue given — do not skip or invent any.",
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
