// Throwaway helper: seed the target repo with the sample fixture issues (for
// end-to-end testing of /api/run), or clean up everything this script + the
// manual smoke tests create. Not part of the app.
//
//   npx tsx scripts/seed-and-cleanup.ts seed
//   npx tsx scripts/seed-and-cleanup.ts cleanup

import { getTargetRepo } from "../src/config";
import { githubRequest } from "../src/lib/github/client";
import sampleIssues from "../src/fixtures/sample-issues.json";

async function seed() {
  const { owner, repo } = getTargetRepo();
  for (const issue of sampleIssues) {
    const created = await githubRequest<{ number: number }>(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels }),
    });
    console.log(`created #${created.number}: ${issue.title}`);
  }
}

async function cleanup() {
  const { owner, repo } = getTargetRepo();

  const openIssues = await githubRequest<Array<{ number: number; pull_request?: unknown }>>(
    `/repos/${owner}/${repo}/issues?state=open&per_page=100`
  );
  for (const issue of openIssues) {
    if (issue.pull_request) continue;
    await githubRequest(`/repos/${owner}/${repo}/issues/${issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    });
    console.log(`closed #${issue.number}`);
  }

  const milestones = await githubRequest<Array<{ number: number }>>(
    `/repos/${owner}/${repo}/milestones?state=all&per_page=100`
  );
  for (const m of milestones) {
    await githubRequest(`/repos/${owner}/${repo}/milestones/${m.number}`, { method: "DELETE" });
    console.log(`deleted milestone #${m.number}`);
  }
}

const mode = process.argv[2];
if (mode === "seed") seed().catch((e) => { console.error(e); process.exit(1); });
else if (mode === "cleanup") cleanup().catch((e) => { console.error(e); process.exit(1); });
else { console.error("usage: seed-and-cleanup.ts <seed|cleanup>"); process.exit(1); }
