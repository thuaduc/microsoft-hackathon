import type { BoardIssue } from "@/types";

export interface SprintMilestone {
  number: number;
  title: string;
  html_url?: string;
}

export interface SprintOutcome {
  milestone: SprintMilestone;
  totalIssues: number;
  completedIssues: number;
  cancelledIssues: number;
  openIssues: number;
  completionRate: number;
}

export function buildSprintHistory(
  milestones: SprintMilestone[],
  issues: BoardIssue[]
): SprintOutcome[] {
  return [...milestones]
    .sort((a, b) => b.number - a.number)
    .map((milestone) => {
      const scoped = issues.filter((issue) => issue.milestone?.number === milestone.number);
      const completedIssues = scoped.filter((issue) => issue.status === "done").length;
      const cancelledIssues = scoped.filter((issue) => issue.status === "cancelled").length;
      const totalIssues = scoped.length;
      const openIssues = totalIssues - completedIssues - cancelledIssues;

      return {
        milestone,
        totalIssues,
        completedIssues,
        cancelledIssues,
        openIssues,
        completionRate: totalIssues === 0 ? 0 : Math.round((completedIssues / totalIssues) * 100),
      };
    });
}
