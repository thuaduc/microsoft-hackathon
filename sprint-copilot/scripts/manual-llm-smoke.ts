// Manual, throwaway smoke test for the LLM classification module (Track B).
// Run: npx tsx scripts/manual-llm-smoke.ts

import { classifyIssues } from "../src/lib/llm/classify";
import sampleIssues from "../src/fixtures/sample-issues.json";
import type { GitHubIssue } from "../src/types";

async function main() {
  const issues = sampleIssues as GitHubIssue[];
  console.log(`Classifying ${issues.length} sample issues...`);
  const classifications = await classifyIssues(issues);
  for (const c of classifications) {
    console.log(
      `#${c.issue_number}  ${c.type.padEnd(7)}  points=${c.points}  epic=${c.is_epic}` +
        (c.subticket_suggestions ? `  subtickets=${c.subticket_suggestions.length}` : "")
    );
  }
  console.log("\nSmoke test passed.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
