"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Nav.module.css";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/sprint-planning", label: "Plan" },
  { href: "/chat", label: "Chat" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <span className={styles.brand}>Compass</span>
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
