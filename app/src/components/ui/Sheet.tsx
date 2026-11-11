import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/hooks/useLayout';
import { continuous, radius, space, useTheme } from '@/theme';
import { Text } from '../Text';
import { IconButton } from './IconButton';

export interface SheetSurfaceProps {
  title: string;
  children: ReactNode;
  /** Action row pinned under the content. */
  footer?: ReactNode;
  /** Omit to hide the close button (e.g. while a request is in flight). */
  onClose?: () => void;
  /** Docked to the bottom edge (phones) or a centered dialog. */
  docked?: boolean;
  testID?: string;
}

/** The sheet's visible panel, exported so the gallery can show it without a modal. */
export function SheetSurface({ title, children, footer, onClose, docked = false, testID }: SheetSurfaceProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      accessibilityViewIsModal
      accessibilityRole={Platform.OS === 'web' ? ('dialog' as 'none') : undefined}
      accessibilityLabel={title}
      style={[styles.surface, continuous, docked ? [styles.docked, { paddingBottom: Math.max(insets.bottom, space.lg) }] : styles.dialog, { backgroundColor: t.c.surface, borderColor: t.c.border }, t.shadow2]}
    >
      {docked ? <View style={[styles.grabber, { backgroundColor: t.c.fillStrong }]} /> : null}
      <View style={styles.head}>
        <Text variant="title2" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {onClose ? <IconButton icon="close" label="Close" size="sm" onPress={onClose} testID="sheet-close" /> : null}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

export interface SheetProps extends Omit<SheetSurfaceProps, 'docked' | 'onClose'> {
  visible: boolean;
  onClose: () => void;
  /** False while busy: backdrop, Escape and the close button stop dismissing. */
  dismissable?: boolean;
}

/** Modal panel: a bottom sheet on phones, a centered dialog on wider screens. */
export function Sheet({ visible, onClose, dismissable = true, ...surface }: SheetProps) {
  const { c } = useTheme();
  const { isPhone } = useLayout();
  const close = dismissable ? onClose : undefined;
  return (
    <Modal visible={visible} transparent animationType={isPhone ? 'slide' : 'fade'} onRequestClose={() => close?.()} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.host, isPhone ? styles.hostBottom : styles.hostCenter]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={close} accessibilityLabel="Dismiss" accessibilityRole="button" tabIndex={-1} />
        <SheetSurface {...surface} docked={isPhone} onClose={close} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  hostBottom: { justifyContent: 'flex-end' },
  hostCenter: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  surface: { width: '100%', maxHeight: '90%', borderWidth: StyleSheet.hairlineWidth },
  docked: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.sm },
  dialog: { maxWidth: 460, borderRadius: radius.xl, paddingTop: space.lg, paddingBottom: space.xl },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, minHeight: 48 },
  title: { flex: 1 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.sm },
  footer: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md },
});
