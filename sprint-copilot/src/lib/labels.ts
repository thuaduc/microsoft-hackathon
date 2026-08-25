// Shared label-rendering helpers for TicketCard and BacklogList.

const TYPE_LABEL_PATTERN = /^(feature|bug)$/i;

// Pulls the label that represents this issue's type (matching the app's own
// IssueType vocabulary) out of a label list, if present.
export function pickTypeLabel(labels: string[]): string | undefined {
  return labels.find((label) => TYPE_LABEL_PATTERN.test(label));
}

// Picks readable text color (near-black or white) for a filled pill given
// its GitHub hex background color, via relative luminance.
export function contrastTextColor(hexColor: string): string {
  const hex = hexColor.replace(/^#/, "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}
