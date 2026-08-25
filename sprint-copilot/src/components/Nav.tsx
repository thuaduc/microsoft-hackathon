"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Nav.module.css";

const LINKS = [
  { href: "/", label: "Kanban" },
  { href: "/sprint-planning", label: "Sprint Planning" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <span className={styles.brand}>Sprint Co-Pilot</span>
      <div className={styles.links}>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? styles.active : styles.link}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
