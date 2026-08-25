import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate } from "./allocate.ts";
import type { ClassifiedIssue, AllocationConfig } from "../../types.ts";

const CONFIG: AllocationConfig = {
  capacityPoints: 18,
  featureRatio: 0.7,
  bugRatio: 0.3,
};

function issue(
  number: number,
  type: "feature" | "bug",
  points: number,
  matchesFocus = false
): ClassifiedIssue {
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
      type,
      points,
      duplicate_of: null,
      possibly_stale_reason: null,
      matches_sprint_focus: matchesFocus,
    },
  };
}

test("normal mix: both buckets fill within their own budget", () => {
  const classified = [
    issue(1, "feature", 5),
    issue(2, "feature", 3),
    issue(3, "feature", 2),
    issue(4, "bug", 3),
    issue(5, "bug", 2),
    issue(6, "bug", 1),
  ];

  const result = allocate(classified, CONFIG);

  assert.equal(result.totals.featurePointsUsed, 10);
  assert.equal(result.totals.bugPointsUsed, 6);
  assert.equal(result.totals.totalPointsUsed, 16);
  assert.equal(result.totals.capacity, 18);
  assert.equal(result.selected.length, 6);
  assert.equal(result.unselected.length, 0);
});

test("feature-heavy backlog: top-off pulls extra features into leftover bug budget", () => {
  const classified = [
    issue(1, "feature", 5),
    issue(2, "feature", 5),
    issue(3, "feature", 3),
    issue(4, "feature", 2),
    issue(5, "bug", 1),
  ];
  // feature budget = 12.6 -> floor via greedy fill of [2,3,5,5]: 2+3+5=10 (next 5 would be 15 > 12.6), so 10 used
  // bug budget = 5.4 -> only issue 5 (1 pt) available, 1 used, 4.4 leftover
  // top-off: remaining candidates sorted by points ascending across both: feature #1 (5pts) is only one left
  // capacity remaining = 18 - 10 - 1 = 7, next cheapest leftover is feature #1 (5) -> fits, select it

  const result = allocate(classified, CONFIG);

  const selectedNumbers = result.selected.map((i) => i.number).sort();
  assert.deepEqual(selectedNumbers, [1, 2, 3, 4, 5]);
  assert.equal(result.totals.totalPointsUsed, 16);
  assert.equal(result.unselected.length, 0);
});

test("bug-heavy backlog: symmetric top-off pulls extra bugs into leftover feature budget", () => {
  const classified = [
    issue(1, "bug", 5),
    issue(2, "bug", 5),
    issue(3, "bug", 3),
    issue(4, "bug", 2),
    issue(5, "feature", 1),
  ];

  const result = allocate(classified, CONFIG);

  const selectedNumbers = result.selected.map((i) => i.number).sort();
  assert.deepEqual(selectedNumbers, [1, 2, 3, 4, 5]);
  assert.equal(result.totals.totalPointsUsed, 16);
  assert.equal(result.unselected.length, 0);
});

test("capacity exactly met after top-off sums to exactly capacity", () => {
  const classified = [
    issue(1, "feature", 8),
    issue(2, "feature", 5),
    issue(3, "bug", 3),
    issue(4, "bug", 2),
  ];

  const result = allocate(classified, CONFIG);

  assert.equal(result.totals.totalPointsUsed, 18);
  assert.equal(result.totals.capacity, 18);
});

test("capacity underfilled: all issues selected, no error, unused capacity left", () => {
  const classified = [issue(1, "feature", 3), issue(2, "bug", 2)];

  const result = allocate(classified, CONFIG);

  assert.equal(result.selected.length, 2);
  assert.equal(result.unselected.length, 0);
  assert.equal(result.totals.totalPointsUsed, 5);
  assert.ok(result.totals.totalPointsUsed < result.totals.capacity);
});

test("ties within a bucket break ascending by issue number", () => {
  const classified = [
    issue(3, "feature", 2),
    issue(1, "feature", 2),
    issue(2, "feature", 2),
  ];

  const result = allocate(classified, CONFIG);

  assert.deepEqual(
    result.selected.map((i) => i.number),
    [1, 2, 3]
  );
});

test("a focus-matching issue is preferred over a smaller non-matching one", () => {
  // #1 (9 pts, no focus) + #2 (10 pts, focus match) sum to 19 > capacity
  // (18), so at most one can ever be selected — including via top-off, so
  // this isolates sort order, not just "does it eventually fit somewhere".
  // Ascending-by-points alone would pick #1 (9 < 10). With focus-priority,
  // #2 goes first in the sort despite being bigger, fits the feature
  // budget (12.6) on its own, and #1 no longer fits behind it (19 > 12.6,
  // and 9 > the 8 pts of leftover total capacity) — so #2 wins instead.
  const classified = [issue(1, "feature", 9), issue(2, "feature", 10, true)];

  const result = allocate(classified, CONFIG);

  assert.deepEqual(
    result.selected.map((i) => i.number),
    [2]
  );
});

test("selected issues carry their bucket", () => {
  const classified = [issue(1, "feature", 2), issue(2, "bug", 1)];

  const result = allocate(classified, CONFIG);

  const feature = result.selected.find((i) => i.number === 1);
  const bug = result.selected.find((i) => i.number === 2);
  assert.equal(feature?.bucket, "feature");
  assert.equal(bug?.bucket, "bug");
});

test("guaranteed carry-over issue is selected even though it'd lose the points tie-break", () => {
  // #1 (8 pts) would normally lose out to the cheaper features below under
  // the feature budget (12.6), but it's forced in as a carry-over.
  const classified = [
    issue(1, "feature", 8),
    issue(2, "feature", 3),
    issue(3, "feature", 2),
  ];

  const result = allocate(classified, CONFIG, new Set([1]));

  const selectedNumbers = result.selected.map((i) => i.number).sort();
  assert.deepEqual(selectedNumbers, [1, 2, 3]);
});

test("guaranteed issue's points reduce its bucket's budget for everyone else", () => {
  // Feature budget = 12.6, bug budget = 5.4. Guaranteed #1 (10 pts) leaves
  // only 2.6 for other features, so #3 (2 pts) fits but #2 (3 pts) doesn't
  // — and with #4 filling the bug budget there's only 1 pt of leftover
  // capacity, not enough for #2 (3 pts) to sneak in via top-off either.
  const classified = [
    issue(1, "feature", 10),
    issue(2, "feature", 3),
    issue(3, "feature", 2),
    issue(4, "bug", 5),
  ];

  const result = allocate(classified, CONFIG, new Set([1]));

  const selectedNumbers = result.selected.map((i) => i.number).sort();
  assert.deepEqual(selectedNumbers, [1, 3, 4]);
  assert.equal(result.unselected.length, 1);
  assert.equal(result.unselected[0].number, 2);
});

test("guaranteed issues alone can push the run over capacity", () => {
  const classified = [issue(1, "feature", 13), issue(2, "bug", 8)];

  const result = allocate(classified, CONFIG, new Set([1, 2]));

  assert.deepEqual(result.selected.map((i) => i.number).sort(), [1, 2]);
  assert.equal(result.totals.totalPointsUsed, 21);
  assert.ok(result.totals.totalPointsUsed > result.totals.capacity);
});

test("with no guaranteed set, allocate behaves exactly as before (default empty set)", () => {
  const classified = [issue(1, "feature", 5), issue(2, "bug", 3)];

  const result = allocate(classified, CONFIG);

  assert.deepEqual(result.selected.map((i) => i.number).sort(), [1, 2]);
});
