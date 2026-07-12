import type { TextStyle } from 'react-native';

/**
 * Garage design tokens. See DESIGN.md for the reasoning behind every value.
 * Nothing outside src/theme may hardcode a color, size, radius, or spring.
 */

export const fonts = {
  display: 'BigShouldersDisplay_700Bold',
  displaySemi: 'BigShouldersDisplay_600SemiBold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
  mono: 'ChivoMono_400Regular',
  monoMedium: 'ChivoMono_500Medium',
} as const;

export const space = {
  xs2: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xl2: 24,
  xl3: 32,
  xl4: 48,
  xl5: 64,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

export const hitTarget = 44;

/** Dark: the night garage. Amber is emitted light in a warm-black world. */
export const darkColors = {
  bg: '#0D0C0A',
  surface: '#16140F',
  card: '#201C15',
  inset: '#14120D',
  hairline: '#332D22',
  stroke: '#7A6E58',
  text: '#F5F1E8',
  textSecondary: '#C9C0B0',
  textMuted: '#A29883',
  accent: '#FFB000',
  accentText: '#FFB000',
  glowCore: '#FFD24D',
  accentDim: '#8A6A33',
  accentDisabled: '#66512A',
  onAccent: '#0D0C0A',
  danger: '#FF4438',
  dangerText: '#FF4438',
  success: '#7BD88F',
  successText: '#7BD88F',
  statusUpcoming: '#8A6A33',
  statusDueSoon: '#FFB000',
  statusOverdue: '#FF4438',
  skeleton: '#2A251C',
  scrim: 'rgba(6, 5, 3, 0.62)',
  glow: 'rgba(255, 176, 0, 0.16)',
} as const;

/** Light: the printed spec sheet. Paper, ink, stamped labels. */
export const lightColors: ThemeColors = {
  bg: '#FAF7F2',
  surface: '#F4F1EA',
  card: '#FFFFFF',
  inset: '#F1EDE6',
  hairline: '#E4DCCE',
  stroke: '#8E8267',
  text: '#171410',
  textSecondary: '#57503F',
  textMuted: '#6E6558',
  accent: '#FFB000',
  accentText: '#8A5A00',
  glowCore: '#FFD24D',
  accentDim: '#C9A96A',
  accentDisabled: '#E3CFA6',
  onAccent: '#171410',
  danger: '#C21F14',
  dangerText: '#C21F14',
  success: '#177A45',
  successText: '#177A45',
  statusUpcoming: '#A8834A',
  statusDueSoon: '#8A5A00',
  statusOverdue: '#C21F14',
  skeleton: '#EAE5DB',
  scrim: 'rgba(23, 20, 16, 0.38)',
  glow: 'rgba(138, 90, 0, 0.14)',
};

export type ThemeColors = { -readonly [K in keyof typeof darkColors]: string };
export type ColorToken = keyof ThemeColors;

/** Type roles. numHero (the 64pt odometer) lives in the Odometer component as per-digit cells. */
export const type = {
  displayXL: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  displayL: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32 },
  title: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  bodySemi: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  smallMedium: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  numL: { fontFamily: fonts.monoMedium, fontSize: 32, lineHeight: 38 },
  numM: { fontFamily: fonts.mono, fontSize: 24, lineHeight: 30 },
} as const satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof type;

/** Odometer hero numeral size, used by the Odometer's per-digit cells. */
export const numHeroSize = 64;

export const springs = {
  /** Buttons, presses, small state changes. */
  snappy: { damping: 18, stiffness: 220, mass: 1 },
  /** Larger surfaces settling: cards, gauge needles, timeline entries. */
  settle: { damping: 14, stiffness: 160, mass: 1 },
  /** The radial FAB and reveal choreography, a touch of overshoot. */
  bloom: { damping: 12, stiffness: 180, mass: 1 },
} as const;

/** Per-element-group entrance stagger, in ms. */
export const staggerStep = 50;

export const durations = {
  /** Fades only. Anything touched uses springs. */
  fade: 180,
  fadeFast: 120,
} as const;
