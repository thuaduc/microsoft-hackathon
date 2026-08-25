import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidateDuplicates } from "./consolidate.ts";
import type { ClassifiedIssue } from "../../types.ts";

function issue(number: number, duplicateOf: number | null = null): ClassifiedIssue {
  return {
    number,
    id: 1000 + number,
    title: `Issue ${number}`,
    body: null,
    html_url: `https://github.com/example/demo-repo/issues/${number}`,
    labels: [],
    assignees: [],
    milestone: null,
    state: "open",
    created_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    state_reason: null,
    classification: {
      issue_number: number,
      type: "bug",
      points: 1,
      duplicate_of: duplicateOf,
      possibly_stale_reason: null,
    },
  };
}

test("no duplicates: everything passes through unchanged", () => {
  const classified = [issue(1), issue(2), issue(3)];
  const result = consolidateDuplicates(classified);
  assert.deepEqual(result.consolidated, []);
  assert.equal(result.deduped.length, 3);
});

test("simple duplicate: the duplicate is excluded, canonical kept", () => {
  const classified = [issue(1), issue(2, 1), issue(3)];
  const result = consolidateDuplicates(classified);
  assert.deepEqual(result.consolidated, [{ issueNumber: 2, duplicateOfIssueNumber: 1 }]);
  assert.deepEqual(
    result.deduped.map((i) => i.number),
    [1, 3]
  );
});

test("mutual duplicate claim: lower issue number always wins as canonical", () => {
  const classified = [issue(5, 9), issue(9, 5)];
  const result = consolidateDuplicates(classified);
  assert.deepEqual(result.consolidated, [{ issueNumber: 9, duplicateOfIssueNumber: 5 }]);
  assert.deepEqual(
    result.deduped.map((i) => i.number),
    [5]
  );
});

test("duplicate chain: A dup of B, B dup of C — both A and B excluded, C survives", () => {
  const classified = [issue(1, 2), issue(2, 3), issue(3)];
  const result = consolidateDuplicates(classified);
  assert.deepEqual(
    result.deduped.map((i) => i.number),
    [3]
  );
  assert.equal(result.consolidated.length, 2);
});

test("self-reference is ignored (treated as not a duplicate)", () => {
  const classified = [issue(1, 1), issue(2)];
  const result = consolidateDuplicates(classified);
  assert.deepEqual(result.consolidated, []);
  assert.equal(result.deduped.length, 2);
});

test("reference outside the batch is ignored", () => {
  const classified = [issue(1, 999), issue(2)];
  const result = consolidateDuplicates(classified);
  assert.deepEqual(result.consolidated, []);
  assert.equal(result.deduped.length, 2);
});
