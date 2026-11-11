import type { StyleProp, ViewStyle } from 'react-native';
import type { Product } from '@/api/contract';
import { hasDemoPrices } from '@/lib/offers';
import { Banner } from './ui';

/**
 * Persistent, non-dismissable notice shown wherever any price on screen is
 * synthetic (priceSource 'demo'), so mock data is never mistaken for a real
 * store price.
 */
export function DemoNotice({ products, style }: { products: readonly Product[]; style?: StyleProp<ViewStyle> }) {
  if (!hasDemoPrices(products)) return null;
  return <Banner testID="demo-notice" tone="notice" compact title="Demo prices" text="Sample data for testing. These are not real store prices." style={style} />;
}
