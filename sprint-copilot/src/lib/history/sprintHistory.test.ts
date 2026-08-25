import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSprintHistory, type SprintMilestone } from "./sprintHistory.ts";
import type { BoardIssue } from "../../types.ts";

function issue(
  number: number,
  status: BoardIssue["status"],
  milestone: BoardIssue["milestone"]
): BoardIssue {
  return {
    number,
    id: 1000 + number,
    title: `Issue ${number}`,
    body: null,
    html_url: `https://github.com/example/repo/issues/${number}`,
    labels: [],
    assignees: [],
    state: status === "done" || status === "cancelled" ? "closed" : "open",
    created_at: "2026-01-01T00:00:00Z",
    closed_at: status === "done" || status === "cancelled" ? "2026-01-02T00:00:00Z" : null,
    state_reason: status === "done" ? "completed" : status === "cancelled" ? "not_planned" : null,
    milestone,
    status,
  };
}

test("buildSprintHistory summarizes sprint outcomes and sorts newest first", () => {
  const milestones: SprintMilestone[] = [
    { number: 1, title: "Sprint 1" },
    { number: 2, title: "Sprint 2" },
  ];
  const issues: BoardIssue[] = [
    issue(11, "done", { number: 1, title: "Sprint 1" }),
    issue(12, "cancelled", { number: 1, title: "Sprint 1" }),
    issue(13, "todo", { number: 1, title: "Sprint 1" }),
    issue(21, "done", { number: 2, title: "Sprint 2" }),
    issue(22, "in_progress", { number: 2, title: "Sprint 2" }),
    issue(99, "backlog", null),
  ];

  const result = buildSprintHistory(milestones, issues);

  assert.deepEqual(
    result.map((entry) => entry.milestone.number),
    [2, 1]
  );
  assert.equal(result[0].totalIssues, 2);
  assert.equal(result[0].completedIssues, 1);
  assert.equal(result[0].cancelledIssues, 0);
  assert.equal(result[0].openIssues, 1);
  assert.equal(result[0].completionRate, 50);

  assert.equal(result[1].totalIssues, 3);
  assert.equal(result[1].completedIssues, 1);
  assert.equal(result[1].cancelledIssues, 1);
  assert.equal(result[1].openIssues, 1);
  assert.equal(result[1].completionRate, 33);
});

test("buildSprintHistory handles empty milestones", () => {
  const result = buildSprintHistory([{ number: 3, title: "Sprint 3" }], []);
  assert.equal(result[0].totalIssues, 0);
  assert.equal(result[0].completionRate, 0);
});
