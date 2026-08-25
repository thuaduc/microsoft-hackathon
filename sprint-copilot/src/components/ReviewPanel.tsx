"use client";

import { useMemo, useState } from "react";
import { computeTotals } from "@/lib/allocation/allocate";
import { computeBoardStatus } from "@/lib/board/status";
import { contrastTextColor, filterStatusLabels } from "@/lib/labels";
import TicketDetailModal from "./TicketDetailModal";
import type {
  AllocatedIssue,
  BoardIssue,
  BoardStatus,
  Bucket,
  ClassifiedIssue,
  ConfirmSelection,
  ConsolidatedEntry,
  GitHubIssue,
  PreviewResult,
} from "@/types";
import styles from "./ReviewPanel.module.css";

function formatPts(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

type ActionStatus = "idle" | "loading" | "done" | "error";

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed.";
}

// Extends the full GitHubIssue (not just a display-friendly subset) so a
// row's issue can be handed straight to TicketDetailModal — same component
// the Kanban board uses — without a second fetch. status is computed once
// here via the same shared computeBoardStatus() the board itself uses.
interface ReviewIssue extends GitHubIssue {
  status: BoardStatus;
  points: number;
  bucket: Bucket;
  inSprint: boolean;
  carriedOverFromMilestone?: string;
  possiblyStaleReason: string | null;
  matchesSprintFocus: boolean;
}

