// Throwaway: adds two issues that are near-duplicates of two of the sample
// fixture issues (#101 avatar crash, #105 CSV export), to manually verify
// the consolidation feature against the real OpenAI model.
import { getTargetRepo } from "../src/config";
import { githubRequest } from "../src/lib/github/client";

async function main() {
  const { owner, repo } = getTargetRepo();
  const extras = [
    {
      title: "App crashes uploading a big profile picture",
      body: "If I upload a profile photo that's a few MB, the app crashes and the settings screen is blank afterward.",
      labels: ["bug"],
    },
    {
      title: "Need to export billing history to a spreadsheet",
      body: "Finance wants a way to get billing history out as a CSV/spreadsheet, including dates and amounts.",
      labels: ["enhancement"],
    },
  ];
  for (const e of extras) {
    const created = await githubRequest<{ number: number }>(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify(e),
    });
    console.log(`created #${created.number}: ${e.title}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
