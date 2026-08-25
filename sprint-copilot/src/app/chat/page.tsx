import styles from "./page.module.css";
import ChatThread from "@/components/ChatThread";

export default function ChatPage() {
  return (
    <main className={styles.page}>
      <ChatThread />
    </main>
  );
}
