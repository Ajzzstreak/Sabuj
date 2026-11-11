import { useState, type ReactNode } from 'react';
import { Platform, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { isKeyboardModality } from '@/lib/modality';
import { useTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** For the component gallery: render a state without the interaction that causes it. */
export type ForcedState = 'pressed' | 'hover' | 'focus';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. 1 disables the effect. */
  scaleTo?: number;
  /**
   * Draw the keyboard focus ring on this element. Set false when the visible
   * shape is an inner view; then use the render-prop child to place the ring.
   */
  ring?: boolean;
  forceState?: ForcedState;
  children?: ReactNode | ((state: { focusVisible: boolean }) => ReactNode);
}

/** The keyboard focus ring, shared by every interactive element (web only). */
export function useFocusRing(): ViewStyle | null {
  const { c } = useTheme();
  if (Platform.OS !== 'web') return null;
  return { outlineStyle: 'solid', outlineWidth: 2, outlineColor: c.accent, outlineOffset: 2 } as ViewStyle;
}

/**
 * The one touchable every interactive element is built on: gives a little under
 * the finger, dims on hover, shows a focus ring for keyboard users and goes
 * inert when disabled.
 */
export function PressableScale({
  style,
  scaleTo = 0.97,
  ring = true,
  forceState,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(forceState === 'pressed' ? 1 : 0);
  const hovered = useSharedValue(forceState === 'hover' ? 1 : 0);
  const [focused, setFocused] = useState(false);
  const ringStyle = useFocusRing();
  const focusVisible = (focused || forceState === 'focus') && !disabled;
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    opacity: 1 - 0.14 * pressed.value - 0.08 * hovered.value * (1 - pressed.value),
  }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        pressed.value = withTiming(1, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        if (forceState !== 'pressed') pressed.value = withSpring(0, { damping: 18, stiffness: 260 });
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        hovered.value = withTiming(1, { duration: 120 });
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        if (forceState !== 'hover') hovered.value = withTiming(0, { duration: 160 });
        onHoverOut?.(e);
      }}
      onFocus={(e) => {
        if (isKeyboardModality()) setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[Platform.OS === 'web' ? (disabled ? webDisabled : webCursor) : null, webNoOutline, style, ring && focusVisible ? ringStyle : null, animated]}
    >
      {typeof children === 'function' ? children({ focusVisible }) : children}
    </AnimatedPressable>
  );
}

const webCursor = { cursor: 'pointer' } as ViewStyle;
const webDisabled = { cursor: 'not-allowed' } as unknown as ViewStyle;
const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as ViewStyle | null;
