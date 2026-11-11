import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import type { RetailerId } from '@/api/contract';

/** Every color, size and font in the app comes from this file. */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  /** Recessed fill: inputs, chips, tracks. */
  fill: string;
  fillStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  /** The one accent: actions and "picked for you". */
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentText: string;
  /** Green is reserved for best price / savings. */
  best: string;
  bestSoft: string;
  danger: string;
  dangerSoft: string;
  /** Amber: cautions such as "demo prices" and DRAFT copy. */
  notice: string;
  noticeSoft: string;
  star: string;
  overlay: string;
  skeleton: string;
  shadow: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#F5F4F1',
    surface: '#FFFFFF',
    fill: '#EDEBE6',
    fillStrong: '#E1DFD9',
    text: '#131316',
    textSecondary: '#55545C',
    textTertiary: '#6F6E77',
    border: 'rgba(19,19,22,0.08)',
    borderStrong: 'rgba(19,19,22,0.16)',
    accent: '#5B43F0',
    onAccent: '#FFFFFF',
    accentSoft: '#ECE9FF',
    accentText: '#4A32D4',
    best: '#0A7A3D',
    bestSoft: '#E1F4E8',
    danger: '#C22F2F',
    dangerSoft: '#FCE9E7',
    notice: '#7A4E00',
    noticeSoft: '#FBEFD0',
    star: '#E8A100',
    overlay: 'rgba(19,19,22,0.36)',
    skeleton: '#E7E5DF',
    shadow: '#1B1A2E',
  },
  dark: {
    bg: '#09090B',
    surface: '#17171B',
    fill: '#232329',
    fillStrong: '#2F2F37',
    text: '#F4F3F0',
    textSecondary: '#B0AFB9',
    textTertiary: '#92919C',
    border: 'rgba(255,255,255,0.09)',
    borderStrong: 'rgba(255,255,255,0.18)',
    accent: '#A596FF',
    onAccent: '#120C33',
    accentSoft: '#272150',
    accentText: '#B9ADFF',
    best: '#4FD98A',
    bestSoft: '#11301F',
    danger: '#FF7A70',
    dangerSoft: '#3A1917',
    notice: '#F0C25A',
    noticeSoft: '#33270A',
    star: '#F2B632',
    overlay: 'rgba(0,0,0,0.6)',
    skeleton: '#232329',
    shadow: '#000000',
  },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** iOS "continuous" (squircle) corners where the platform supports them. */
export const continuous: ViewStyle = { borderCurve: 'continuous' };

export const layout = {
  maxContentWidth: 1180,
  tabletMin: 700,
  desktopMin: 1040,
  minTouch: 44,
} as const;

export const fonts = {
  displayMedium: 'BricolageGrotesque_500Medium',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  /** Body copy uses the platform's own UI face. */
  body: Platform.select({
    web: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    default: undefined,
  }),
} as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  display: { fontFamily: fonts.displayHeavy, fontSize: 36, lineHeight: 40, letterSpacing: -1 },
  title1: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 33, letterSpacing: -0.6 },
  title2: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 27, letterSpacing: -0.3 },
  title3: { fontFamily: fonts.displaySemi, fontSize: 18, lineHeight: 23, letterSpacing: -0.1 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20 },
  calloutStrong: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  footnote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  footnoteStrong: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  captionStrong: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  overline: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  priceHero: { fontFamily: fonts.displayHeavy, fontSize: 40, lineHeight: 44, letterSpacing: -1, ...tabular },
  priceLarge: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, ...tabular },
  price: { fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, ...tabular },
  priceSmall: { fontFamily: fonts.displaySemi, fontSize: 14, lineHeight: 18, ...tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Soft, low-contrast depth. Dark mode relies on surface steps instead. */
export function elevation(scheme: ColorScheme, level: 1 | 2): ViewStyle {
  if (scheme === 'dark') return {};
  const p = palettes.light;
  return level === 1
    ? Platform.select<ViewStyle>({
        web: { boxShadow: '0 1px 2px rgba(27,26,46,0.04), 0 6px 20px rgba(27,26,46,0.05)' },
        android: { elevation: 2, shadowColor: p.shadow },
        default: { shadowColor: p.shadow, shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
      })!
    : Platform.select<ViewStyle>({
        web: { boxShadow: '0 2px 6px rgba(27,26,46,0.06), 0 18px 44px rgba(27,26,46,0.12)' },
        android: { elevation: 8, shadowColor: p.shadow },
        default: { shadowColor: p.shadow, shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 12 } },
      })!;
}

/**
 * Line colors for the price-history chart. Retailer brand colors are too close
 * to tell apart as lines (three blues, two reds), so the chart uses a
 * categorical palette checked for color-vision-deficiency separation, with one
 * fixed slot per retailer. The legend and tooltip always carry the name.
 */
export const chartSeries: Record<ColorScheme, Record<RetailerId, string>> = {
  light: {
    amazon: '#EB6834',
    walmart: '#2A78D6',
    samsclub: '#1BAF7A',
    target: '#E34948',
    costco: '#6250D6',
    bestbuy: '#EDA100',
  },
  dark: {
    amazon: '#D95926',
    walmart: '#3987E5',
    samsclub: '#199E70',
    target: '#E66767',
    costco: '#9085E9',
    bestbuy: '#C98500',
  },
};

/** Hue (0-360) for a category's placeholder tile. Stable per category name. */
export function categoryHue(category: string): number {
  let h = 7;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) % 360;
  return h;
}
