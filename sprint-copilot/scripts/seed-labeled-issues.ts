// One-off, throwaway script to seed the target GitHub repo with test issues
// across a wider label mix, for visually checking the review checklist's
// per-label columns. Run: npx tsx scripts/seed-labeled-issues.ts
//
// Loads .env.local by hand since this runs outside Next.js (no dotenv dep).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { githubRequest } from "../src/lib/github/client";
import { getTargetRepo } from "../src/config";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

interface SeedIssue {
  title: string;
  body: string;
  labels: string[];
}

const ISSUES: SeedIssue[] = [
  {
    title: "Preview stream stalls if the network drops mid-classify",
    body: "If the connection blips while /api/run/preview is streaming, the activity log just stops with no error shown.",
    labels: ["bug"],
  },
  {
    title: "Milestone links 404 right after creation (propagation delay)",
    body: "Clicking the new milestone link immediately after a run sometimes 404s for a few seconds before GitHub catches up.",
    labels: ["bug", "help wanted"],
  },
  {
    title: "Add a search box to filter the backlog list",
    body: "With more than ~20 open issues the backlog view is hard to scan. A simple title filter would help.",
    labels: ["enhancement"],
  },
  {
    title: "Show relative time instead of raw dates",
    body: "Ticket cards show 'Created Aug 25' — relative time like '2h ago' reads faster at a glance.",
    labels: ["enhancement"],
  },
  {
    title: "Document the required .env.local variables",
    body: "New contributors have to read config.ts to find out which env vars are required. A short section in the README would save that trip.",
    labels: ["documentation"],
  },
  {
    title: "Should closed issues ever reappear in the backlog view?",
    body: "Right now closed issues never show up again once done/cancelled. Worth confirming that's the intended behavior long-term.",
    labels: ["question"],
  },
  {
    title: "Add a favicon",
    body: "The app currently uses the default Next.js favicon.",
    labels: ["good first issue"],
  },
  {
    title: "Support Internet Explorer 11",
    body: "Someone asked if this needs to work in IE11. It doesn't — this is a hackathon demo app.",
    labels: ["wontfix"],
  },
  {
    title: "Add a sprint history page",
    body: "There's no way to look back at previous sprints' milestones and outcomes after the fact.",
    labels: [],
  },
  {
    title: "Investigate slow cold start after deploy",
    body: "First request after a deploy takes noticeably longer than subsequent ones. Not urgent, just worth a look.",
    labels: [],
  },
];

async function main() {
  loadEnvLocal();
  const { owner, repo } = getTargetRepo();
  console.log(`Seeding ${ISSUES.length} issues into ${owner}/${repo}...`);

  for (const issue of ISSUES) {
    const created = await githubRequest<{ number: number; html_url: string }>(
      `/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        body: JSON.stringify({
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
        }),
      }
    );
    console.log(
      `#${created.number}  [${issue.labels.join(", ") || "no labels"}]  ${issue.title}`
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
