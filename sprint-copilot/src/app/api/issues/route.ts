import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { listOpenIssues } from "@/lib/github/issues";

// Live backlog overview for the UI — real GitHub data, not fixtures.
export async function GET() {
  try {
    const { owner, repo } = getTargetRepo();
    const issues = await listOpenIssues(owner, repo);
    return NextResponse.json({ issues });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
