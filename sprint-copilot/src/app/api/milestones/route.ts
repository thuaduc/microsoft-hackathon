import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { listMilestones } from "@/lib/github/milestones";

// All sprint milestones (open + closed) — used to derive the next sprint's
// sequential number and to power the Kanban board's sprint nav.
export async function GET() {
  try {
    const { owner, repo } = getTargetRepo();
    const milestones = await listMilestones(owner, repo);
    return NextResponse.json({ milestones });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
