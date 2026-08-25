import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { setIssueBoardStatus } from "@/lib/github/issues";
import type { BoardStatus } from "@/types";

const VALID_STATUSES: BoardStatus[] = ["backlog", "todo", "in_progress", "done", "cancelled"];

// Moves one issue to a new kanban column, writing the corresponding
// label/state change straight to GitHub — same minimal-error-handling bar
// as the rest of the app: no retries, a plain error message on failure.
export async function PATCH(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status: BoardStatus | undefined = body?.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid or missing status." }, { status: 400 });
  }

  try {
    const { owner, repo } = getTargetRepo();
    await setIssueBoardStatus(owner, repo, issueNumber, status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
