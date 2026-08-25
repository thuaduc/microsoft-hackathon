"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import RunButton from "@/components/RunButton";
import ResultView from "@/components/ResultView";
import ActivityLog from "@/components/ActivityLog";
import ReviewPanel from "@/components/ReviewPanel";
import { readNdjsonStream } from "@/lib/pipeline/stream";
import { getTeamPreferences } from "@/lib/settings/preferences";
import type { ConfirmSelection, PreviewResult, SprintRunResult } from "@/types";

type Status = "idle" | "previewing" | "reviewing" | "writing" | "done" | "error";

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Network request failed.";
}

export default function SprintPlanning() {
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<SprintRunResult | null>(null);
  const [nextSprintTitle, setNextSprintTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/milestones")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.milestones)) return;
        setNextSprintTitle(`Sprint ${data.milestones.length + 1}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePreview() {
    setStatus("previewing");
    setLog([]);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetch("/api/run/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamPreferences: getTeamPreferences() }),
      });
      await readNdjsonStream(res, (event) => {
        if (event.type === "log") {
          setLog((prev) => [...prev, event.message]);
        } else if (event.type === "preview") {
          setPreview(event.payload);
          setStatus("reviewing");
        } else if (event.type === "error") {
          setResult({ ok: false, error: { stage: event.stage, message: event.message } });
          setStatus("error");
        }
      });
    } catch (err) {
      setResult({ ok: false, error: { stage: "fetch", message: message(err) } });
      setStatus("error");
    }
  }

  async function handleConfirm(
    selected: ConfirmSelection[],
    milestoneTitle: string,
    totals: PreviewResult["totals"]
  ) {
    setStatus("writing");
    try {
      const res = await fetch("/api/run/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected, milestoneTitle, totals }),
      });
      await readNdjsonStream(res, (event) => {
        if (event.type === "log") {
          setLog((prev) => [...prev, event.message]);
        } else if (event.type === "result") {
          setResult(event.payload);
          setStatus("done");
        } else if (event.type === "error") {
          setResult({ ok: false, error: { stage: event.stage, message: event.message } });
          setStatus("error");
        }
      });
    } catch (err) {
      setResult({ ok: false, error: { stage: "write", message: message(err) } });
      setStatus("error");
    }
  }

  function handleCancel() {
    setStatus("idle");
    setPreview(null);
    setLog([]);
  }

  const showRunButton = status === "idle" || status === "previewing" || status === "error";
  const showReview = preview && (status === "reviewing" || status === "writing");
  const showLog = log.length > 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headline}>Plan the next sprint.</h1>
        {nextSprintTitle && <span className={styles.nextSprint}>Next sprint: {nextSprintTitle}</span>}
      </header>

      <div className={styles.panel}>
        {showRunButton && (
          <RunButton
            status={status === "previewing" ? "previewing" : status === "error" ? "error" : "idle"}
            onClick={handlePreview}
          />
        )}
        {showLog && <ActivityLog lines={log} live={status === "previewing" || status === "writing"} />}
        {showReview && (
          <ReviewPanel
            preview={preview}
            defaultMilestoneTitle={nextSprintTitle ?? "Sprint"}
            busy={status === "writing"}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
        {result && <ResultView result={result} />}
      </div>
    </main>
  );
}
