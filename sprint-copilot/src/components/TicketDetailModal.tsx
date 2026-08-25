"use client";

import { useEffect, useState } from "react";
import styles from "./TicketDetailModal.module.css";
import { STATUS_IN_PROGRESS_LABEL, STATUS_TODO_LABEL } from "@/config";
import { contrastTextColor, pickTypeLabel } from "@/lib/labels";
import type { BoardIssue, LinkedPullRequest } from "@/types";

const STATUS_LABEL: Record<BoardIssue["status"], string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancel",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function prBadgeLabel(pr: LinkedPullRequest): string {
  if (pr.merged) return "PR merged";
  return pr.state === "open" ? "PR open" : "PR closed";
}

// Read-only — status changes still happen by dragging the card or the
// "Do with Copilot" button, not from here. Fetches its own linked-PR badge
// on open (independent of the card's own todo/in_progress-only fetch),
// since a merged PR is still worth showing for a Done ticket.
export default function TicketDetailModal({
  issue,
  onClose,
}: {
  issue: BoardIssue;
  onClose: () => void;
}) {
  const visibleLabels = issue.labels.filter(
    (label) => label !== STATUS_TODO_LABEL && label !== STATUS_IN_PROGRESS_LABEL
  );
  const typeLabel = pickTypeLabel(visibleLabels);
  const otherLabels = visibleLabels.filter((label) => label !== typeLabel);
  const typeColor = typeLabel ? issue.labelColors?.[typeLabel] : undefined;

  const [linkedPullRequest, setLinkedPullRequest] = useState<LinkedPullRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/board/${issue.number}/pull-request`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.pullRequest) setLinkedPullRequest(data.pullRequest);
      })
      .catch(() => {
        // Best-effort — no badge if the lookup fails.
      });
    return () => {
      cancelled = true;
    };
  }, [issue.number]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`#${issue.number} ${issue.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <span className={styles.number}>#{issue.number}</span>
            <h2 className={styles.title}>{issue.title}</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.badgeRow}>
          <span className={styles.statusBadge} data-status={issue.status}>
            {STATUS_LABEL[issue.status]}
          </span>
          {typeLabel && (
            <span
              className={styles.typeLabel}
              style={
                typeColor
                  ? { background: `#${typeColor}`, color: contrastTextColor(typeColor) }
                  : undefined
              }
            >
              {typeLabel}
            </span>
          )}
          {otherLabels.map((label) => {
            const color = issue.labelColors?.[label];
            return (
              <span key={label} className={styles.label}>
                {color && <span className={styles.labelDot} style={{ background: `#${color}` }} />}
                {label}
              </span>
            );
          })}
          {linkedPullRequest && (
            <a
              className={
                linkedPullRequest.merged
                  ? `${styles.prBadge} ${styles.prBadgeMerged}`
                  : styles.prBadge
              }
              href={linkedPullRequest.html_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {prBadgeLabel(linkedPullRequest)}
            </a>
          )}
        </div>

        {issue.body && <p className={styles.body}>{issue.body}</p>}

        <dl className={styles.metaGrid}>
          <dt>Created</dt>
          <dd>{formatDate(issue.created_at)}</dd>
          {issue.closed_at && (
            <>
              <dt>Closed</dt>
              <dd>{formatDate(issue.closed_at)}</dd>
            </>
          )}
          {issue.milestone && (
            <>
              <dt>Sprint</dt>
              <dd>{issue.milestone.title}</dd>
            </>
          )}
          {issue.assignees.length > 0 && (
            <>
              <dt>Assignees</dt>
              <dd>{issue.assignees.map((a) => a.login).join(", ")}</dd>
            </>
          )}
        </dl>

        <a className={styles.githubLink} href={issue.html_url} target="_blank" rel="noopener noreferrer">
          Open on GitHub ↗
        </a>
      </div>
    </div>
  );
}
