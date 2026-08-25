import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBoardStatus, isIssueInColumn } from "./status.ts";

function issue(
  state: "open" | "closed",
  labels: string[] = [],
  stateReason: "completed" | "not_planned" | null = null
) {
  return { state, labels, state_reason: stateReason };
}

test("open, no status labels -> backlog", () => {
  assert.equal(computeBoardStatus(issue("open")), "backlog");
});

test("open, status:todo label -> todo", () => {
  assert.equal(computeBoardStatus(issue("open", ["status:todo"])), "todo");
});

test("open, status:in-progress label -> in_progress", () => {
  assert.equal(computeBoardStatus(issue("open", ["status:in-progress"])), "in_progress");
});

test("open, both status labels present -> in_progress wins", () => {
  assert.equal(
    computeBoardStatus(issue("open", ["status:todo", "status:in-progress"])),
    "in_progress"
  );
});

test("open, unrelated labels only -> backlog", () => {
  assert.equal(computeBoardStatus(issue("open", ["bug", "agent-drafted"])), "backlog");
});

test("closed with state_reason completed -> done", () => {
  assert.equal(computeBoardStatus(issue("closed", [], "completed")), "done");
});

test("closed with state_reason null (older issue) -> done", () => {
  assert.equal(computeBoardStatus(issue("closed", [], null)), "done");
});

test("closed with state_reason not_planned -> cancelled", () => {
  assert.equal(computeBoardStatus(issue("closed", [], "not_planned")), "cancelled");
});

test("closed status labels are ignored -> still done/cancelled, not todo/in_progress", () => {
  assert.equal(computeBoardStatus(issue("closed", ["status:todo"], "completed")), "done");
});

test("backlog column always matches, regardless of milestone", () => {
  assert.equal(
    isIssueInColumn({ status: "backlog", milestone: { number: 5 } }, "backlog", 7),
    true
  );
  assert.equal(isIssueInColumn({ status: "backlog", milestone: null }, "backlog", 7), true);
});

test("non-backlog column matches when the issue's milestone equals the selected one", () => {
  assert.equal(
    isIssueInColumn({ status: "in_progress", milestone: { number: 7 } }, "in_progress", 7),
    true
  );
});

test("non-backlog column excludes an issue milestoned to a different sprint", () => {
  assert.equal(
    isIssueInColumn({ status: "in_progress", milestone: { number: 6 } }, "in_progress", 7),
    false
  );
});

test("a milestone-less issue in todo/in_progress still shows, regardless of which sprint is selected — otherwise it's invisible in every view", () => {
  assert.equal(
    isIssueInColumn({ status: "in_progress", milestone: null }, "in_progress", 7),
    true
  );
  assert.equal(isIssueInColumn({ status: "todo", milestone: null }, "todo", 7), true);
});

test("a milestone-less done/cancelled issue does NOT get the same exception — it never shows in a sprint-scoped view", () => {
  assert.equal(isIssueInColumn({ status: "done", milestone: null }, "done", 7), false);
  assert.equal(isIssueInColumn({ status: "cancelled", milestone: null }, "cancelled", 7), false);
});

test("a done/cancelled issue milestoned to a different sprint is excluded, not shown everywhere", () => {
  assert.equal(
    isIssueInColumn({ status: "done", milestone: { number: 6 } }, "done", 7),
    false
  );
});

test("a done/cancelled issue milestoned to the selected sprint still shows", () => {
  assert.equal(
    isIssueInColumn({ status: "cancelled", milestone: { number: 7 } }, "cancelled", 7),
    true
  );
});

test("no milestones exist yet (selectedMilestone null) -> every column shows by status alone", () => {
  assert.equal(
    isIssueInColumn({ status: "todo", milestone: null }, "todo", null),
    true
  );
});

test("status mismatch never matches, milestone or not", () => {
  assert.equal(
    isIssueInColumn({ status: "todo", milestone: { number: 7 } }, "in_progress", 7),
    false
  );
});
