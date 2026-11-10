import { Platform, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. 1 disables the effect. */
  scaleTo?: number;
}

/** A touchable that gives a little under the finger, then springs back. */
export function PressableScale({ style, scaleTo = 0.97, onPressIn, onPressOut, onHoverIn, onHoverOut, disabled, ...rest }: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const hovered = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.value }],
    opacity: 1 - 0.08 * pressed.value - 0.06 * hovered.value * (1 - pressed.value),
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
        pressed.value = withSpring(0, { damping: 18, stiffness: 260 });
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        hovered.value = withTiming(1, { duration: 120 });
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        hovered.value = withTiming(0, { duration: 160 });
        onHoverOut?.(e);
      }}
      style={[Platform.OS === 'web' && !disabled ? webCursor : null, style, animated]}
    />
  );
}

const webCursor = { cursor: 'pointer' } as ViewStyle;
