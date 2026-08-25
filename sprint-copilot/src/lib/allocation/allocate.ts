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

function sortByPointsThenNumber(issues: ClassifiedIssue[]): ClassifiedIssue[] {
  return [...issues].sort((a, b) => {
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

export function allocate(
  classified: ClassifiedIssue[],
  config: AllocationConfig
): AllocationResult {
  const features = sortByPointsThenNumber(
    classified.filter((i) => i.classification.type === "feature")
  );
  const bugs = sortByPointsThenNumber(
    classified.filter((i) => i.classification.type === "bug")
  );

  const featureBudget = config.capacityPoints * config.featureRatio;
  const bugBudget = config.capacityPoints * config.bugRatio;

  const featureFill = fillBucket(features, featureBudget);
  const bugFill = fillBucket(bugs, bugBudget);

  const bucketByNumber = new Map<number, Bucket>();
  for (const issue of [...featureFill.picked, ...bugFill.picked]) {
    bucketByNumber.set(issue.number, issue.classification.type);
  }

  let totalUsed = featureFill.used + bugFill.used;
  let leftoverCapacity = config.capacityPoints - totalUsed;

  const leftoverCandidates = sortByPointsThenNumber([
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
