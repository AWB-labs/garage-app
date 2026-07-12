import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '@/theme';

export interface CarSilhouetteProps {
  /** Rendered width; height follows the 240x100 aspect. */
  width: number;
  /** Accent the outline (hero) or keep it quiet (cards). */
  emphasis?: 'hero' | 'quiet';
}

/**
 * The default hero for cars without a photo: a drawn sedan profile over an
 * odometer-tape ground line. Same 1.5-stroke grammar as the icon set.
 */
export const CarSilhouette = React.memo(function CarSilhouette({ width, emphasis = 'quiet' }: CarSilhouetteProps) {
  const { colors } = useTheme();
  const height = (width * 100) / 240;
  const body = emphasis === 'hero' ? colors.accentText : colors.stroke;
  const detail = emphasis === 'hero' ? colors.stroke : colors.hairline;

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = 8 + i * 9.3;
    const major = i % 4 === 0;
    ticks.push(
      <Line
        key={i}
        x1={x}
        y1={major ? 88 : 90.5}
        x2={x}
        y2={93}
        stroke={major ? body : detail}
        strokeWidth={1}
      />
    );
  }

  return (
    <Svg width={width} height={height} viewBox="0 0 240 100" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {/* Body */}
      <Path
        d="M12 70c0-7 5-10.5 14-12.5l21-4.5c13-14.5 32-22 55-22h32c21 0 36 7.5 49 19l24 4.5c9.5 2 15 5.5 15 13v6.5h-14.5"
        stroke={body}
        strokeWidth={2.4}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      {/* Rocker line between the wheels */}
      <Line x1={78} y1={76.5} x2={160} y2={76.5} stroke={body} strokeWidth={2.4} />
      <Line x1={12} y1={76.5} x2={46} y2={76.5} stroke={body} strokeWidth={2.4} />
      {/* Greenhouse */}
      <Path d="M62 52l16-16h56l22 16" stroke={detail} strokeWidth={1.6} />
      <Line x1={106} y1={36.5} x2={106} y2={52} stroke={detail} strokeWidth={1.6} />
      {/* Wheels */}
      <Circle cx={62} cy={76} r={13} stroke={body} strokeWidth={2.4} />
      <Circle cx={62} cy={76} r={5.2} stroke={detail} strokeWidth={1.6} />
      <Circle cx={176} cy={76} r={13} stroke={body} strokeWidth={2.4} />
      <Circle cx={176} cy={76} r={5.2} stroke={detail} strokeWidth={1.6} />
      {/* Odometer-tape ground line */}
      {ticks}
    </Svg>
  );
});
