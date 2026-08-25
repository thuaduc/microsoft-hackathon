"use client";

import styles from "./RunButton.module.css";

type Status = "idle" | "previewing" | "error";

export default function RunButton({
  status,
  onClick,
}: {
  status: Status;
  onClick: () => void;
}) {
  const isLoading = status === "previewing";
  const label = status === "error" ? "Try again" : isLoading ? "Previewing" : "Preview sprint";

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.button}
        onClick={onClick}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading && <span className={styles.spinner} aria-hidden="true" />}
        {label}
      </button>
      {status === "idle" && (
        <span className={styles.hint}>
          Classifies and allocates the backlog, then lets you review and adapt
          before anything is written to GitHub.
        </span>
      )}
    </div>
  );
}
