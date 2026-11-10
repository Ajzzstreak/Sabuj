import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { continuous, radius, space, type as typeScale, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (text: string) => void;
  onFocusChange?: (focused: boolean) => void;
  large?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, onSubmit, onFocusChange, large, autoFocus, placeholder = 'Search any product' },
  ref,
) {
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
      <Ionicons name="search" size={large ? 22 : 18} color={focused ? c.accent : c.textTertiary} />
      <TextInput
        ref={ref}
        testID="search-input"
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
        accessibilityLabel="Search products"
        maxFontSizeMultiplier={1.4}
        style={[typeScale.body, large && styles.largeText, styles.input, { color: c.text }, webNoOutline]}
      />
      {value.length > 0 ? (
        <PressableScale
          onPress={() => {
            haptic.selection();
            onChangeText('');
          }}
          accessibilityLabel="Clear search"
          hitSlop={12}
          scaleTo={0.85}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={20} color={c.textTertiary} />
        </PressableScale>
      ) : null}
    </View>
  );
});

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
          <PressableScale
            key={s}
            testID={`suggestion-${i}`}
            onPress={() => onPick(s)}
            scaleTo={0.99}
            accessibilityLabel={`Search for ${s}`}
            style={[styles.suggestion, { borderBottomColor: c.border }, i === suggestions.length - 1 && styles.last]}
          >
            <Ionicons name="search" size={17} color={c.textTertiary} />
            <Text variant="body" numberOfLines={1} style={styles.suggestionText}>
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
            <Ionicons name="arrow-up" size={16} color={c.textTertiary} style={styles.fill} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  regular: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: space.md, gap: space.sm },
  large: { minHeight: 60, borderRadius: radius.lg, paddingHorizontal: space.lg + 2, gap: space.md },
  input: { flex: 1, minWidth: 0, paddingVertical: Platform.OS === 'web' ? 10 : 8, lineHeight: undefined },
  largeText: { fontSize: 18 },
  clear: { marginLeft: 2 },
  suggestion: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  last: { borderBottomWidth: 0 },
  suggestionText: { flex: 1 },
  fill: { transform: [{ rotate: '-45deg' }] },
});
