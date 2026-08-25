import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { commentOnIssue, setIssueBoardStatus } from "@/lib/github/issues";

// Closes a duplicate issue with a comment pointing to the canonical issue
// it duplicates — a real, immediate GitHub write triggered from the review
// screen's "Duplicates excluded" box, not deferred to /api/run/confirm.
// Same minimal-error-handling bar as the rest of the app: one try/catch,
// plain error message, no retries.
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const duplicateOfIssueNumber = Number(body?.duplicateOfIssueNumber);
  if (!Number.isInteger(duplicateOfIssueNumber)) {
    return NextResponse.json({ error: "Invalid or missing duplicateOfIssueNumber." }, { status: 400 });
  }

  try {
    const { owner, repo } = getTargetRepo();
    await commentOnIssue(owner, repo, issueNumber, `Closing as a duplicate of #${duplicateOfIssueNumber}.`);
    await setIssueBoardStatus(owner, repo, issueNumber, "cancelled");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
