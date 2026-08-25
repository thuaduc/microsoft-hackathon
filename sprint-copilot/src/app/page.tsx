import styles from "./page.module.css";
import KanbanBoard from "@/components/KanbanBoard";

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headline}>Board</h1>
      </header>
      <KanbanBoard />
    </main>
  );
}
