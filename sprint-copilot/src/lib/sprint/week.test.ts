import { test } from "node:test";
import assert from "node:assert/strict";
import { getCurrentSprintWeek, formatSprintWeekLabel } from "./week.ts";

// Local-calendar formatting — toISOString() converts to UTC first, which
// rolls the date back or forward a day depending on the machine's timezone.
function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

test("Monday, first week of an ISO year", () => {
  const week = getCurrentSprintWeek(new Date(2024, 0, 1)); // Mon 2024-01-01
  assert.equal(week.isoYear, 2024);
  assert.equal(week.isoWeek, 1);
  assert.equal(ymd(week.start), "2024-01-01");
  assert.equal(ymd(week.end), "2024-01-07");
});

test("mid-week date resolves to the same week as its Monday", () => {
  const week = getCurrentSprintWeek(new Date(2024, 0, 3)); // Wed 2024-01-03
  assert.equal(week.isoYear, 2024);
  assert.equal(week.isoWeek, 1);
  assert.equal(ymd(week.start), "2024-01-01");
  assert.equal(ymd(week.end), "2024-01-07");
});

test("year-end edge case: Dec 31 2024 belongs to ISO week 1 of 2025", () => {
  const week = getCurrentSprintWeek(new Date(2024, 11, 31)); // Tue 2024-12-31
  assert.equal(week.isoYear, 2025);
  assert.equal(week.isoWeek, 1);
  assert.equal(ymd(week.start), "2024-12-30");
  assert.equal(ymd(week.end), "2025-01-05");
});

test("mid-year week number", () => {
  const week = getCurrentSprintWeek(new Date(2024, 5, 17)); // Mon 2024-06-17
  assert.equal(week.isoYear, 2024);
  assert.equal(week.isoWeek, 25);
});

test("formatSprintWeekLabel renders a week number and real date range", () => {
  const week = getCurrentSprintWeek(new Date(2024, 0, 3));
  assert.equal(formatSprintWeekLabel(week), "Week 1 · Jan 1 – Jan 7, 2024");
});

test("formatSprintWeekLabel spans a month boundary correctly", () => {
  const week = getCurrentSprintWeek(new Date(2024, 0, 31)); // Wed 2024-01-31 -> week starting Jan 29
  assert.equal(formatSprintWeekLabel(week), "Week 5 · Jan 29 – Feb 4, 2024");
});
