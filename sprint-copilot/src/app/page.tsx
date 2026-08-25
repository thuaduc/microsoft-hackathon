import styles from "./page.module.css";
import KanbanBoard from "@/components/KanbanBoard";
import { formatSprintWeekLabel, getCurrentSprintWeek } from "@/lib/sprint/week";

export default function Home() {
  const currentWeek = formatSprintWeekLabel(getCurrentSprintWeek(new Date()));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Current Sprint · {currentWeek}</span>
        <h1 className={styles.headline}>Kanban board</h1>
        <p className={styles.subhead}>
          Every issue in the target repo, grouped by status. Drag a card to change it on GitHub.
        </p>
      </header>
      <KanbanBoard />
    </main>
  );
}
