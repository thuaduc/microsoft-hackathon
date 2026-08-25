import { contrastTextColor, pickTypeLabel } from "@/lib/labels";
import type { GitHubIssue } from "@/types";
import styles from "./BacklogList.module.css";

type Status = "loading" | "done" | "error";

export default function BacklogList({
  status,
  issues,
  error,
}: {
  status: Status;
  issues: GitHubIssue[];
  error?: string;
}) {
  if (status === "loading") {
    return (
      <ul className={styles.list} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className={styles.skeletonRow}>
            <span className={styles.skeletonNumber} />
            <span className={styles.skeletonTitle} />
          </li>
        ))}
      </ul>
    );
  }

  if (status === "error") {
    return (
      <p className={styles.error}>
        Couldn&apos;t load the backlog{error ? ` — ${error}` : "."}
      </p>
    );
  }

  if (issues.length === 0) {
    return <p className={styles.empty}>No open issues — the backlog is clear.</p>;
  }

  return (
    <ul className={styles.list}>
      {issues.map((issue) => {
        const typeLabel = pickTypeLabel(issue.labels);
        const otherLabels = issue.labels.filter((label) => label !== typeLabel);
        const typeColor = typeLabel ? issue.labelColors?.[typeLabel] : undefined;

        return (
          <li key={issue.number} className={styles.row}>
            <a
              className={styles.link}
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.number}>#{issue.number}</span>
              <span className={styles.title}>{issue.title}</span>
              {(typeLabel || otherLabels.length > 0) && (
                <span className={styles.labels}>
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
                        {color && (
                          <span className={styles.labelDot} style={{ background: `#${color}` }} />
                        )}
                        {label}
                      </span>
                    );
                  })}
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
