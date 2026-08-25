"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { getTeamPreferences, setTeamPreferences } from "@/lib/settings/preferences";

const EXAMPLES = [
  "We prioritize bugs over new features this sprint.",
  "Favor smaller, quick-win issues so we ship visible progress every sprint.",
  "Assign complex or architectural issues to senior devs when picking sub-issues.",
];

type SaveState = "idle" | "saved";

export default function SettingsPage() {
  const [value, setValue] = useState(() => getTeamPreferences());
  const [saveState, setSaveState] = useState<SaveState>("idle");

  function handleSave() {
    setTeamPreferences(value.trim());
    setSaveState("saved");
  }

  function handleChange(next: string) {
    setValue(next);
    setSaveState("idle");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Sprint Co-Pilot</span>
        <h1 className={styles.headline}>Settings</h1>
        <p className={styles.subhead}>
          Describe how your team likes to plan sprints, in plain words. This is sent to the
          classifier every time you preview a sprint, so it can weigh your priorities when judging
          each issue&rsquo;s type and effort.
        </p>
      </header>

      <div className={styles.panel}>
        <label className={styles.label} htmlFor="team-preferences">
          Team preferences
        </label>
        <textarea
          id="team-preferences"
          className={styles.textarea}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="e.g. We prioritize bugs over new features. Assign complex issues to senior devs."
          rows={6}
        />

        <div className={styles.examples}>
          <span className={styles.examplesLabel}>Examples</span>
          <div className={styles.exampleChips}>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className={styles.exampleChip}
                onClick={() => handleChange(value ? `${value}\n${example}` : example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <span className={styles.saveHint}>
            {saveState === "saved" ? "Saved — applied on your next preview." : "Stored in this browser only."}
          </span>
          <button type="button" className={styles.saveButton} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </main>
  );
}
