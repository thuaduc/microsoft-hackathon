"use client";

import styles from "./RunButton.module.css";

type Status = "idle" | "loading" | "done" | "error";

export default function RunButton({
  status,
  onClick,
}: {
  status: Status;
  onClick: () => void;
}) {
  const isLoading = status === "loading";
  const label = status === "idle" ? "Run sprint" : isLoading ? "Running" : "Run again";

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
          Runs the full pipeline in one shot — no confirmation step.
        </span>
      )}
    </div>
  );
}
