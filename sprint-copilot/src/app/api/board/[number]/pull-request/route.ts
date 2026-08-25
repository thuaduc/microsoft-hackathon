import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { getLinkedPullRequest } from "@/lib/github/issues";

// Best-effort lookup for the card's PR badge — a miss (no linked PR yet)
// is a normal, common case, not an error.
export async function GET(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  try {
    const { owner, repo } = getTargetRepo();
    const pullRequest = await getLinkedPullRequest(owner, repo, issueNumber);
    return NextResponse.json({ pullRequest });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
