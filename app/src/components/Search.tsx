import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { continuous, radius, space, type as typeScale, useTheme } from '@/theme';
import { Text } from './Text';
import { IconButton, ListRow, type Glyph } from './ui';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Enter / the keyboard's search key. Always the fast keyword path. */
  onSubmit: (text: string) => void;
  /** Shows the barcode button. */
  onScan?: () => void;
  /** Shows the sparkle "Ask in plain English" button. */
  onAsk?: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
  large?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** Leading glyph: a magnifier for search, sparkles for the ask field. */
  icon?: Glyph;
  accessibilityLabel?: string;
  maxLength?: number;
  testID?: string;
}

export function SearchField({
  value,
  onChangeText,
  onSubmit,
  onScan,
  onAsk,
  onFocusChange,
  large,
  autoFocus,
  placeholder = 'Search any product',
  icon = 'search',
  accessibilityLabel = 'Search products',
  maxLength,
  testID = 'search-input',
}: SearchFieldProps) {
  const t = useTheme();
  const { c } = t;
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        continuous,
        large ? styles.large : styles.regular,
        { backgroundColor: large ? c.surface : c.fill, borderColor: focused ? c.accent : large ? c.border : 'transparent' },
        large && t.shadow1,
      ]}
    >
      <Ionicons name={icon} size={large ? 22 : 18} color={focused ? c.accent : c.textTertiary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit(value)}
        onFocus={() => {
          setFocused(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocusChange?.(false);
        }}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        selectionColor={c.accent}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        enterKeyHint="search"
        inputMode="search"
        accessibilityLabel={accessibilityLabel}
        maxLength={maxLength}
        maxFontSizeMultiplier={1.4}
        style={[typeScale.body, large && styles.largeText, styles.input, { color: c.text }, webNoOutline]}
      />
      <View style={styles.actions}>
        {value.length > 0 ? (
          <IconButton
            icon="close-circle"
            label="Clear search"
            size="sm"
            variant="plain"
            tint={c.textTertiary}
            style={styles.tight}
            onPress={() => {
              haptic.selection();
              onChangeText('');
            }}
          />
        ) : null}
        {onScan ? <IconButton testID="scan-button" icon="barcode-outline" label="Scan a barcode" size="sm" variant="plain" style={styles.tight} onPress={onScan} /> : null}
        {onAsk ? <IconButton testID="ask-button" icon="sparkles" label="Ask in plain English" size="sm" variant="accent" style={styles.tight} onPress={() => onAsk(value)} /> : null}
      </View>
    </View>
  );
}

const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

/** Typeahead rows. The part the user already typed is quiet; the completion is bold. */
export function SuggestionList({ query, suggestions, onPick }: { query: string; suggestions: string[]; onPick: (s: string) => void }) {
  const { c } = useTheme();
  const q = query.trim().toLowerCase();
  return (
    <View accessibilityRole="list">
      {suggestions.map((s, i) => {
        const at = s.toLowerCase().indexOf(q);
        const hit = q.length > 0 && at >= 0;
        return (
          <ListRow
            key={s}
            testID={`suggestion-${i}`}
            title={s}
            accessibilityLabel={`Search for ${s}`}
            onPress={() => onPick(s)}
            divider={i > 0}
            chevron={false}
            leading={<Ionicons name="search" size={17} color={c.textTertiary} style={styles.rowIcon} />}
            trailing={<Ionicons name="arrow-up" size={16} color={c.textTertiary} style={styles.fill} />}
            titleNode={
              <Text variant="body" numberOfLines={1}>
                {hit ? (
                  <>
                    <Text variant="bodyStrong">{s.slice(0, at)}</Text>
                    <Text variant="body" tone="textSecondary">
                      {s.slice(at, at + q.length)}
                    </Text>
                    <Text variant="bodyStrong">{s.slice(at + q.length)}</Text>
                  </>
                ) : (
                  s
                )}
              </Text>
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  regular: { minHeight: 46, borderRadius: radius.md, paddingLeft: space.md, paddingRight: 2, gap: space.sm },
  large: { minHeight: 60, borderRadius: radius.lg, paddingLeft: space.lg + 2, paddingRight: space.sm, gap: space.md },
  input: { flex: 1, minWidth: 0, paddingVertical: Platform.OS === 'web' ? 10 : 8, lineHeight: undefined },
  largeText: { fontSize: 18 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  tight: { marginLeft: -4 },
  rowIcon: { marginHorizontal: 4 },
  fill: { transform: [{ rotate: '-45deg' }], marginRight: 4 },
});
