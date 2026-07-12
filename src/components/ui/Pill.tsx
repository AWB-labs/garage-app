import React from 'react';
import { View } from 'react-native';

import type { ReminderState } from '@/lib/reminders';
import { REMINDER_STATE_LABELS } from '@/lib/reminders';
import type { IssueSeverity, IssueStatus } from '@/lib/types';
import { ISSUE_SEVERITY_LABELS, ISSUE_STATUS_LABELS } from '@/lib/types';
import { radius, space, useTheme, type ColorToken } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface PillProps {
  label: string;
  /** Glyph + label together: status is never color-only. */
  icon?: IconName;
  color?: ColorToken;
  filled?: boolean;
}

export function Pill({ label, icon, color = 'textSecondary', filled }: PillProps) {
  const { colors } = useTheme();
  const tint = colors[color];
  return (
    <View
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.sm,
        paddingVertical: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: filled ? 'transparent' : tint,
        backgroundColor: filled ? tint : 'transparent',
      }}
    >
      {icon && <Icon name={icon} size={12} color={filled ? colors.onAccent : tint} strokeWidth={2} />}
      <AppText variant="label" color={filled ? 'onAccent' : color}>
        {label}
      </AppText>
    </View>
  );
}

/** Reminder escalation: a bulb brightening. Dot, clock, triangle. */
export function ReminderPill({ state }: { state: ReminderState }) {
  const map: Record<ReminderState, { icon: IconName; color: ColorToken }> = {
    upcoming: { icon: 'dot', color: 'textMuted' },
    dueSoon: { icon: 'clock', color: 'statusDueSoon' },
    overdue: { icon: 'alert', color: 'statusOverdue' },
  };
  return <Pill label={REMINDER_STATE_LABELS[state]} icon={map[state].icon} color={map[state].color} />;
}

export function SeverityPill({ severity }: { severity: IssueSeverity }) {
  const map: Record<IssueSeverity, { icon: IconName; color: ColorToken }> = {
    low: { icon: 'dot', color: 'textSecondary' },
    medium: { icon: 'clock', color: 'statusDueSoon' },
    critical: { icon: 'alert', color: 'statusOverdue' },
  };
  return <Pill label={ISSUE_SEVERITY_LABELS[severity]} icon={map[severity].icon} color={map[severity].color} />;
}

export function IssueStatusPill({ status }: { status: IssueStatus }) {
  const map: Record<IssueStatus, { icon: IconName; color: ColorToken }> = {
    open: { icon: 'alert', color: 'statusOverdue' },
    monitoring: { icon: 'clock', color: 'statusDueSoon' },
    fixed: { icon: 'check', color: 'successText' },
  };
  return <Pill label={ISSUE_STATUS_LABELS[status]} icon={map[status].icon} color={map[status].color} />;
}
