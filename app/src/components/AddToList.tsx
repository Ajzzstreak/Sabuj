import { StyleSheet, View } from 'react-native';
import type { Product } from '@/api/contract';
import { addProductToList, removeFromList, setListQuantity } from '@/lib/list';
import { LIST_MAX_ITEMS, listStore, QTY_MAX } from '@/state';
import { Button, IconButton, QuantityStepper, toast, type ButtonSize } from './ui';

const FULL = `Your list is full (${LIST_MAX_ITEMS} items).`;

/** Remove with an Undo toast: the one way anything leaves the list. */
export function removeListItemWithUndo(id: string, title: string): void {
  const undo = removeFromList(id);
  if (undo) toast(`Removed ${title}`, 'neutral', { label: 'Undo', onPress: undo });
}

/**
 * "Add to list" for a specific product. Once the product is on the list the
 * button becomes its quantity stepper (minus at 1 removes, with undo).
 */
export function AddToListButton({ product, size = 'sm', fullWidth }: { product: Product; size?: ButtonSize; fullWidth?: boolean }) {
  const item = listStore.use((list) => list.find((i) => i.productId === product.id));
  if (item) {
    return (
      <View style={fullWidth ? styles.center : undefined}>
        <QuantityStepper
          testID={`list-qty-${product.id}`}
          label={`quantity of ${product.title} on your list`}
          value={item.quantity}
          max={QTY_MAX}
          onChange={(q) => setListQuantity(item.id, q)}
          onRemove={() => removeListItemWithUndo(item.id, product.title)}
        />
      </View>
    );
  }
  return (
    <Button
      testID={`list-add-${product.id}`}
      label="Add to list"
      icon="add"
      variant="secondary"
      size={size}
      fullWidth={fullWidth}
      accessibilityLabel={`Add ${product.title} to your shopping list`}
      onPress={() => {
        if (addProductToList(product) === 'full') toast(FULL, 'danger');
        else toast('Added to your list', 'success');
      }}
    />
  );
}

/** Compact "+" for the small home cards. Each press adds one. */
export function AddToListIcon({ product }: { product: Product }) {
  const quantity = listStore.use((list) => list.find((i) => i.productId === product.id)?.quantity ?? 0);
  return (
    <IconButton
      testID={`list-plus-${product.id}`}
      icon={quantity > 0 ? 'checkmark' : 'add'}
      label={quantity > 0 ? `${product.title} is on your list, ${quantity}. Add one more` : `Add ${product.title} to your shopping list`}
      size="sm"
      variant={quantity > 0 ? 'accent' : 'filled'}
      active={quantity > 0}
      onPress={() => {
        const result = addProductToList(product);
        toast(result === 'full' ? FULL : result === 'added' ? 'Added to your list' : `On your list: ${quantity + 1}`, result === 'full' ? 'danger' : 'success');
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
});
