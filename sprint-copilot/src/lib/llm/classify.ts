import OpenAI from "openai";
import type { GitHubIssue, IssueClassification, IssueType } from "@/types";
import { getOpenAIKey } from "@/config";
import { buildClassificationPrompt, type RepoContext } from "./prompt";

const MODEL = "gpt-5.4-mini";
const POINT_SCALE = [1, 2, 3, 5, 8, 13];

export class ClassificationError extends Error {}

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue_number: { type: "integer" },
          type: { type: "string", enum: ["feature", "bug"] },
          points: { type: "integer", enum: POINT_SCALE },
          duplicate_of: { type: ["integer", "null"] },
          possibly_stale_reason: { type: ["string", "null"] },
          matches_sprint_focus: { type: "boolean" },
        },
        required: [
          "issue_number",
          "type",
          "points",
          "duplicate_of",
          "possibly_stale_reason",
          "matches_sprint_focus",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["classifications"],
  additionalProperties: false,
} as const;

interface RawClassification {
  issue_number: number;
  type: string;
  points: number;
  duplicate_of: number | null;
  possibly_stale_reason: string | null;
  matches_sprint_focus: boolean;
}

export async function classifyIssues(
  issues: GitHubIssue[],
  sprintFocus?: string,
  repoContext?: RepoContext
): Promise<IssueClassification[]> {
  const { system, user } = buildClassificationPrompt(issues, sprintFocus, repoContext);
  const client = new OpenAI({ apiKey: getOpenAIKey() });

  let response;
  try {
    response = await client.responses.create({
      model: MODEL,
      // Classification (esp. possibly_stale_reason, which was flagging a
      // wildly different fraction of issues run-to-run at the default
      // temperature — verified against the live API that gpt-5.4-mini
      // accepts this param) needs to be as repeatable as a "same input,
      // same output" pipeline reasonably can be.
      temperature: 0,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "issue_classifications",
          schema: CLASSIFICATION_SCHEMA,
          strict: true,
        },
      },
    });
  } catch (err) {
    throw new ClassificationError(
      `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: { classifications: RawClassification[] };
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new ClassificationError("OpenAI response was not valid JSON");
  }

  const raw = parsed.classifications;
  if (!Array.isArray(raw) || raw.length !== issues.length) {
    throw new ClassificationError(
      `Expected ${issues.length} classifications, got ${
        Array.isArray(raw) ? raw.length : "non-array response"
      }`
    );
  }

  const inputNumbers = new Set(issues.map((issue) => issue.number));
  const seenNumbers = new Set<number>();

  const result: IssueClassification[] = raw.map((item) => {
    if (!inputNumbers.has(item.issue_number)) {
      throw new ClassificationError(
        `Classification references unknown issue_number ${item.issue_number}`
      );
    }
    if (seenNumbers.has(item.issue_number)) {
      throw new ClassificationError(
        `Duplicate classification for issue_number ${item.issue_number}`
      );
    }
    seenNumbers.add(item.issue_number);

    if (item.type !== "feature" && item.type !== "bug") {
      throw new ClassificationError(
        `Invalid type "${item.type}" for issue_number ${item.issue_number}`
      );
    }

    // A self-reference is nonsensical (the model contradicting itself) —
    // treat it as "not a duplicate" rather than failing the whole request.
    // Referencing an issue_number outside this batch is handled defensively
    // by the consolidation step, not here.
    const duplicateOf = item.duplicate_of === item.issue_number ? null : item.duplicate_of;

    const classification: IssueClassification = {
      issue_number: item.issue_number,
      type: item.type as IssueType,
      points: item.points,
      duplicate_of: duplicateOf,
      possibly_stale_reason: item.possibly_stale_reason,
      matches_sprint_focus: item.matches_sprint_focus,
    };
    return classification;
  });

  if (seenNumbers.size !== inputNumbers.size) {
    throw new ClassificationError(
      "Classification result did not cover every input issue exactly once"
    );
  }

  return result;
}
