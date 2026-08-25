import type { SprintRunResult } from "@/types";
import styles from "./ResultView.module.css";

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 8H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 11.5L11.5 4.5M11.5 4.5H5.5M11.5 4.5V10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STAGE_LABEL: Record<string, string> = {
  fetch: "Fetching issues",
  classify: "Classifying issues",
  allocate: "Allocating sprint",
  write: "Writing to GitHub",
};

export default function ResultView({ result }: { result: SprintRunResult }) {
  if (!result.ok) {
    const stage = result.error?.stage;
    return (
      <div className={styles.errorBox} role="alert">
        <div className={styles.errorHeader}>
          <span className={styles.errorDot} aria-hidden="true" />
          <span className={styles.errorTitle}>Couldn&apos;t finish the run</span>
        </div>
        {stage && (
          <span className={styles.stageBadge}>{STAGE_LABEL[stage] ?? stage}</span>
        )}
        <p className={styles.errorMessage}>
          {result.error?.message ?? "An unknown error interrupted the pipeline."}
        </p>
      </div>
    );
  }

  const totals = result.totals;
  const outcomes = result.writeOutcomes ?? [];
  const featurePct = totals ? Math.min(100, (totals.featurePointsUsed / totals.capacity) * 100) : 0;
  const bugPct = totals ? Math.min(100 - featurePct, (totals.bugPointsUsed / totals.capacity) * 100) : 0;

  return (
    <div className={styles.wrap}>
      {result.milestone && (
        <a
          className={styles.milestone}
          href={result.milestone.html_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.milestoneLabel}>Milestone created</span>
          <span className={styles.milestoneTitle}>
            {result.milestone.title}
            <ArrowUpRightIcon />
          </span>
        </a>
      )}

      {totals && (
        <div className={styles.capacity}>
          <div className={styles.capacityHeader}>
            <span>Capacity used</span>
            <span className={styles.capacityValue}>
              {totals.totalPointsUsed} / {totals.capacity} pts
            </span>
          </div>
          <div className={styles.track}>
            <div className={styles.fillFeature} style={{ width: `${featurePct}%` }} />
            <div className={styles.fillBug} style={{ width: `${bugPct}%` }} />
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <i className={styles.dotFeature} /> Feature {totals.featurePointsUsed} pts
            </span>
            <span className={styles.legendItem}>
              <i className={styles.dotBug} /> Bug {totals.bugPointsUsed} pts
            </span>
          </div>
        </div>
      )}

      {outcomes.length > 0 && (
        <ul className={styles.list}>
          {outcomes.map((o) => (
            <li key={o.issueNumber} className={styles.item}>
              <div className={styles.itemRow}>
                <span className={styles.issueNumber}>#{o.issueNumber}</span>
                <span
                  className={`${styles.pill} ${o.bucket === "feature" ? styles.pillFeature : styles.pillBug}`}
                >
                  {o.bucket}
                </span>
                <span
                  className={`${styles.status} ${o.milestoneAssigned ? styles.statusDone : ""}`}
                  title="Milestone assigned"
                >
                  {o.milestoneAssigned ? <CheckIcon /> : <DashIcon />} Milestone
                </span>
                <span
                  className={`${styles.status} ${o.labelsApplied ? styles.statusDone : ""}`}
                  title="Labels applied"
                >
                  {o.labelsApplied ? <CheckIcon /> : <DashIcon />} Labels
                </span>
              </div>
              {o.errors.length > 0 && (
                <p className={styles.itemError}>{o.errors.join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
