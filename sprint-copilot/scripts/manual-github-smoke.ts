// Manual, throwaway smoke test for the GitHub client (Track A).
// Not part of the app or the automated test suite — run by hand against a
// real scratch repo to de-risk the sub-issue id-vs-number gotcha before
// integration. Requires GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO in the env.
//
//   npx tsx scripts/manual-github-smoke.ts
//
// Exercises: create milestone -> create issue -> assign to milestone ->
// apply labels -> create a second issue -> link it as a sub-issue of the
// first -> verify the link via a follow-up GET.

import { getTargetRepo } from "../src/config";
import { githubRequest } from "../src/lib/github/client";
import { applyLabels, assignIssueToMilestone, createSubIssue, listOpenIssues } from "../src/lib/github/issues";
import { createMilestone } from "../src/lib/github/milestones";

async function main() {
  const { owner, repo } = getTargetRepo();
  const stamp = new Date().toISOString();

  console.log(`Target: ${owner}/${repo}`);

  console.log("1. Creating milestone...");
  const milestone = await createMilestone(owner, repo, `smoke-test ${stamp}`, "Created by manual-github-smoke.ts");
  console.log(`   milestone #${milestone.number} (id ${milestone.id}) -> ${milestone.html_url}`);

  console.log("2. Creating parent issue...");
  const parent = await githubRequest<{ number: number; id: number; html_url: string }>(
    `/repos/${owner}/${repo}/issues`,
    { method: "POST", body: JSON.stringify({ title: `smoke-test parent ${stamp}` }) }
  );
  console.log(`   issue #${parent.number} (id ${parent.id}) -> ${parent.html_url}`);

  console.log("3. Assigning parent to milestone...");
  await assignIssueToMilestone(owner, repo, parent.number, milestone.number);
  console.log("   done");

  console.log("4. Applying labels to parent...");
  await applyLabels(owner, repo, parent.number, ["agent-drafted", "type: feature"]);
  console.log("   done");

  console.log("5. Creating + linking a sub-issue...");
  const child = await createSubIssue(owner, repo, parent.number, `smoke-test child ${stamp}`, "Linked sub-issue.");
  console.log(`   sub-issue #${child.number} (id ${child.id}) linked to #${parent.number}`);

  console.log("6. Verifying via GET .../issues/{parent}/sub_issues...");
  const subIssues = await githubRequest<Array<{ number: number }>>(
    `/repos/${owner}/${repo}/issues/${parent.number}/sub_issues`
  );
  const linked = subIssues.some((s) => s.number === child.number);
  console.log(`   sub_issues for #${parent.number}: [${subIssues.map((s) => s.number).join(", ")}] — linked: ${linked}`);
  if (!linked) throw new Error("Sub-issue link verification failed");

  console.log("7. Sanity-checking listOpenIssues() picks both up...");
  // Note: GitHub's issues-list endpoint has brief eventual consistency —
  // an issue created milliseconds ago may not show up here yet even though
  // a direct GET on it (step 6 above) already reflects it. Confirmed by
  // querying again a few seconds after this script exits. Not a real-world
  // problem: the app only calls listOpenIssues() once, at the start of a
  // run, against pre-existing backlog issues.
  const open = await listOpenIssues(owner, repo);
  const sawParent = open.some((i) => i.number === parent.number);
  const sawChild = open.some((i) => i.number === child.number);
  console.log(`   saw parent: ${sawParent}, saw child: ${sawChild} (child may lag briefly, see comment above)`);

  console.log("\nSmoke test passed. Clean up the milestone/issues manually if desired.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
