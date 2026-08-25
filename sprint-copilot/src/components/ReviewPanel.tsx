"use client";

import { useMemo, useState } from "react";
import { computeTotals } from "@/lib/allocation/allocate";
import { contrastTextColor, filterStatusLabels } from "@/lib/labels";
import type {
  AllocatedIssue,
  Bucket,
  ClassifiedIssue,
  ConfirmSelection,
  ConsolidatedEntry,
  PreviewResult,
} from "@/types";
import styles from "./ReviewPanel.module.css";

function formatPts(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

// Same repo, so the canonical issue's URL is the excluded issue's URL with
// the number swapped — avoids threading a second URL through the whole
// consolidate/preview pipeline just for this link.
function duplicateOfUrl(entry: ConsolidatedEntry): string {
  return entry.issueUrl.replace(/\/issues\/\d+$/, `/issues/${entry.duplicateOfIssueNumber}`);
}

interface ReviewIssue {
  number: number;
  title: string;
  html_url: string;
  points: number;
  bucket: Bucket;
  labels: string[];
  labelColors?: Record<string, string>;
  inSprint: boolean;
  carriedOverFromMilestone?: string;
  possiblyStaleReason: string | null;
}

function toReviewIssues(preview: PreviewResult): ReviewIssue[] {
  const selected: ReviewIssue[] = preview.selected.map((issue: AllocatedIssue) => ({
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    points: issue.classification.points,
    bucket: issue.bucket,
    labels: issue.labels,
    labelColors: issue.labelColors,
    inSprint: true,
    carriedOverFromMilestone: issue.carriedOverFromMilestone,
    possiblyStaleReason: issue.classification.possibly_stale_reason,
  }));
  const unselected: ReviewIssue[] = preview.unselected.map((issue: ClassifiedIssue) => ({
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    points: issue.classification.points,
    bucket: issue.classification.type,
    labels: issue.labels,
    labelColors: issue.labelColors,
    inSprint: false,
    carriedOverFromMilestone: issue.carriedOverFromMilestone,
    possiblyStaleReason: issue.classification.possibly_stale_reason,
  }));
  return [...selected, ...unselected].sort((a, b) => a.number - b.number);
}

// One column per distinct primary (first) label found on the previewed
// issues — real GitHub labels (bug, enhancement, ...), not the algorithm's
// own feature/bug bucket. Order follows each label's first appearance in
// the (already number-sorted) issue list; unlabeled issues get their own
// trailing column.
const UNLABELED = "Unlabeled";

function groupByLabel(issues: ReviewIssue[]): Array<[string, ReviewIssue[]]> {
  const groups = new Map<string, ReviewIssue[]>();
  for (const issue of issues) {
    const key = filterStatusLabels(issue.labels)[0] ?? UNLABELED;
    const group = groups.get(key);
    if (group) {
      group.push(issue);
    } else {
      groups.set(key, [issue]);
    }
  }
  const entries = [...groups.entries()];
  entries.sort(([a], [b]) => (a === UNLABELED ? 1 : b === UNLABELED ? -1 : 0));
  return entries;
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

  const labelGroups = useMemo(() => groupByLabel(issues), [issues]);
  const staleIssues = useMemo(() => issues.filter((i) => i.possiblyStaleReason), [issues]);

  function toggle(number: number) {
    setIssues((prev) =>
      prev.map((issue) => (issue.number === number ? { ...issue, inSprint: !issue.inSprint } : issue))
    );
  }

  function handleConfirm() {
    const selected: ConfirmSelection[] = issues
      .filter((i) => i.inSprint)
      .map((i) => ({ issueNumber: i.number, bucket: i.bucket, labels: i.labels }));
    onConfirm(selected, milestoneTitle, totals);
  }

  const inSprintCount = issues.filter((i) => i.inSprint).length;

  function renderColumn(label: string, groupIssues: ReviewIssue[]) {
    const color = groupIssues[0]?.labelColors?.[label];
    const points = groupIssues.reduce((sum, i) => sum + i.points, 0);
    return (
      <div key={label} className={styles.column}>
        <div className={styles.columnHeader}>
          <span className={styles.columnTitle}>
            {color ? (
              <span
                className={styles.columnLabelBadge}
                style={{ background: `#${color}`, color: contrastTextColor(color) }}
              >
                {label}
              </span>
            ) : (
              label
            )}
          </span>
          <span className={styles.columnMeta}>
            {formatPts(points)} pts · {groupIssues.length}
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
                <div className={styles.itemBody}>
                  <div className={styles.itemTitleRow}>
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
                  </div>
                  <div className={styles.itemMetaRow}>
                    {issue.carriedOverFromMilestone && (
                      <span
                        className={styles.carryOverBadge}
                        title={`Still open from "${issue.carriedOverFromMilestone}"`}
                      >
                        carried over
                      </span>
                    )}
                    <span
                      className={`${styles.bucketDot} ${
                        issue.bucket === "feature" ? styles.bucketFeature : styles.bucketBug
                      }`}
                      title={issue.bucket}
                      aria-hidden="true"
                    />
                    <span className={styles.points}>{issue.points} pts</span>
                  </div>
                </div>
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
      </div>

      {(preview.consolidated.length > 0 || staleIssues.length > 0) && (
        <div className={styles.flagsRow}>
          {preview.consolidated.length > 0 && (
            <div className={styles.duplicates}>
              <div className={styles.duplicatesHeader}>
                <span className={styles.duplicatesTitle}>Duplicates excluded</span>
                <span className={styles.columnMeta}>{preview.consolidated.length}</span>
              </div>
              <ul className={styles.duplicatesList}>
                {preview.consolidated.map((entry) => (
                  <li key={entry.issueNumber} className={styles.duplicateItem}>
                    <span className={styles.issueNumber}>#{entry.issueNumber}</span>
                    <a
                      className={styles.issueTitle}
                      href={entry.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {entry.issueTitle}
                    </a>
                    <span className={styles.duplicateOfNote}>
                      duplicate of{" "}
                      <a href={duplicateOfUrl(entry)} target="_blank" rel="noopener noreferrer">
                        #{entry.duplicateOfIssueNumber} {entry.duplicateOfTitle}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {staleIssues.length > 0 && (
            <div className={styles.duplicates}>
              <div className={styles.duplicatesHeader}>
                <span className={styles.duplicatesTitle}>Possibly outdated</span>
                <span className={styles.columnMeta}>{staleIssues.length}</span>
              </div>
              <ul className={styles.duplicatesList}>
                {staleIssues.map((issue) => (
                  <li key={issue.number} className={styles.duplicateItem}>
                    <span className={styles.issueNumber}>#{issue.number}</span>
                    <a
                      className={styles.issueTitle}
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {issue.title}
                    </a>
                    <span className={styles.duplicateOfNote}>{issue.possiblyStaleReason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className={styles.columns}>
        {labelGroups.map(([label, groupIssues]) => renderColumn(label, groupIssues))}
      </div>

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
