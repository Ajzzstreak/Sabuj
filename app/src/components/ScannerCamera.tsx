import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { APP_NAME } from '@/config';
import { radius, space } from '@/theme';
import { Text } from './Text';
import { Button, EmptyState, IconButton } from './ui';

/** False on the web build (ScannerCamera.web.tsx), where codes are typed instead. */
export const cameraAvailable = true;

export interface ScannerCameraProps {
  /** Called with the digits of each UPC-A / UPC-E / EAN-13 / EAN-8 code seen. */
  onCode: (code: string) => void;
  /** Stop reporting codes (a lookup is running or a result is showing). */
  paused: boolean;
  onManual: () => void;
}

/**
 * Live barcode scanner. Camera permission is requested only after the user
 * has read why and pressed "Allow camera"; it is never requested on mount.
 */
export function ScannerCamera({ onCode, paused, onManual }: ScannerCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);

  if (!permission) return <View style={styles.fill} />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <EmptyState
        testID="camera-explainer"
        icon="barcode-outline"
        title="Scan a barcode"
        detail={
          blocked
            ? `Camera access is turned off for ${APP_NAME}. Turn it on in Settings, or type the numbers under the barcode.`
            : `${APP_NAME} uses the camera only to read the barcode on a product. Nothing is recorded, and only the number is sent to look the product up.`
        }
        action={
          <>
            {blocked ? (
              <Button label="Open Settings" icon="settings-outline" onPress={() => void Linking.openSettings()} />
            ) : (
              <Button label="Allow camera" icon="camera-outline" onPress={() => void requestPermission()} testID="camera-allow" />
            )}
            <Button label="Type the code instead" variant="tertiary" onPress={onManual} testID="scan-manual" />
          </>
        }
      />
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8'] }}
        onBarcodeScanned={paused ? undefined : ({ data }) => onCode(data.replace(/\D/g, ''))}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} accessible accessibilityLabel="Point the camera at a barcode" />
        <View style={styles.caption}>
          <Text variant="calloutStrong" color="#FFFFFF" center>
            Hold the barcode inside the frame
          </Text>
        </View>
        <View style={styles.controls}>
          <View style={styles.torch}>
            <IconButton icon={torch ? 'flashlight' : 'flashlight-outline'} label={torch ? 'Turn the light off' : 'Turn the light on'} active={torch} tint="#131316" onPress={() => setTorch((v) => !v)} testID="torch" />
          </View>
          <Button label="Type the code instead" variant="secondary" icon="keypad-outline" onPress={onManual} testID="scan-manual" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  frame: { width: '86%', maxWidth: 420, aspectRatio: 1.7, borderRadius: radius.lg, borderWidth: 3, borderColor: '#FFFFFF' },
  caption: { marginTop: space.lg, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  controls: { position: 'absolute', bottom: space.xxl, flexDirection: 'row', alignItems: 'center', gap: space.md },
  torch: { borderRadius: 22, backgroundColor: '#FFFFFF' },
});
