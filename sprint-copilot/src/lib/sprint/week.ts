export interface SprintWeek {
  isoYear: number;
  isoWeek: number;
  start: Date; // Monday, local midnight
  end: Date; // Sunday, local midnight
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7; // Mon=1 .. Sun=7
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  return d;
}

// Standard ISO-8601 week: weeks run Monday-Sunday, and a week belongs to
// whichever year contains its Thursday (so late-December dates can fall in
// week 1 of the following year, and early-January dates can fall in the
// last week of the previous year).
export function getCurrentSprintWeek(now: Date): SprintWeek {
  const start = startOfIsoWeek(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const thursday = new Date(start);
  thursday.setDate(start.getDate() + 3);
  const isoYear = thursday.getFullYear();

  const jan1 = new Date(isoYear, 0, 1);
  const jan1Day = jan1.getDay() || 7;
  const week1Monday = new Date(jan1);
  week1Monday.setDate(jan1.getDate() + (jan1Day <= 4 ? 1 - jan1Day : 8 - jan1Day));

  const isoWeek = Math.round((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;

  return { isoYear, isoWeek, start, end };
}

function formatDate(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-US", opts);
}

export function formatSprintWeekLabel(week: SprintWeek): string {
  const startLabel = formatDate(week.start, { month: "short", day: "numeric" });
  const endLabel = formatDate(week.end, { month: "short", day: "numeric" });
  return `Week ${week.isoWeek} · ${startLabel} – ${endLabel}, ${week.end.getFullYear()}`;
}
