"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ActivityLog.module.css";

// Live progress while a pipeline stage streams; a collapsed history once it's
// done — by the time the review checklist appears, the log has done its job
// and shouldn't compete with it for attention.
export default function ActivityLog({ lines, live }: { lines: string[]; live: boolean }) {
  const [collapsed, setCollapsed] = useState(!live);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(!live);
  }, [live]);

  useEffect(() => {
    if (!collapsed) endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length, collapsed]);

  if (lines.length === 0) return null;

  return (
    <div className={styles.wrap} aria-live="polite">
      <button
        type="button"
        className={styles.header}
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
      >
        <span className={styles.disclosure} data-open={!collapsed} aria-hidden="true">
          ▸
        </span>
        <span className={styles.title}>Activity</span>
        <span className={styles.count}>{lines.length}</span>
        {live && (
          <span className={styles.liveDot} aria-hidden="true">
            <span className={styles.pulse} />
          </span>
        )}
      </button>
      {!collapsed && (
        <div className={styles.body}>
          {lines.map((line, i) => (
            <div key={i} className={styles.line}>
              {line}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