function toReviewIssues(preview: PreviewResult): ReviewIssue[] {
  const selected: ReviewIssue[] = preview.selected.map((issue: AllocatedIssue) => ({
    ...issue,
    status: computeBoardStatus(issue),
    points: issue.classification.points,
    bucket: issue.bucket,
    inSprint: true,
    carriedOverFromMilestone: issue.carriedOverFromMilestone,
    possiblyStaleReason: issue.classification.possibly_stale_reason,
    matchesSprintFocus: issue.classification.matches_sprint_focus,
  }));
  const unselected: ReviewIssue[] = preview.unselected.map((issue: ClassifiedIssue) => ({
    ...issue,
    status: computeBoardStatus(issue),
    points: issue.classification.points,
    bucket: issue.classification.type,
    inSprint: false,
    carriedOverFromMilestone: issue.carriedOverFromMilestone,
    possiblyStaleReason: issue.classification.possibly_stale_reason,
    matchesSprintFocus: issue.classification.matches_sprint_focus,
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
  // Immediate GitHub writes, unlike the rest of this screen (which only
  // writes on Confirm) — the review checklist is unaffected by these
  // besides possibly-stale issues getting deselected once closed (see
  // handleCloseOutdated), since they'd otherwise still get milestoned.
  const [duplicateActions, setDuplicateActions] = useState<Record<number, ActionStatus>>({});
  const [staleActions, setStaleActions] = useState<Record<number, ActionStatus>>({});
  const [expandedStale, setExpandedStale] = useState<Set<number>>(new Set());
  // Ticket details open in-place, right here — not by navigating to the
  // board (that used to unmount this whole page, losing the in-progress
  // review). Same TicketDetailModal component the board itself uses.
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);

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

  function toggleStaleReason(number: number) {
    setExpandedStale((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }

  async function handleConsolidate(entry: ConsolidatedEntry) {
    const issueNumber = entry.issue.number;
    setDuplicateActions((prev) => ({ ...prev, [issueNumber]: "loading" }));
    try {
      const res = await fetch(`/api/board/${issueNumber}/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateOfIssueNumber: entry.duplicateOfIssue.number }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Request failed.");
      setDuplicateActions((prev) => ({ ...prev, [issueNumber]: "done" }));
    } catch (err) {
      setDuplicateActions((prev) => ({ ...prev, [issueNumber]: "error" }));
      console.error(`Failed to consolidate #${issueNumber}:`, message(err));
    }
  }

  async function handleCloseOutdated(issueNumber: number) {
    setStaleActions((prev) => ({ ...prev, [issueNumber]: "loading" }));
    try {
      const res = await fetch(`/api/board/${issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Request failed.");
      setStaleActions((prev) => ({ ...prev, [issueNumber]: "done" }));
      // It's now closed on GitHub — don't let it still get milestoned/labeled
      // on Confirm just because it was checked before you closed it here.
      setIssues((prev) =>
        prev.map((issue) => (issue.number === issueNumber ? { ...issue, inSprint: false } : issue))
      );
    } catch (err) {
      setStaleActions((prev) => ({ ...prev, [issueNumber]: "error" }));
      console.error(`Failed to close #${issueNumber}:`, message(err));
    }
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
                    <button
                      type="button"
                      className={styles.issueTitle}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDetailIssue(issue);
                      }}
                    >
                      {issue.title}
                    </button>
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
                    {issue.matchesSprintFocus && (
                      <span
                        className={styles.focusBadge}
                        title="Matches this sprint's focus — preferred over smaller non-matching issues"
                      >
                        focus
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

      <div className={styles.columns}>
        {labelGroups.map(([label, groupIssues]) => renderColumn(label, groupIssues))}
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
                {preview.consolidated.map((entry) => {
                  const status = duplicateActions[entry.issue.number] ?? "idle";
                  return (
                    <li key={entry.issue.number} className={styles.duplicateItem}>
                      <span className={styles.issueNumber}>#{entry.issue.number}</span>
                      <button
                        type="button"
                        className={styles.issueTitle}
                        onClick={() =>
                          setDetailIssue({ ...entry.issue, status: computeBoardStatus(entry.issue) })
                        }
                      >
                        {entry.issue.title}
                      </button>
                      <span className={styles.duplicateOfNote}>
                        duplicate of{" "}
                        <button
                          type="button"
                          className={styles.duplicateOfLink}
                          onClick={() =>
                            setDetailIssue({
                              ...entry.duplicateOfIssue,
                              status: computeBoardStatus(entry.duplicateOfIssue),
                            })
                          }
                        >
                          #{entry.duplicateOfIssue.number} {entry.duplicateOfIssue.title}
                        </button>
                      </span>
                      {status === "done" ? (
                        <span className={styles.flagActionDone}>closed ✓</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.flagActionButton}
                          onClick={() => handleConsolidate(entry)}
                          disabled={status === "loading"}
                        >
                          {status === "loading" ? "Closing…" : status === "error" ? "Retry" : "Consolidate"}
                        </button>
                      )}
                    </li>
                  );
                })}
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
                {staleIssues.map((issue) => {
                  const status = staleActions[issue.number] ?? "idle";
                  const showReason = expandedStale.has(issue.number);
                  return (
                    <li key={issue.number} className={styles.duplicateItem}>
                      <span className={styles.issueNumber}>#{issue.number}</span>
                      <button
                        type="button"
                        className={styles.issueTitle}
                        onClick={() => setDetailIssue(issue)}
                      >
                        {issue.title}
                      </button>
                      <span className={styles.staleViewWrap}>
                        <button
                          type="button"
                          className={styles.staleViewButton}
                          onClick={() => toggleStaleReason(issue.number)}
                          aria-expanded={showReason}
                        >
                          view →
                        </button>
                        {showReason && (
                          <div className={styles.staleReasonPopover} role="tooltip">
                            {issue.possiblyStaleReason}
                          </div>
                        )}
                      </span>
                      {status === "done" ? (
                        <span className={styles.flagActionDone}>closed ✓</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.flagActionButton}
                          onClick={() => handleCloseOutdated(issue.number)}
                          disabled={status === "loading"}
                        >
                          {status === "loading" ? "Closing…" : status === "error" ? "Retry" : "Close"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

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

      {detailIssue && <TicketDetailModal issue={detailIssue} onClose={() => setDetailIssue(null)} />}
    </div>
  );
}
