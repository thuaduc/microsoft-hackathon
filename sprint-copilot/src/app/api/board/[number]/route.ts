import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { assignIssueToMilestone, setIssueBoardStatus } from "@/lib/github/issues";
import type { BoardStatus } from "@/types";

const VALID_STATUSES: BoardStatus[] = ["backlog", "todo", "in_progress", "done", "cancelled"];

// Moves one issue to a new kanban column, writing the corresponding
// label/state change straight to GitHub — same minimal-error-handling bar
// as the rest of the app: no retries, a plain error message on failure.
//
// An optional milestoneNumber ties the issue to the sprint being viewed —
// the board's other columns are scoped to a milestone, so dragging a
// milestone-less backlog issue into one must assign it, or it'd vanish
// (matching neither the old status/backlog nor the new column's sprint).
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
  const milestoneNumber: number | undefined =
    typeof body?.milestoneNumber === "number" ? body.milestoneNumber : undefined;

  try {
    const { owner, repo } = getTargetRepo();
    await setIssueBoardStatus(owner, repo, issueNumber, status);
    if (milestoneNumber !== undefined) {
      await assignIssueToMilestone(owner, repo, issueNumber, milestoneNumber);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
