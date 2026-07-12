import React from 'react';
import { View } from 'react-native';

import { space, useTheme } from '@/theme';
import { AppText } from './AppText';

export interface SectionHeaderProps {
  /** Mono overline, stamped uppercase. */
  overline?: string;
  title: string;
  /** Right-aligned accessory (count, action). */
  accessory?: React.ReactNode;
}

/** Editorial section header: overline label + display title on a full-width hairline. */
export function SectionHeader({ overline, title, accessory }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="header"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
        paddingBottom: space.sm,
        marginTop: space.xl2,
        marginBottom: space.lg,
      }}
    >
      {overline ? (
        <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
          {overline}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <AppText variant="displayL">{title}</AppText>
        {accessory}
      </View>
    </View>
  );
}
