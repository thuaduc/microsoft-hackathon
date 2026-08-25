import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBoardStatus } from "./status.ts";

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
