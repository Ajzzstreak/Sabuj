import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RetailerMark } from '@/components/bits';
import type { ForcedState } from '@/components/PressableScale';
import { Screen, StackHeader } from '@/components/Screen';
import { Text } from '@/components/Text';
import {
  Badge,
  Banner,
  Button,
  Chip,
  CountBadge,
  EmptyState,
  IconButton,
  ListRow,
  SegmentedControl,
  Sheet,
  SheetSurface,
  TextField,
  toast,
  ToastView,
  ToggleRow,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui';
import { DEV_ROUTES } from '@/config';
import { useLayout } from '@/hooks/useLayout';
import { radius, space, ThemeScope, useTheme, type ColorScheme } from '@/theme';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'tertiary', 'destructive'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];
const STATES: { name: string; force?: ForcedState; disabled?: boolean; loading?: boolean }[] = [
  { name: 'default' },
  { name: 'hover', force: 'hover' },
  { name: 'pressed', force: 'pressed' },
  { name: 'focus', force: 'focus' },
  { name: 'disabled', disabled: true },
  { name: 'loading', loading: true },
];

/**
 * /dev/components — every shared primitive in every state, in light and dark
 * side by side, for visual review. Not reachable in production builds (see
 * DEV_ROUTES in src/config.ts).
 */
