"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import type { BoardIssue } from "@/types";
import { buildSprintHistory, type SprintMilestone } from "@/lib/history/sprintHistory";

type LoadStatus = "loading" | "done" | "error";

interface BoardPayload {
  issues: BoardIssue[];
  milestones: SprintMilestone[];
  error?: string;
}

export default function SprintHistoryPage() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [milestones, setMilestones] = useState<SprintMilestone[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/board");
        const data: BoardPayload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Request failed.");
          setStatus("error");
          return;
        }
        setIssues(data.issues);
        setMilestones(data.milestones);
        setStatus("done");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network request failed.");
        setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const history = useMemo(() => buildSprintHistory(milestones, issues), [milestones, issues]);

  if (status === "loading") {
    return (
      <main className={styles.page}>
        <p className={styles.status}>Loading sprint history…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.page}>
        <p className={styles.statusError}>
          Couldn&apos;t load sprint history{error ? ` — ${error}` : "."}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headline}>Sprint history</h1>
        <p className={styles.subtitle}>Review each sprint milestone and how it ended.</p>
      </header>

      {history.length === 0 ? (
        <p className={styles.empty}>No sprint milestones yet.</p>
      ) : (
        <ul className={styles.list}>
          {history.map((entry) => (
            <li key={entry.milestone.number} className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{entry.milestone.title}</h2>
                <span className={styles.rate}>{entry.completionRate}% completed</span>
              </div>
              <dl className={styles.metrics}>
                <div>
                  <dt>Total</dt>
                  <dd>{entry.totalIssues}</dd>
                </div>
                <div>
                  <dt>Done</dt>
                  <dd>{entry.completedIssues}</dd>
                </div>
                <div>
                  <dt>Cancelled</dt>
                  <dd>{entry.cancelledIssues}</dd>
                </div>
                <div>
                  <dt>Carryover</dt>
                  <dd>{entry.openIssues}</dd>
                </div>
              </dl>
              {entry.milestone.html_url && (
                <a
                  className={styles.link}
                  href={entry.milestone.html_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open milestone on GitHub
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
