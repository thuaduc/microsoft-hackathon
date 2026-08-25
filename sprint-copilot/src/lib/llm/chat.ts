import OpenAI from "openai";
import type { BoardIssue } from "@/types";
import { getOpenAIKey } from "@/config";

const MODEL = "gpt-5.4-mini";

export class ChatError extends Error {}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemPrompt(board: BoardIssue[]): string {
  const lines = board.map((issue) => {
    const closedNote =
      issue.state === "closed" ? ` (closed${issue.state_reason ? `, ${issue.state_reason}` : ""})` : "";
    return `#${issue.number} [${issue.status}]${closedNote} ${issue.title} — labels: ${
      issue.labels.join(", ") || "none"
    } — ${issue.html_url}`;
  });

  return [
    "You are Compass's backlog assistant.",
    "Answer questions about the team's GitHub issues and kanban board using only the data below.",
    "Be concise. If something isn't in the data, say you don't know rather than guessing.",
    "",
    "Current board:",
    ...lines,
  ].join("\n");
}

export async function answerChatQuestion(board: BoardIssue[], messages: ChatMessage[]): Promise<string> {
  const client = new OpenAI({ apiKey: getOpenAIKey() });

  let response;
  try {
    response = await client.responses.create({
      model: MODEL,
      input: [{ role: "system", content: buildSystemPrompt(board) }, ...messages],
    });
  } catch (err) {
    throw new ChatError(`OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return response.output_text;
}
