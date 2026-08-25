import { NextResponse } from "next/server";
import { getTargetRepo } from "@/config";
import { assignCopilotToIssue, setIssueBoardStatus } from "@/lib/github/issues";

// Hands an issue to Copilot and moves it to In Progress — same
// minimal-error-handling bar as the rest of the app: one try/catch, a
// plain error message, no retries.
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  try {
    const { owner, repo } = getTargetRepo();
    await assignCopilotToIssue(owner, repo, issueNumber);
    await setIssueBoardStatus(owner, repo, issueNumber, "in_progress");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
