"use client";

import type { DragEvent } from "react";
import styles from "./TicketCard.module.css";
import { STATUS_IN_PROGRESS_LABEL, STATUS_TODO_LABEL } from "@/config";
import { contrastTextColor, pickTypeLabel } from "@/lib/labels";
import type { BoardIssue } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TicketCard({
  issue,
  onDragEnd,
}: {
  issue: BoardIssue;
  onDragEnd: () => void;
}) {
  const visibleLabels = issue.labels.filter(
    (label) => label !== STATUS_TODO_LABEL && label !== STATUS_IN_PROGRESS_LABEL
  );
  const typeLabel = pickTypeLabel(visibleLabels);
  const otherLabels = visibleLabels.filter((label) => label !== typeLabel);
  const typeColor = typeLabel ? issue.labelColors?.[typeLabel] : undefined;

  function handleDragStart(event: DragEvent<HTMLLIElement>) {
    event.dataTransfer.setData("text/plain", String(issue.number));
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <li
      className={styles.card}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
    >
      <a className={styles.title} href={issue.html_url} target="_blank" rel="noopener noreferrer">
        <span className={styles.number}>#{issue.number}</span>
        {issue.title}
      </a>
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
              <span key={label} className={styles.label}>
                {color && <span className={styles.labelDot} style={{ background: `#${color}` }} />}
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
    </li>
  );
}
