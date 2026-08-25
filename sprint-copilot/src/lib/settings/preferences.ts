// Free-text team preferences from the settings page (e.g. "we prioritize
// bugs", "assign complex issues to senior devs"). Stored in localStorage,
// not a server-side database — consistent with "no database" (CLAUDE.md
// point 5), just a client-side settings cache. Read by the sprint-planning
// page and sent to /api/run/preview, which forwards it into the
// classification prompt.
const STORAGE_KEY = "sprint-copilot:team-preferences";

export function getTeamPreferences(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setTeamPreferences(value: string): void {
  window.localStorage.setItem(STORAGE_KEY, value);
}
