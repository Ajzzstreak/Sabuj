import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { type as typeScale, useTheme, type Palette, type TypeVariant } from '@/theme';

type Tone = 'text' | 'textSecondary' | 'textTertiary' | 'accentText' | 'best' | 'danger' | 'onAccent';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: Tone;
  /** Overrides tone with a literal color. */
  color?: string;
  center?: boolean;
}

/** All text goes through here so type and color stay on the token scale. */
export function Text({ variant = 'body', tone = 'text', color, center, style, ...rest }: TextProps) {
  const { c } = useTheme();
  return (
    <RNText
      // Respect Dynamic Type, but cap it so dense rows stay usable.
      maxFontSizeMultiplier={1.5}
      {...rest}
      style={[typeScale[variant], { color: color ?? c[tone as keyof Palette] }, center && { textAlign: 'center' }, style]}
    />
  );
}
