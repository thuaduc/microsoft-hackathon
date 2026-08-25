import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { listAllIssues } from "@/lib/github/issues";
import { listMilestones } from "@/lib/github/milestones";
import { computeBoardStatus } from "@/lib/board/status";
import type { BoardIssue } from "@/types";

// All issues (open + closed), each tagged with its computed kanban column,
// plus every sprint milestone (for the board's sprint nav).
export async function GET() {
  try {
    const { owner, repo } = getTargetRepo();
    const [issues, milestones] = await Promise.all([
      listAllIssues(owner, repo),
      listMilestones(owner, repo),
    ]);
    const board: BoardIssue[] = issues.map((issue) => ({
      ...issue,
      status: computeBoardStatus(issue),
    }));
    return NextResponse.json({ issues: board, milestones });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
