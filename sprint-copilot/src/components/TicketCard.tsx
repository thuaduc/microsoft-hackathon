"use client";

import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import styles from "./TicketCard.module.css";
import TicketDetailModal from "./TicketDetailModal";
import { contrastTextColor, filterStatusLabels, pickTypeLabel } from "@/lib/labels";
import type { BoardIssue, LinkedPullRequest } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function prBadgeLabel(pr: LinkedPullRequest): string {
  if (pr.merged) return "PR merged";
  return pr.state === "open" ? "PR open" : "PR closed";
}

export default function TicketCard({
  issue,
  onDragEnd,
  onAssignCopilot,
}: {
  issue: BoardIssue;
  onDragEnd: () => void;
  onAssignCopilot: (issueNumber: number) => Promise<void>;
}) {
  const visibleLabels = filterStatusLabels(issue.labels);
  const typeLabel = pickTypeLabel(visibleLabels);
  const otherLabels = visibleLabels.filter((label) => label !== typeLabel);
  const typeColor = typeLabel ? issue.labelColors?.[typeLabel] : undefined;

  const showPullRequestBadge = issue.status === "todo" || issue.status === "in_progress";
  const showCopilotAction = issue.status === "todo";
  const [assigning, setAssigning] = useState(false);
  const [linkedPullRequest, setLinkedPullRequest] = useState<LinkedPullRequest | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!showPullRequestBadge) return;
    let cancelled = false;
    fetch(`/api/board/${issue.number}/pull-request`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.pullRequest) setLinkedPullRequest(data.pullRequest);
      })
      .catch(() => {
        // Best-effort badge — a failed lookup just means no badge shows.
      });
    return () => {
      cancelled = true;
    };
  }, [issue.number, showPullRequestBadge]);

  async function handleAssignCopilot() {
    setAssigning(true);
    try {
      await onAssignCopilot(issue.number);
    } finally {
      setAssigning(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>) {
    event.dataTransfer.setData("text/plain", String(issue.number));
    event.dataTransfer.effectAllowed = "move";
  }

  function stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <>
      <li
        className={styles.card}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={() => setShowDetail(true)}
      >
        <div className={styles.title}>
          <span className={styles.number}>#{issue.number}</span>
          {issue.title}
        </div>
      {issue.body && <p className={styles.description}>{issue.body}</p>}
      {(typeLabel || otherLabels.length > 0) && (
        <div className={styles.labels}>
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
              <span
                key={label}
                className={styles.label}
                style={color ? { background: `#${color}`, color: contrastTextColor(color) } : undefined}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
      <div className={styles.meta}>
        <span>Created {formatDate(issue.created_at)}</span>
        {issue.closed_at && <span>Closed {formatDate(issue.closed_at)}</span>}
      </div>
      {(showCopilotAction || linkedPullRequest) && (
        <div className={styles.copilotRow}>
          {showCopilotAction && (
            <button
              type="button"
              className={styles.copilotButton}
              onClick={(event) => {
                stopPropagation(event);
                handleAssignCopilot();
              }}
              disabled={assigning}
            >
              {assigning ? "Assigning…" : "Do with Copilot"}
            </button>
          )}
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
              onClick={stopPropagation}
            >
              {prBadgeLabel(linkedPullRequest)}
            </a>
          )}
        </div>
      )}
      </li>
      {showDetail && <TicketDetailModal issue={issue} onClose={() => setShowDetail(false)} />}
    </>
  );
}
