// The app's name / slug / scheme / bundle id live in app.identity.json and
// nowhere else. This file and src/config.ts both read from it, so renaming
// the product is a one-file change.
const identity = require('./app.identity.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: identity.name,
  slug: identity.slug,
  scheme: identity.scheme,
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#F5F4F1',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: identity.bundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: `${identity.name} uses the camera to scan product barcodes so it can look up prices. Nothing is recorded.`,
    },
  },
  android: {
    package: identity.bundleId,
    permissions: ['android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    [
      // Barcode scanning only: no microphone, no audio recording.
      'expo-camera',
      {
        cameraPermission: `${identity.name} uses the camera to scan product barcodes so it can look up prices. Nothing is recorded.`,
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      // Price-drop alerts. Android 13+ gets POST_NOTIFICATIONS from this plugin; the app
      // asks for permission only when the user creates their first alert.
      'expo-notifications',
      { color: '#5B43F0', defaultChannel: 'price-alerts' },
    ],
  ],
};
