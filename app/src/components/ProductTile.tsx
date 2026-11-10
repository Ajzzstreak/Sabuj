import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { categoryHue, continuous, radius, useTheme } from '@/theme';

type Glyph = keyof typeof Ionicons.glyphMap;

const GLYPHS: [RegExp, Glyph][] = [
  [/coffee|espresso|kettle|tea/, 'cafe-outline'],
  [/rice|cook|kitchen|fryer|blender|mixer|oven|pan|pot|toaster|appliance/, 'restaurant-outline'],
  [/headphone|earbud|audio|speaker|sound/, 'headset-outline'],
  [/laptop|computer|notebook|monitor|pc\b/, 'laptop-outline'],
  [/phone|mobile/, 'phone-portrait-outline'],
  [/tablet|ipad|e-?reader/, 'tablet-portrait-outline'],
  [/tv|television|streaming|projector/, 'tv-outline'],
  [/camera|photo/, 'camera-outline'],
  [/watch|wearable|fitness tracker/, 'watch-outline'],
  [/game|gaming|console|toy/, 'game-controller-outline'],
  [/vacuum|clean|laundry|detergent/, 'sparkles-outline'],
  [/grocery|food|snack|pantry|drink/, 'basket-outline'],
  [/bed|mattress|furniture|sofa|chair|desk/, 'bed-outline'],
  [/home|garden|patio|decor/, 'home-outline'],
  [/tool|hardware|drill/, 'hammer-outline'],
  [/beauty|personal care|skin|hair/, 'rose-outline'],
  [/health|vitamin|wellness|medical/, 'fitness-outline'],
  [/baby|kid|diaper/, 'happy-outline'],
  [/pet|dog|cat/, 'paw-outline'],
  [/cloth|apparel|shoe|fashion/, 'shirt-outline'],
  [/sport|outdoor|bike|camp/, 'bicycle-outline'],
  [/office|printer|paper|school/, 'briefcase-outline'],
  [/car|auto|tire/, 'car-outline'],
  [/electronic|tech|charger|battery|cable/, 'hardware-chip-outline'],
];

export function glyphFor(category: string, title = ''): Glyph {
  const title_ = title.toLowerCase();
  const category_ = category.toLowerCase();
  for (const [re, glyph] of GLYPHS) if (re.test(title_)) return glyph;
  for (const [re, glyph] of GLYPHS) if (re.test(category_)) return glyph;
  return 'pricetag-outline';
}

export interface ProductTileProps {
  imageUrl: string | null;
  category: string;
  title: string;
  /** Square edge length, or omit and size with `style`. */
  size?: number;
  corner?: number;
  style?: StyleProp<ViewStyle>;
  glyphSize?: number;
}

/**
 * Product picture. When there is no image, a designed stand-in: the category
 * glyph on a soft gradient tinted by the category.
 */
export const ProductTile = memo(function ProductTile({ imageUrl, category, title, size, corner = radius.md, style, glyphSize }: ProductTileProps) {
  const { dark, c } = useTheme();
  const hue = categoryHue(category);
  const from = dark ? `hsl(${hue}, 32%, 22%)` : `hsl(${hue}, 62%, 93%)`;
  const to = dark ? `hsl(${(hue + 36) % 360}, 38%, 14%)` : `hsl(${(hue + 36) % 360}, 58%, 84%)`;
  const ink = dark ? `hsl(${hue}, 58%, 80%)` : `hsl(${hue}, 42%, 36%)`;
  const box: ViewStyle = { borderRadius: corner, ...(size ? { width: size, height: size } : null) };
  const iconSize = glyphSize ?? Math.max(20, Math.round((size ?? 96) * 0.4));

  return (
    <View style={[styles.box, continuous, box, { backgroundColor: c.fill }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} contentFit="contain" transition={160} />
      ) : (
        <>
          <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.halo, { width: iconSize * 1.9, height: iconSize * 1.9, borderRadius: iconSize, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)' }]} />
          <Ionicons name={glyphFor(category, title)} size={iconSize} color={ink} />
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
});
