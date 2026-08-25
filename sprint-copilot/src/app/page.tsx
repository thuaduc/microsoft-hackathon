"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import RunButton from "@/components/RunButton";
import ResultView from "@/components/ResultView";
import BacklogList from "@/components/BacklogList";
import type { GitHubIssue, SprintRunResult } from "@/types";

type Status = "idle" | "loading" | "done" | "error";
type BacklogStatus = "loading" | "done" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SprintRunResult | null>(null);

  const [backlogStatus, setBacklogStatus] = useState<BacklogStatus>("loading");
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [backlogError, setBacklogError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    async function loadBacklog() {
      try {
        const res = await fetch("/api/issues");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setBacklogError(data.error ?? "Request failed.");
          setBacklogStatus("error");
          return;
        }
        setIssues(data.issues);
        setBacklogStatus("done");
      } catch (err) {
        if (cancelled) return;
        setBacklogError(err instanceof Error ? err.message : "Network request failed.");
        setBacklogStatus("error");
      }
    }
    loadBacklog();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRun() {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data: SprintRunResult = await res.json();
      setResult(data);
      setStatus(data.ok ? "done" : "error");
    } catch (err) {
      setResult({
        ok: false,
        error: {
          stage: "fetch",
          message: err instanceof Error ? err.message : "Network request failed.",
        },
      });
      setStatus("error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <main className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Sprint Co-Pilot</span>
          <h1 className={styles.headline}>Plan the next sprint in one click.</h1>
          <p className={styles.subhead}>
            Reads your open issues, classifies feature work from bugs, balances
            the backlog against team capacity, and writes the result straight to
            GitHub — milestone, sub-issues, and labels included.
          </p>
        </header>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Backlog</h2>
            {backlogStatus === "done" && (
              <span className={styles.panelMeta}>{issues.length} open</span>
            )}
          </div>
          <BacklogList status={backlogStatus} issues={issues} error={backlogError} />
        </div>

        <div className={styles.panel}>
          <RunButton status={status} onClick={handleRun} />
          {result && <ResultView result={result} />}
        </div>
      </main>
    </div>
  );
}
