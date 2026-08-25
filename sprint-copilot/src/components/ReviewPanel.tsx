"use client";

import { useMemo, useState } from "react";
import { computeTotals } from "@/lib/allocation/allocate";
import { FEATURE_RATIO, BUG_RATIO } from "@/config";
import type { AllocatedIssue, Bucket, ClassifiedIssue, ConfirmSelection, PreviewResult } from "@/types";
import styles from "./ReviewPanel.module.css";

function formatPts(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

interface ReviewIssue {
  number: number;
  title: string;
  html_url: string;
  points: number;
  bucket: Bucket;
  inSprint: boolean;
}

function toReviewIssues(preview: PreviewResult): ReviewIssue[] {
  const selected: ReviewIssue[] = preview.selected.map((issue: AllocatedIssue) => ({
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    points: issue.classification.points,
    bucket: issue.bucket,
    inSprint: true,
  }));
  const unselected: ReviewIssue[] = preview.unselected.map((issue: ClassifiedIssue) => ({
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    points: issue.classification.points,
    bucket: issue.classification.type,
    inSprint: false,
  }));
  return [...selected, ...unselected].sort((a, b) => a.number - b.number);
}

export default function ReviewPanel({
  preview,
  defaultMilestoneTitle,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: PreviewResult;
  defaultMilestoneTitle: string;
  busy: boolean;
  onConfirm: (selected: ConfirmSelection[], milestoneTitle: string, totals: PreviewResult["totals"]) => void;
  onCancel: () => void;
}) {
  const [issues, setIssues] = useState<ReviewIssue[]>(() => toReviewIssues(preview));
  const [milestoneTitle, setMilestoneTitle] = useState(defaultMilestoneTitle);

  const totals = useMemo(() => {
    const selected = issues.filter((i) => i.inSprint);
    return computeTotals(
      selected.map((i) => ({ bucket: i.bucket, points: i.points })),
      { capacityPoints: preview.totals.capacity }
    );
  }, [issues, preview.totals.capacity]);

  const capacity = preview.totals.capacity;
  const overCapacity = totals.totalPointsUsed > capacity;
  // Split the bar against whichever is smaller so a toggled-on overage never
  // overflows the track — extent is shown as text instead (see CLAUDE.md /
  // issue #28 "Capacity bar can visually overflow").
  const barBase = overCapacity ? totals.totalPointsUsed : capacity;
  const featurePct = barBase > 0 ? (totals.featurePointsUsed / barBase) * 100 : 0;
  const bugPct = barBase > 0 ? (totals.bugPointsUsed / barBase) * 100 : 0;

  const featureBudget = capacity * FEATURE_RATIO;
  const bugBudget = capacity * BUG_RATIO;
  const features = issues.filter((i) => i.bucket === "feature");
  const bugs = issues.filter((i) => i.bucket === "bug");

  function toggle(number: number) {
    setIssues((prev) =>
      prev.map((issue) => (issue.number === number ? { ...issue, inSprint: !issue.inSprint } : issue))
    );
  }

  function handleConfirm() {
    const selected: ConfirmSelection[] = issues
      .filter((i) => i.inSprint)
      .map((i) => ({ issueNumber: i.number, bucket: i.bucket }));
    onConfirm(selected, milestoneTitle, totals);
  }

  const inSprintCount = issues.filter((i) => i.inSprint).length;

  function renderGroup(label: string, groupIssues: ReviewIssue[], used: number, budget: number) {
    if (groupIssues.length === 0) return null;
    return (
      <div className={styles.group}>
        <div className={styles.groupHeader}>
          <span className={styles.groupTitle}>{label}</span>
          <span className={styles.groupMeta}>
            {formatPts(used)} / {formatPts(budget)} pts budget
          </span>
        </div>
        <ul className={styles.list}>
          {groupIssues.map((issue) => (
            <li key={issue.number} className={`${styles.item} ${issue.inSprint ? styles.itemIn : ""}`}>
              <label className={styles.itemLabel}>
                <input
                  type="checkbox"
                  checked={issue.inSprint}
                  onChange={() => toggle(issue.number)}
                  disabled={busy}
                />
                <span className={styles.issueNumber}>#{issue.number}</span>
                <a
                  className={styles.issueTitle}
                  href={issue.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {issue.title}
                </a>
                <span className={styles.points}>{issue.points} pts</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.titleRow}>
        <label className={styles.titleLabel} htmlFor="milestone-title">
          Milestone title
        </label>
        <input
          id="milestone-title"
          className={styles.titleInput}
          value={milestoneTitle}
          onChange={(e) => setMilestoneTitle(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className={styles.capacity}>
        <div className={styles.capacityHeader}>
          <span className={styles.capacityTotals}>
            {formatPts(totals.totalPointsUsed)} / {formatPts(capacity)} pts — {inSprintCount} issue
            {inSprintCount === 1 ? "" : "s"}
          </span>
          {overCapacity && (
            <span className={styles.overCapacity}>
              +{formatPts(totals.totalPointsUsed - capacity)} over capacity
            </span>
          )}
        </div>
        <div className={styles.capacityBar}>
          <span className={styles.barFeature} style={{ width: `${featurePct}%` }} />
          <span className={styles.barBug} style={{ width: `${bugPct}%` }} />
        </div>
        <span className={styles.hint}>Toggle issues to adapt the sprint before writing to GitHub.</span>
      </div>

      {preview.consolidated.length > 0 && (
        <p className={styles.consolidatedNote}>
          {preview.consolidated.length} duplicate issue{preview.consolidated.length === 1 ? "" : "s"} excluded
          from consideration.
        </p>
      )}

      {renderGroup("Features", features, totals.featurePointsUsed, featureBudget)}
      {renderGroup("Bugs", bugs, totals.bugPointsUsed, bugBudget)}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.confirmButton}
          onClick={handleConfirm}
          disabled={busy || inSprintCount === 0}
          aria-busy={busy}
        >
          {busy ? "Writing…" : "Confirm & write to GitHub"}
        </button>
      </div>
    </div>
  );
}