export default function ComponentGallery() {
  const { isDesktop } = useLayout();
  if (!DEV_ROUTES) return <Redirect href="/" />;
  return (
    <Screen>
      <StackHeader title="Component gallery" right={<View style={{ width: 44 }} />} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.panels, isDesktop && styles.panelsWide]} testID="gallery">
          {(['light', 'dark'] as ColorScheme[]).map((scheme) => (
            <ThemeScope key={scheme} value={scheme}>
              <Panel scheme={scheme} />
            </ThemeScope>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Panel({ scheme }: { scheme: ColorScheme }) {
  const { c } = useTheme();
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('a');
  const [toggle, setToggle] = useState(true);
  const [chip, setChip] = useState(true);
  const [field, setField] = useState('94103');
  const [sheet, setSheet] = useState(false);
  const noop = () => undefined;
  return (
    <View style={[styles.panel, { backgroundColor: c.bg, borderColor: c.borderStrong }]} testID={`gallery-${scheme}`}>
      <Text variant="title1" accessibilityRole="header">
        {scheme === 'light' ? 'Light' : 'Dark'}
      </Text>

      <Group title="Button — variants × states (md)">
        {VARIANTS.map((variant) => (
          <View key={variant} style={styles.wrapRow}>
            {STATES.map((s) => (
              <Sample key={s.name} label={s.name}>
                <Button label={variant} variant={variant} forceState={s.force} disabled={s.disabled} loading={s.loading} onPress={noop} />
              </Sample>
            ))}
          </View>
        ))}
      </Group>

      <Group title="Button — sizes, icons, full width">
        <View style={styles.wrapRow}>
          {SIZES.map((size) => (
            <Sample key={size} label={size}>
              <Button label="Go to store" size={size} trailingIcon="open-outline" onPress={noop} />
            </Sample>
          ))}
          {SIZES.map((size) => (
            <Sample key={size} label={`${size} + icon`}>
              <Button label="Alert me" size={size} variant="secondary" icon="notifications-outline" onPress={noop} />
            </Sample>
          ))}
        </View>
        <Button label="Full width, lg" size="lg" fullWidth onPress={noop} />
      </Group>

      <Group title="IconButton">
        <View style={styles.wrapRow}>
          {(['filled', 'plain', 'accent'] as const).map((variant) => (
            <Sample key={variant} label={variant}>
              <IconButton icon="bookmark-outline" label={`${variant} icon button`} variant={variant} onPress={noop} />
            </Sample>
          ))}
          <Sample label="sm">
            <IconButton icon="close" label="Small icon button" size="sm" onPress={noop} />
          </Sample>
          <Sample label="active">
            <IconButton icon="bookmark" label="Active icon button" active tint={c.accent} onPress={noop} />
          </Sample>
          {STATES.slice(1).map((s) => (
            <Sample key={s.name} label={s.name}>
              <IconButton icon="barcode-outline" label={`${s.name} icon button`} forceState={s.force} disabled={s.disabled} loading={s.loading} onPress={noop} />
            </Sample>
          ))}
        </View>
      </Group>

      <Group title="Chip">
        <View style={styles.wrapRow}>
          <Sample label="default">
            <Chip label="rice cooker" icon="time-outline" onPress={noop} />
          </Sample>
          <Sample label="filter (tap)">
            <Chip label="In stock" role="checkbox" icon={chip ? 'checkmark' : 'cube-outline'} selected={chip} onPress={() => setChip((v) => !v)} />
          </Sample>
          <Sample label="leading">
            <Chip label="Walmart" role="checkbox" leading={<RetailerMark id="walmart" size={18} />} onPress={noop} />
          </Sample>
          <Sample label="accent">
            <Chip label="Under $60" tone="accent" trailingIcon="pencil" onPress={noop} />
          </Sample>
          <Sample label="static">
            <Chip label="Not pressable" />
          </Sample>
          <Sample label="hover">
            <Chip label="Chip" forceState="hover" onPress={noop} />
          </Sample>
          <Sample label="pressed">
            <Chip label="Chip" forceState="pressed" onPress={noop} />
          </Sample>
          <Sample label="focus">
            <Chip label="Chip" forceState="focus" onPress={noop} />
          </Sample>
          <Sample label="disabled">
            <Chip label="Chip" disabled onPress={noop} />
          </Sample>
        </View>
      </Group>

      <Group title="SegmentedControl">
        <SegmentedControl
          accessibilityLabel="Example segments"
          value={segment}
          onChange={setSegment}
          options={[
            { key: 'a', label: 'Saved' },
            { key: 'b', label: 'Alerts', badge: 2 },
            { key: 'c', label: 'Third' },
          ]}
        />
        <SegmentedControl accessibilityLabel="Focused segment" value="a" onChange={noop} forceState="focus" options={[{ key: 'a', label: 'Selected' }, { key: 'b', label: 'Focus' }]} />
        <SegmentedControl accessibilityLabel="Pressed segment" value="a" onChange={noop} forceState="pressed" options={[{ key: 'a', label: 'Selected' }, { key: 'b', label: 'Pressed' }]} />
        <SegmentedControl accessibilityLabel="Full width segments" value="a" onChange={noop} fullWidth options={[{ key: 'a', label: 'Full' }, { key: 'b', label: 'Width' }]} />
        <SegmentedControl accessibilityLabel="Disabled segments" value="a" onChange={noop} disabled options={[{ key: 'a', label: 'Disabled' }, { key: 'b', label: 'Control' }]} />
      </Group>

      <Group title="TextField">
        <TextField label="Default" value={field} onChangeText={setField} placeholder="e.g. 94103" hint="A hint under the field." />
        <TextField label="Empty with prefix" value="" onChangeText={noop} prefix="$" placeholder="0.00" />
        <TextField label="Focused" value="49.99" onChangeText={noop} prefix="$" forceFocus />
        <TextField label="Error" value="9410" onChangeText={noop} error="Enter a 5-digit ZIP code, or leave it empty." />
        <TextField label="Disabled" value="94103" onChangeText={noop} disabled />
      </Group>

      <Group title="ToggleRow">
        <Card>
          <ToggleRow label="On / off (tap)" detail="Detail text explains what the switch does." value={toggle} onValueChange={setToggle} />
          <ToggleRow label="Off" value={false} onValueChange={noop} divider />
          <ToggleRow label="With leading" leading={<RetailerMark id="costco" size={30} />} value onValueChange={noop} divider />
          <ToggleRow label="Disabled" value onValueChange={noop} disabled divider />
        </Card>
      </Group>

      <Group title="ListRow">
        <Card>
          <ListRow title="Navigation row" icon="shield-checkmark-outline" onPress={noop} />
          <ListRow title="With value" subtitle="And a subtitle" icon="location-outline" value="94103" onPress={noop} divider />
          <ListRow title="Hover" icon="document-text-outline" onPress={noop} forceState="hover" divider />
          <ListRow title="Pressed" icon="document-text-outline" onPress={noop} forceState="pressed" divider />
          <ListRow title="Focus" icon="document-text-outline" onPress={noop} forceState="focus" divider />
          <ListRow title="Destructive" icon="trash-outline" destructive onPress={noop} divider />
          <ListRow title="Disabled" icon="lock-closed-outline" disabled onPress={noop} divider />
          <ListRow title="Static (no action)" subtitle="No chevron, not pressable" icon="information-circle-outline" divider />
        </Card>
      </Group>

      <Group title="Banner">
        <Banner tone="info" title="Info" text="Neutral explanation with an action." action={{ label: 'Action', onPress: noop }} />
        <Banner tone="accent" title="Accent" text="Used for what the AI understood or picked." />
        <Banner tone="notice" title="DRAFT — placeholder text" text="Caution that needs attention but is not an error." onDismiss={noop} />
        <Banner tone="danger" title="Danger" text="Something failed and can be retried." action={{ label: 'Try again', onPress: noop }} />
        <Banner tone="notice" compact title="Demo prices" text="Sample data for testing. These are not real store prices." />
        <Banner tone="info" compact text="Compact info strip." />
      </Group>

      <Group title="Badge">
        <View style={styles.wrapRow}>
          <Badge kind="best" label="Best price" />
          <Badge kind="accent" label="For you" icon="sparkles" />
          <Badge kind="neutral" label="Active" icon="time-outline" />
          <Badge kind="danger" label="Out of stock everywhere" />
          <Badge kind="notice" label="Not answered" />
          <CountBadge count={3} />
          <CountBadge count={12} />
        </View>
      </Group>

      <Group title="Toast">
        <ToastView text="Alert set at $48.49. Check Saved › Alerts." tone="success" />
        <ToastView text="Alert deleted." tone="neutral" />
        <ToastView text="Can't reach the server. The alert was not deleted." tone="danger" />
        <Button label="Show a real toast" variant="secondary" size="sm" onPress={() => toast('This is a toast.', 'success')} testID={`gallery-toast-${scheme}`} />
      </Group>

      <Group title="Sheet">
        <SheetSurface
          title="Sheet title"
          onClose={noop}
          footer={
            <>
              <Button label="Cancel" variant="secondary" size="lg" fullWidth style={styles.grow} onPress={noop} />
              <Button label="Confirm" size="lg" fullWidth style={styles.grow} onPress={noop} />
            </>
          }
        >
          <Text variant="body" tone="textSecondary">
            Body content. On phones the sheet docks to the bottom edge; on wider screens it is a centered dialog like this one.
          </Text>
        </SheetSurface>
        <Button label="Open a real sheet" variant="secondary" size="sm" onPress={() => setSheet(true)} testID={`gallery-sheet-${scheme}`} />
        <Sheet visible={sheet} onClose={() => setSheet(false)} title="A real sheet" footer={<Button label="Done" size="lg" fullWidth style={styles.grow} onPress={() => setSheet(false)} />}>
          <Text variant="body" tone="textSecondary">
            Opened as a modal, so it follows the system appearance rather than this panel’s.
          </Text>
        </Sheet>
      </Group>

      <Group title="EmptyState">
        <Card>
          <EmptyState compact icon="bookmark-outline" title="Nothing saved yet" detail="Neutral empty state with one action." action={<Button label="Find something" icon="search" onPress={noop} />} />
        </Card>
        <Card>
          <EmptyState
            compact
            tone="danger"
            icon="cloud-offline-outline"
            title="Can’t reach the server"
            detail="Error state with two actions."
            action={
              <>
                <Button label="Try again" icon="refresh" variant="secondary" onPress={noop} />
                <Button label="Secondary action" variant="tertiary" onPress={noop} />
              </>
            }
          />
        </Card>
      </Group>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="overline" tone="textTertiary">
        {title}
      </Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.sample}>
      {children}
      <Text variant="caption" tone="textTertiary">
        {label}
      </Text>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl },
  panels: { gap: space.lg, padding: space.lg },
  panelsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  panel: { flex: 1, minWidth: 0, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  group: { marginTop: space.xl },
  groupBody: { marginTop: space.sm, gap: space.md },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: space.md, rowGap: space.sm },
  sample: { alignItems: 'center', gap: 2 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.xs },
  grow: { flex: 1 },
});
