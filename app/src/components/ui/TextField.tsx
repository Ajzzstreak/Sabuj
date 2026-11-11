import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { continuous, radius, space, type as typeScale, useTheme } from '@/theme';
import { Text } from '../Text';

export interface TextFieldProps extends Pick<TextInputProps, 'keyboardType' | 'inputMode' | 'maxLength' | 'autoFocus' | 'autoCapitalize' | 'autoComplete' | 'returnKeyType' | 'multiline'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Shown under the field when there is no error. */
  hint?: string;
  /** Turns the field red and is announced. */
  error?: string | null;
  /** Fixed text before the value, e.g. "$". */
  prefix?: string;
  trailing?: ReactNode;
  disabled?: boolean;
  onSubmit?: () => void;
  /** Gallery only. */
  forceFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TextField({ label, value, onChangeText, placeholder, hint, error, prefix, trailing, disabled = false, onSubmit, forceFocus = false, style, testID, ...input }: TextFieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const on = focused || forceFocus;
  const border = error ? c.danger : on ? c.accent : c.borderStrong;
  return (
    <View style={[styles.wrap, style]}>
      <Text variant="footnoteStrong" tone="textSecondary" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.box, continuous, { borderColor: border, backgroundColor: disabled ? c.fill : c.surface, opacity: disabled ? 0.6 : 1 }]}>
        {prefix ? (
          <Text variant="body" tone="textSecondary">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={c.textTertiary}
          selectionColor={c.accent}
          autoCorrect={false}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          aria-invalid={error ? true : undefined}
          maxFontSizeMultiplier={1.4}
          {...input}
          style={[typeScale.body, styles.input, { color: c.text }, webNoOutline]}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityRole="alert" style={styles.note} testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="textSecondary" style={styles.note}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  label: { marginBottom: 6 },
  box: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.md - 2, paddingHorizontal: space.md },
  input: { flex: 1, minWidth: 0, paddingVertical: Platform.OS === 'web' ? 10 : 8, lineHeight: undefined },
  note: { marginTop: 6 },
});
