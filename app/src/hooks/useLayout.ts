import { useWindowDimensions } from 'react-native';
import { layout, space } from '@/theme';

export interface Layout {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Side padding for page content. */
  gutter: number;
  /** Width of the centered content column (gutters excluded). */
  contentWidth: number;
  /** Columns for product grids. */
  columns: 1 | 2 | 3;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= layout.desktopMin;
  const isTablet = !isDesktop && width >= layout.tabletMin;
  const gutter = isDesktop ? space.xxxl : isTablet ? space.xxl : space.lg;
  const contentWidth = Math.min(width, layout.maxContentWidth) - gutter * 2;
  return {
    width,
    height,
    isPhone: !isTablet && !isDesktop,
    isTablet,
    isDesktop,
    gutter,
    contentWidth,
    columns: width >= 1100 ? 3 : width >= layout.tabletMin ? 2 : 1,
  };
}
