import { NextRequest, NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { listAllIssues } from "@/lib/github/issues";
import { computeBoardStatus } from "@/lib/board/status";
import { answerChatQuestion, type ChatMessage } from "@/lib/llm/chat";
import type { BoardIssue } from "@/types";

// Read-only Q&A over the live backlog/board — no GitHub writes, so it sits
// outside the preview/confirm pipeline entirely.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages as ChatMessage[] | undefined;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    const { owner, repo } = getTargetRepo();
    const issues = await listAllIssues(owner, repo);
    const board: BoardIssue[] = issues.map((issue) => ({
      ...issue,
      status: computeBoardStatus(issue),
    }));

    const reply = await answerChatQuestion(board, messages);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
