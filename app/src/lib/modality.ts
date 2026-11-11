import { Platform } from 'react-native';

/**
 * Tracks whether the last input on the web came from the keyboard, so focus
 * rings appear for keyboard users only (the `:focus-visible` rule, done by hand
 * because React Native styles cannot express pseudo-classes).
 */
let keyboard = false;

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ') keyboard = true;
  }, true);
  const pointer = () => {
    keyboard = false;
  };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('mousedown', pointer, true);
  document.addEventListener('touchstart', pointer, true);
}

export function isKeyboardModality(): boolean {
  return keyboard;
}
