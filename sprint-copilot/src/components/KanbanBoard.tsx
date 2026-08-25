"use client";

import { useEffect, useState, type DragEvent } from "react";
import styles from "./KanbanBoard.module.css";
import TicketCard from "./TicketCard";
import type { BoardIssue, BoardStatus } from "@/types";

type LoadStatus = "loading" | "done" | "error";

interface Milestone {
  number: number;
  title: string;
}

const COLUMNS: { key: BoardStatus; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancel" },
];

// Backlog is the pool sprints get built from, so it's always shown in full;
// the other columns scope to whichever sprint is selected in the nav.
function isIssueInColumn(issue: BoardIssue, columnKey: BoardStatus, selectedMilestone: number | null) {
  if (issue.status !== columnKey) return false;
  if (columnKey === "backlog") return true;
  return issue.milestone?.number === selectedMilestone;
}

export default function KanbanBoard() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BoardStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/board");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? "Request failed.");
          setLoadStatus("error");
          return;
        }
        setIssues(data.issues);
        setMilestones(data.milestones);
        setSelectedMilestone(data.milestones.at(-1)?.number ?? null);
        setLoadStatus("done");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Network request failed.");
        setLoadStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedIndex = milestones.findIndex((m) => m.number === selectedMilestone);
  const selectedSprint = selectedIndex >= 0 ? milestones[selectedIndex] : null;

  function goToPreviousSprint() {
    if (selectedIndex > 0) setSelectedMilestone(milestones[selectedIndex - 1].number);
  }

  function goToNextSprint() {
    if (selectedIndex >= 0 && selectedIndex < milestones.length - 1) {
      setSelectedMilestone(milestones[selectedIndex + 1].number);
    }
  }

  // Optimistic: the card moves immediately; on failure it snaps back and
  // an inline message shows why — no retries, matching the app's minimal
  // error-handling bar elsewhere.
  async function handleStatusChange(issueNumber: number, status: BoardStatus) {
    const previous = issues;
    setMoveError(null);
    setIssues((current) =>
      current.map((issue) => (issue.number === issueNumber ? { ...issue, status } : issue))
    );

    try {
      const res = await fetch(`/api/board/${issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Request failed.");
      }
    } catch (err) {
      setIssues(previous);
      setMoveError(
        `Couldn't move #${issueNumber} — ${err instanceof Error ? err.message : "request failed."}`
      );
    }
  }

  function handleDragOver(column: BoardStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverColumn(column);
  }

  function handleDrop(column: BoardStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverColumn(null);
    const issueNumber = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(issueNumber)) {
      handleStatusChange(issueNumber, column);
    }
  }

  if (loadStatus === "loading") {
    return <p className={styles.status}>Loading board…</p>;
  }

  if (loadStatus === "error") {
    return (
      <p className={styles.statusError}>
        Couldn&apos;t load the board{loadError ? ` — ${loadError}` : "."}
      </p>
    );
  }

  return (
    <div className={styles.board}>
      <div className={styles.sprintNav}>
        <button
          type="button"
          className={styles.sprintNavButton}
          onClick={goToPreviousSprint}
          disabled={selectedIndex <= 0}
          aria-label="Previous sprint"
        >
          ‹
        </button>
        <span className={styles.sprintNavLabel}>
          {selectedSprint ? `Sprint ${selectedIndex + 1}` : "No sprints yet"}
        </span>
        <button
          type="button"
          className={styles.sprintNavButton}
          onClick={goToNextSprint}
          disabled={selectedIndex < 0 || selectedIndex >= milestones.length - 1}
          aria-label="Next sprint"
        >
          ›
        </button>
      </div>
      {moveError && <p className={styles.moveError}>{moveError}</p>}
      <div className={styles.columns}>
        {COLUMNS.map((column) => {
          const columnIssues = issues.filter((issue) => isIssueInColumn(issue, column.key, selectedMilestone));
          const isDragOver = dragOverColumn === column.key;
          return (
            <div
              key={column.key}
              className={isDragOver ? `${styles.column} ${styles.columnDragOver}` : styles.column}
              data-status={column.key}
              onDragOver={(event) => handleDragOver(column.key, event)}
              onDragLeave={() =>
                setDragOverColumn((current) => (current === column.key ? null : current))
              }
              onDrop={(event) => handleDrop(column.key, event)}
            >
              <div className={styles.columnHeader}>
                <h2 className={styles.columnTitle}>{column.label}</h2>
                <span className={styles.columnCount}>{columnIssues.length}</span>
              </div>
              <ul className={styles.cardList}>
                {columnIssues.map((issue) => (
                  <TicketCard
                    key={issue.number}
                    issue={issue}
                    onDragEnd={() => setDragOverColumn(null)}
                  />
                ))}
                {columnIssues.length === 0 && <li className={styles.empty}>No issues</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
