import React from 'react';
import { View } from 'react-native';

import { radius, space, useTheme } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Designed empty state: glyph in a gauge-tick ring, plain words, one clear action. */
export function EmptyState({ icon, title, body, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xl4, paddingHorizontal: space.xl2 }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.hairline,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.xl,
          backgroundColor: colors.card,
        }}
      >
        <Icon name={icon} size={36} color={colors.accentText} />
      </View>
      <AppText variant="title" center style={{ marginBottom: space.sm }}>
        {title}
      </AppText>
      <AppText variant="small" color="textSecondary" center style={{ marginBottom: space.xl2, maxWidth: 280 }}>
        {body}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
