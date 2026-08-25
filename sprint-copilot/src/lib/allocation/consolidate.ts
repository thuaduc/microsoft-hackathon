import type { ClassifiedIssue, ConsolidatedEntry } from "../../types.ts";

export interface ConsolidateResult {
  deduped: ClassifiedIssue[];
  consolidated: ConsolidatedEntry[];
}

// Excludes near-duplicate issues (as flagged by the LLM classification's
// duplicate_of field) before allocation. Follows duplicate_of chains to
// their root (A dup-of B dup-of C -> both A and B excluded, C survives),
// and defends against bad references — pointing outside the batch, a
// self-reference, or a cycle — deterministically: a cycle breaks at
// whichever issue has the lowest number.
export function consolidateDuplicates(classified: ClassifiedIssue[]): ConsolidateResult {
  const byNumber = new Map(classified.map((issue) => [issue.number, issue]));

  const dupOf = new Map<number, number>();
  for (const issue of classified) {
    const target = issue.classification.duplicate_of;
    if (target == null) continue;
    if (target === issue.number) continue; // self-reference, ignore
    if (!byNumber.has(target)) continue; // references an issue outside this batch, ignore
    dupOf.set(issue.number, target);
  }

  function resolveRoot(start: number): number {
    const seen = new Set<number>([start]);
    let current = start;
    while (dupOf.has(current)) {
      const next = dupOf.get(current)!;
      if (seen.has(next)) {
        return Math.min(...seen); // cycle — break it at the lowest issue number
      }
      seen.add(next);
      current = next;
    }
    return current;
  }

  const excluded = new Map<number, number>(); // issueNumber -> canonical issueNumber
  for (const issue of classified) {
    if (!dupOf.has(issue.number)) continue;
    const root = resolveRoot(issue.number);
    if (root !== issue.number) {
      excluded.set(issue.number, root);
    }
  }

  const consolidated: ConsolidatedEntry[] = [...excluded.entries()].map(
    ([issueNumber, duplicateOfIssueNumber]) => ({
      issueNumber,
      issueTitle: byNumber.get(issueNumber)!.title,
      issueUrl: byNumber.get(issueNumber)!.html_url,
      duplicateOfIssueNumber,
      duplicateOfTitle: byNumber.get(duplicateOfIssueNumber)!.title,
    })
  );

  const deduped = classified.filter((issue) => !excluded.has(issue.number));

  return { deduped, consolidated };
}
