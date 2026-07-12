import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';

/**
 * Bespoke icon set. Grammar: 24 grid, 1.5 stroke, butt caps and miter joins
 * so terminals read squared, like gauge ticks. Active states may fill.
 * No icon libraries anywhere in the app.
 */

interface Glyph {
  paths?: string[];
  lines?: [number, number, number, number][];
  circles?: { cx: number; cy: number; r: number; fill?: boolean }[];
  rects?: { x: number; y: number; w: number; h: number; r?: number }[];
}

const GLYPHS = {
  car: {
    paths: ['M2.5 16.2v-2.4l2.3-4.3h8.4l3.8 3.2 3.5 0.8v2.7h-1.8'],
    lines: [
      [8.8, 16.2, 14.8, 16.2],
      [8.1, 9.5, 6.6, 12.4],
    ],
    circles: [
      { cx: 6.9, cy: 16.4, r: 1.9 },
      { cx: 16.7, cy: 16.4, r: 1.9 },
    ],
  },
  gauge: {
    paths: ['M5.2 16.8a8 8 0 1 1 13.6 0'],
    lines: [[12.6, 12.2, 16.2, 8.6]],
    circles: [{ cx: 12, cy: 12.8, r: 1.1, fill: true }],
  },
  odometer: {
    rects: [{ x: 3, y: 8.2, w: 18, h: 7.6, r: 1 }],
    lines: [
      [7.5, 8.2, 7.5, 15.8],
      [12, 8.2, 12, 15.8],
      [16.5, 8.2, 16.5, 15.8],
    ],
  },
  wrench: {
    paths: [
      'M16.9 3.8a4.4 4.4 0 0 0-5.7 5.7L3.6 17.1a2 2 0 1 0 2.8 2.8l7.6-7.6a4.4 4.4 0 0 0 5.7-5.7l-2.9 2.9-2.1-0.7-0.7-2.1z',
    ],
  },
  oil: {
    paths: ['M12 3.8c2.9 3.5 4.7 6 4.7 8.4a4.7 4.7 0 1 1-9.4 0c0-2.4 1.8-4.9 4.7-8.4z'],
    lines: [[9.9, 14.6, 14.1, 14.6]],
  },
  tire: {
    circles: [
      { cx: 12, cy: 12, r: 8.2 },
      { cx: 12, cy: 12, r: 3.1 },
    ],
    lines: [
      [12, 3.8, 12, 8.9],
      [12, 15.1, 12, 20.2],
      [3.8, 12, 8.9, 12],
      [15.1, 12, 20.2, 12],
    ],
  },
  brake: {
    circles: [
      { cx: 12, cy: 12, r: 7.4 },
      { cx: 12, cy: 12, r: 2.5 },
      { cx: 12, cy: 7.8, r: 0.4, fill: true },
      { cx: 16.2, cy: 12, r: 0.4, fill: true },
      { cx: 12, cy: 16.2, r: 0.4, fill: true },
      { cx: 7.8, cy: 12, r: 0.4, fill: true },
    ],
    paths: ['M6.9 3.5a9.9 9.9 0 0 1 10.2 0'],
  },
  filter: {
    paths: ['M4 4.8h16l-6.2 7v6.9l-3.6-2.3v-4.6z'],
  },
  battery: {
    rects: [{ x: 3.5, y: 8, w: 17, h: 10.5, r: 1.4 }],
    lines: [
      [7.5, 5.6, 7.5, 8],
      [16.5, 5.6, 16.5, 8],
      [6.3, 13.2, 9.1, 13.2],
      [7.7, 11.8, 7.7, 14.6],
      [14.9, 13.2, 17.7, 13.2],
    ],
  },
  inspection: {
    rects: [
      { x: 5, y: 4.6, w: 14, h: 15.9, r: 1.4 },
      { x: 9.2, y: 3, w: 5.6, h: 3.2, r: 0.8 },
    ],
    paths: ['M8.8 13.4l2.2 2.2 4.2-4.4'],
  },
  note: {
    paths: ['M5 3.5h10l4 4V20.5H5z', 'M15 3.5v4h4'],
    lines: [
      [8.2, 12, 15.8, 12],
      [8.2, 15.5, 13.4, 15.5],
    ],
  },
  pin: {
    paths: ['M8.2 3.2h7.6l-1 5.8 2.6 3.2H6.6l2.6-3.2z'],
    lines: [[12, 12.2, 12, 20.4]],
  },
  search: {
    circles: [{ cx: 10.6, cy: 10.6, r: 5.6 }],
    lines: [[14.8, 14.8, 20.2, 20.2]],
  },
  settings: {
    circles: [{ cx: 12, cy: 12, r: 3.1 }],
    lines: [
      [12, 3, 12, 5.6],
      [12, 18.4, 12, 21],
      [3, 12, 5.6, 12],
      [18.4, 12, 21, 12],
      [5.7, 5.7, 7.5, 7.5],
      [16.5, 16.5, 18.3, 18.3],
      [5.7, 18.3, 7.5, 16.5],
      [16.5, 7.5, 18.3, 5.7],
    ],
  },
  plus: {
    lines: [
      [12, 5, 12, 19],
      [5, 12, 19, 12],
    ],
  },
  close: {
    lines: [
      [6, 6, 18, 18],
      [18, 6, 6, 18],
    ],
  },
  check: {
    paths: ['M5 12.6l4.4 4.4L19 7.4'],
  },
  chevronRight: { paths: ['M9.5 5.5 16 12l-6.5 6.5'] },
  chevronLeft: { paths: ['M14.5 5.5 8 12l6.5 6.5'] },
  chevronDown: { paths: ['M5.5 9.5 12 16l6.5-6.5'] },
  chevronUp: { paths: ['M5.5 14.5 12 8l6.5 6.5'] },
  alert: {
    paths: ['M12 4 21 19.6H3z'],
    lines: [[12, 10, 12, 14.4]],
    circles: [{ cx: 12, cy: 16.8, r: 0.5, fill: true }],
  },
  clock: {
    circles: [{ cx: 12, cy: 12, r: 8.2 }],
    paths: ['M12 7.4V12l3.4 2.1'],
  },
  calendar: {
    rects: [{ x: 4, y: 6, w: 16, h: 14.4, r: 1.4 }],
    lines: [
      [4, 10.4, 20, 10.4],
      [8.2, 3.6, 8.2, 6],
      [15.8, 3.6, 15.8, 6],
    ],
  },
  trash: {
    paths: ['M9 7.3V5h6v2.3', 'M6.9 7.3l0.8 12.7h8.6l0.8-12.7'],
    lines: [
      [5, 7.3, 19, 7.3],
      [10.2, 10.6, 10.2, 16.6],
      [13.8, 10.6, 13.8, 16.6],
    ],
  },
  share: {
    paths: ['M8 7.4 12 3.4l4 4', 'M5.5 12v7.6h13V12'],
    lines: [[12, 14, 12, 3.9]],
  },
  edit: {
    paths: ['M4.2 19.8l1-4L16.6 4.4l3 3L8.2 18.8z'],
    lines: [[14.4, 6.6, 17.4, 9.6]],
  },
  camera: {
    rects: [{ x: 3.5, y: 7, w: 17, h: 12.8, r: 1.8 }],
    paths: ['M8.5 7l1.6-2.6h3.8L15.5 7'],
    circles: [{ cx: 12, cy: 13.2, r: 3.3 }],
  },
  image: {
    rects: [{ x: 4, y: 5, w: 16, h: 14, r: 1.4 }],
    circles: [{ cx: 9, cy: 10, r: 1.4 }],
    paths: ['M4.8 17.4 10 12.4l3 3 2.7-2.7 3.5 3.5'],
  },
  stats: {
    lines: [
      [6.5, 19, 6.5, 12],
      [12, 19, 12, 5.5],
      [17.5, 19, 17.5, 14.5],
      [4, 21, 20, 21],
    ],
  },
  fuel: {
    paths: ['M5 20V5.6A1.6 1.6 0 0 1 6.6 4h5.8A1.6 1.6 0 0 1 14 5.6V20', 'M14 9.5h2.4l2.6 3v5.2a1.6 1.6 0 0 1-3.2 0v-4.2H14'],
    lines: [[3.6, 20, 15.4, 20]],
    rects: [{ x: 7, y: 6.8, w: 5, h: 3.6, r: 0.6 }],
  },
  timeline: {
    lines: [
      [7, 3.6, 7, 20.4],
      [11, 7, 19.5, 7],
      [11, 15, 19.5, 15],
    ],
    circles: [
      { cx: 7, cy: 7, r: 1.7 },
      { cx: 7, cy: 15, r: 1.7 },
    ],
  },
  garage: {
    paths: ['M3.5 19.6V9.8L12 4.4l8.5 5.4v9.8'],
    lines: [
      [7.4, 13.2, 16.6, 13.2],
      [7.4, 16.4, 16.6, 16.4],
      [7.4, 19.6, 16.6, 19.6],
      [7.4, 13.2, 7.4, 19.6],
      [16.6, 13.2, 16.6, 19.6],
    ],
  },
  dot: {
    circles: [{ cx: 12, cy: 12, r: 3.2 }],
  },
  dotFilled: {
    circles: [{ cx: 12, cy: 12, r: 3.2, fill: true }],
  },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

export interface IconProps {
  name: IconName;
  /** Rendered box size; the glyph scales from the 24 grid. */
  size?: number;
  /** Explicit color; defaults to the theme text color. */
  color?: string;
  strokeWidth?: number;
}

export const Icon = React.memo(function Icon({ name, size = 24, color, strokeWidth = 1.5 }: IconProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.text;
  const glyph: Glyph = GLYPHS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {glyph.rects?.map((r, i) => (
        <Rect key={`r${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r ?? 0} />
      ))}
      {glyph.paths?.map((d, i) => (
        <Path key={`p${i}`} d={d} />
      ))}
      {glyph.lines?.map(([x1, y1, x2, y2], i) => (
        <Line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      {glyph.circles?.map((c, i) => (
        <Circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r} fill={c.fill ? stroke : 'none'} strokeWidth={c.fill ? 0 : strokeWidth} />
      ))}
    </Svg>
  );
});

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];
