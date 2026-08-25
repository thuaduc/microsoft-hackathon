import type {
  AllocatedIssue,
  AllocationConfig,
  AllocationResult,
  Bucket,
  ClassifiedIssue,
} from "../../types.ts";

// Recomputes totals for an arbitrary set of selected issues — used by the
// review/adapt screen to keep point totals live as the user toggles issues
// in and out, without re-running the allocation algorithm. Takes a minimal
// shape (not the full AllocatedIssue) so the client can call it with its
// own lightweight review-state objects.
export function computeTotals(
  selected: Array<{ bucket: Bucket; points: number }>,
  config: Pick<AllocationConfig, "capacityPoints">
): AllocationResult["totals"] {
  const featurePointsUsed = selected
    .filter((i) => i.bucket === "feature")
    .reduce((sum, i) => sum + i.points, 0);
  const bugPointsUsed = selected
    .filter((i) => i.bucket === "bug")
    .reduce((sum, i) => sum + i.points, 0);

  return {
    featurePointsUsed,
    bugPointsUsed,
    totalPointsUsed: featurePointsUsed + bugPointsUsed,
    capacity: config.capacityPoints,
  };
}

// Focus-matching issues (see IssueClassification.matches_sprint_focus, set
// by the LLM during classification) sort ahead of non-matching ones within
// the same bucket — otherwise identical to before: ascending by points,
// then issue number. This is what actually makes "this sprint's focus"
// affect which issues get selected, not just their point estimates — a
// focus match beats a smaller non-match for a capacity-limited bucket.
function sortByFocusThenPointsThenNumber(issues: ClassifiedIssue[]): ClassifiedIssue[] {
  return [...issues].sort((a, b) => {
    const focusDiff = Number(b.classification.matches_sprint_focus) - Number(a.classification.matches_sprint_focus);
    if (focusDiff !== 0) return focusDiff;
    const pointsDiff = a.classification.points - b.classification.points;
    if (pointsDiff !== 0) return pointsDiff;
    return a.number - b.number;
  });
}

function fillBucket(
  candidates: ClassifiedIssue[],
  budget: number
): { picked: ClassifiedIssue[]; remaining: ClassifiedIssue[]; used: number } {
  const picked: ClassifiedIssue[] = [];
  const remaining: ClassifiedIssue[] = [];
  let used = 0;

  for (const issue of candidates) {
    const points = issue.classification.points;
    if (used + points <= budget) {
      picked.push(issue);
      used += points;
    } else {
      remaining.push(issue);
    }
  }

  return { picked, remaining, used };
}

// issue numbers that must be selected regardless of point budget — used to
// force-carry still-open issues from the previous sprint's milestone into
// this one (see findPreviousMilestone in lib/github/milestones.ts). Their
// points still count against capacity, reducing what's left for everything
// else; if they alone exceed capacity, the run is simply over capacity
// (surfaced normally via AllocationResult.totals, same as an over-toggled
// preview).
export function allocate(
  classified: ClassifiedIssue[],
  config: AllocationConfig,
  guaranteedNumbers: Set<number> = new Set()
): AllocationResult {
  const guaranteed = classified.filter((i) => guaranteedNumbers.has(i.number));
  const rest = classified.filter((i) => !guaranteedNumbers.has(i.number));

  const guaranteedFeaturePoints = guaranteed
    .filter((i) => i.classification.type === "feature")
    .reduce((sum, i) => sum + i.classification.points, 0);
  const guaranteedBugPoints = guaranteed
    .filter((i) => i.classification.type === "bug")
    .reduce((sum, i) => sum + i.classification.points, 0);

  const features = sortByFocusThenPointsThenNumber(rest.filter((i) => i.classification.type === "feature"));
  const bugs = sortByFocusThenPointsThenNumber(rest.filter((i) => i.classification.type === "bug"));

  const featureBudget = Math.max(0, config.capacityPoints * config.featureRatio - guaranteedFeaturePoints);
  const bugBudget = Math.max(0, config.capacityPoints * config.bugRatio - guaranteedBugPoints);

  const featureFill = fillBucket(features, featureBudget);
  const bugFill = fillBucket(bugs, bugBudget);

  const bucketByNumber = new Map<number, Bucket>();
  for (const issue of [...guaranteed, ...featureFill.picked, ...bugFill.picked]) {
    bucketByNumber.set(issue.number, issue.classification.type);
  }

  let totalUsed = guaranteedFeaturePoints + guaranteedBugPoints + featureFill.used + bugFill.used;
  let leftoverCapacity = Math.max(0, config.capacityPoints - totalUsed);

  const leftoverCandidates = sortByFocusThenPointsThenNumber([
    ...featureFill.remaining,
    ...bugFill.remaining,
  ]);

  const toppedOff: ClassifiedIssue[] = [];
  for (const issue of leftoverCandidates) {
    const points = issue.classification.points;
    if (points <= leftoverCapacity) {
      toppedOff.push(issue);
      bucketByNumber.set(issue.number, issue.classification.type);
      leftoverCapacity -= points;
      totalUsed += points;
    }
  }

  const pickedNumbers = new Set(bucketByNumber.keys());

  const selected: AllocatedIssue[] = [
    ...guaranteed,
    ...featureFill.picked,
    ...bugFill.picked,
    ...toppedOff,
  ].map((issue) => ({ ...issue, bucket: bucketByNumber.get(issue.number)! }));

  const unselected: ClassifiedIssue[] = classified.filter(
    (issue) => !pickedNumbers.has(issue.number)
  );

  const totals = computeTotals(
    selected.map((i) => ({ bucket: i.bucket, points: i.classification.points })),
    config
  );

  return { selected, unselected, totals };
}
