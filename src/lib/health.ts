import type { ReminderStatus } from './reminders';
import type { Issue, IssueSeverity } from './types';

export interface HealthDeduction {
  label: string;
  points: number;
}

export interface HealthBreakdown {
  /** 5..100. */
  score: number;
  deductions: HealthDeduction[];
}

const OPEN_ISSUE_POINTS: Record<IssueSeverity, number> = { low: 5, medium: 12, critical: 25 };
const MONITORING_ISSUE_POINTS: Record<IssueSeverity, number> = { low: 2, medium: 6, critical: 12 };

/**
 * Car health: 100 minus penalties for overdue and due-soon reminders and
 * unresolved issues, floored at 5 so the gauge never reads dead.
 */
export function healthScore(reminderStatuses: ReminderStatus[], issues: Issue[]): HealthBreakdown {
  const deductions: HealthDeduction[] = [];

  for (const status of reminderStatuses) {
    if (status.state === 'overdue') {
      deductions.push({ label: `${status.label} overdue`, points: 20 });
    } else if (status.state === 'dueSoon') {
      deductions.push({ label: `${status.label} due soon`, points: 7 });
    }
  }

  for (const issue of issues) {
    if (issue.status === 'open') {
      deductions.push({ label: issue.title, points: OPEN_ISSUE_POINTS[issue.severity] });
    } else if (issue.status === 'monitoring') {
      deductions.push({ label: issue.title, points: MONITORING_ISSUE_POINTS[issue.severity] });
    }
  }

  const total = deductions.reduce((sum, d) => sum + d.points, 0);
  return { score: Math.max(5, 100 - total), deductions };
}
