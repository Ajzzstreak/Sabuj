import type { Product } from '@/api/contract';
import { toggleSaved } from '@/lib/actions';
import { useIsSaved } from '@/state';
import { useTheme } from '@/theme';
import { IconButton } from './bits';

/** Bookmark toggle. The watchlist is local, so the change is instant. */
export function SaveButton({ product, filled = true }: { product: Product; filled?: boolean }) {
  const { c } = useTheme();
  const saved = useIsSaved(product.id);
  return (
    <IconButton
      testID="save-button"
      icon={saved ? 'bookmark' : 'bookmark-outline'}
      label={saved ? `Remove ${product.title} from saved` : `Save ${product.title}`}
      active={saved}
      tint={saved ? c.accent : c.text}
      filled={filled}
      onPress={() => toggleSaved(product)}
    />
  );
}
