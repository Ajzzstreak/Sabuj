import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { elevation, palettes, type ColorScheme, type Palette } from './tokens';

export * from './tokens';

export interface Theme {
  scheme: ColorScheme;
  dark: boolean;
  c: Palette;
  shadow1: ReturnType<typeof elevation>;
  shadow2: ReturnType<typeof elevation>;
}

const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', dark: false, c: palettes.light, shadow1: elevation('light', 1), shadow2: elevation('light', 2) },
  dark: { scheme: 'dark', dark: true, c: palettes.dark, shadow1: elevation('dark', 1), shadow2: elevation('dark', 2) },
};

const SchemeOverride = createContext<ColorScheme | null>(null);
/** Forces a scheme for a subtree. Used by the /dev/components gallery to show light and dark together. */
export const ThemeScope = SchemeOverride.Provider;

/** Follows the system appearance unless a ThemeScope overrides it. */
export function useTheme(): Theme {
  const forced = useContext(SchemeOverride);
  const scheme = useColorScheme();
  return themes[forced ?? (scheme === 'dark' ? 'dark' : 'light')];
}

/** Memoize a style object derived from the theme. */
export function useThemed<T>(factory: (t: Theme) => T): T {
  const t = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(t), [t]);
}
