"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import styles from "./KanbanBoard.module.css";
import TicketCard from "./TicketCard";
import TicketDetailModal from "./TicketDetailModal";
import { isIssueInColumn } from "@/lib/board/status";
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

export default function KanbanBoard() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BoardStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkedIssue, setLinkedIssue] = useState<BoardIssue | null>(null);

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

        // Deep link from other screens (e.g. the sprint-review list) — open
        // that ticket's detail in-app instead of them linking to GitHub.
        const linkedNumber = Number(new URLSearchParams(window.location.search).get("issue"));
        if (linkedNumber) {
          const match = (data.issues as BoardIssue[]).find((issue) => issue.number === linkedNumber);
          if (match) setLinkedIssue(match);
        }
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

  const filteredIssues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return issues;
    return issues.filter((issue) => {
      const haystack = `${issue.title} ${issue.body ?? ""} ${issue.labels.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [issues, searchQuery]);

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
  //
  // Dropping a backlog (milestone-less) issue into a sprint-scoped column
  // assigns it to the sprint currently being viewed — otherwise it would
  // vanish, matching neither backlog nor the newly-selected sprint.
  async function handleStatusChange(issueNumber: number, status: BoardStatus) {
    const previous = issues;
    const milestoneNumber = status !== "backlog" && selectedMilestone !== null ? selectedMilestone : undefined;
    const milestone = milestoneNumber !== undefined ? (selectedSprint ?? null) : undefined;
    setMoveError(null);
    setIssues((current) =>
      current.map((issue) =>
        issue.number === issueNumber
          ? { ...issue, status, ...(milestone !== undefined ? { milestone } : {}) }
          : issue
      )
    );

    try {
      const res = await fetch(`/api/board/${issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(milestoneNumber !== undefined ? { milestoneNumber } : {}) }),
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

  // Assigns Copilot server-side, then reflects the resulting In Progress
  // move locally — same error-surfacing pattern as handleStatusChange, no
  // optimistic move here since assigning Copilot is the thing that must
  // actually succeed first.
  async function handleAssignCopilot(issueNumber: number) {
    setMoveError(null);
    try {
      const res = await fetch(`/api/board/${issueNumber}/copilot`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Request failed.");
      }
      setIssues((current) =>
        current.map((issue) =>
          issue.number === issueNumber ? { ...issue, status: "in_progress" } : issue
        )
      );
    } catch (err) {
      setMoveError(
        `Couldn't assign Copilot to #${issueNumber} — ${err instanceof Error ? err.message : "request failed."}`
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
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search issues…"
            className={styles.searchInput}
            aria-label="Search issues"
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
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
      </div>
      {moveError && <p className={styles.moveError}>{moveError}</p>}
      <div className={styles.columns}>
        {COLUMNS.map((column) => {
          const columnIssues = filteredIssues.filter((issue) =>
            isIssueInColumn(issue, column.key, selectedMilestone)
          );
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
                    onAssignCopilot={handleAssignCopilot}
                  />
                ))}
                {columnIssues.length === 0 && <li className={styles.empty}>No issues</li>}
              </ul>
            </div>
          );
        })}
      </div>
      {linkedIssue && <TicketDetailModal issue={linkedIssue} onClose={() => setLinkedIssue(null)} />}
    </div>
  );
}
