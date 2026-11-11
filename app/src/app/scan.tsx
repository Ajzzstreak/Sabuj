import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { describeError } from '@/api/client';
import { lookupGtin } from '@/api/queries';
import { cameraAvailable, ScannerCamera } from '@/components/ScannerCamera';
import { Page, Screen, StackHeader } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Banner, Button, EmptyState, TextField } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { space, useTheme } from '@/theme';

/** GTIN lengths: EAN-8 / UPC-E (8), UPC-A (12), EAN-13 (13), GTIN-14. */
const isGtin = (code: string) => /^(\d{8}|\d{12,14})$/.test(code);

type Result = { kind: 'idle' } | { kind: 'looking'; code: string } | { kind: 'notfound'; code: string } | { kind: 'error'; code: string; message: string };

/**
 * Barcode lookup. Native: a live scanner with a manual fallback. Web: manual
 * entry only. Either way the code goes to GET /v1/lookup and a match opens
 * the product.
 */
export default function ScanScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const [mode, setMode] = useState<'camera' | 'manual'>(cameraAvailable ? 'camera' : 'manual');
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const busy = useRef(false);

  const lookup = useCallback(
    async (code: string) => {
      if (busy.current || !isGtin(code)) return;
      busy.current = true;
      setResult({ kind: 'looking', code });
      try {
        const product = await lookupGtin(client, code);
        if (product) {
          haptic.success();
          // Replace, so Back from the product returns to where the scan started.
          router.replace({ pathname: '/product/[id]', params: { id: product.id } });
        } else {
          haptic.warning();
          setResult({ kind: 'notfound', code });
        }
      } catch (err) {
        setResult({ kind: 'error', code, message: describeError(err).title });
      } finally {
        busy.current = false;
      }
    },
    [client, router],
  );

  const submitManual = () => {
    const code = text.replace(/\D/g, '');
    if (!isGtin(code)) return setFieldError('Enter the 8, 12 or 13 digits printed under the barcode.');
    setFieldError(null);
    void lookup(code);
  };
  const again = () => setResult({ kind: 'idle' });
  const looking = result.kind === 'looking';

  let body;
  if (result.kind === 'notfound') {
    body = (
      <EmptyState
        testID="scan-notfound"
        icon="help-circle-outline"
        title="We don’t know that barcode"
        detail={`Nothing in the catalog matches ${result.code}. It may still be listed under its name.`}
        action={
          <>
            <Button label="Search by typing" icon="search" onPress={() => router.replace('/')} testID="scan-search" />
            <Button label={mode === 'camera' ? 'Scan another' : 'Try another code'} variant="tertiary" onPress={again} testID="scan-again" />
          </>
        }
      />
    );
  } else if (mode === 'camera') {
    body = (
      <View style={styles.camera}>
        <ScannerCamera onCode={(code) => void lookup(code)} paused={result.kind !== 'idle'} onManual={() => setMode('manual')} />
        {looking ? (
          <View style={[styles.status, { backgroundColor: c.surface }]} accessibilityLiveRegion="polite">
            <ActivityIndicator color={c.accent} />
            <Text variant="calloutStrong">Looking up {result.code}…</Text>
          </View>
        ) : null}
        {result.kind === 'error' ? (
          <View style={styles.cameraError}>
            <Banner tone="danger" title={result.message} text="The barcode could not be looked up." action={{ label: 'Try again', onPress: again }} />
          </View>
        ) : null}
      </View>
    );
  } else {
    body = (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <Page style={styles.manual}>
          <Text variant="title1" accessibilityRole="header">
            Enter a barcode
          </Text>
          <Text variant="body" tone="textSecondary" style={styles.lead}>
            Type the numbers printed under the barcode (UPC or EAN) and we will find the product and compare its prices.
          </Text>
          <TextField
            testID="gtin-input"
            label="Barcode number"
            value={text}
            onChangeText={(v) => {
              setText(v.replace(/[^\d\s-]/g, '').slice(0, 18));
              setFieldError(null);
            }}
            placeholder="e.g. 012345678905"
            keyboardType="number-pad"
            inputMode="numeric"
            autoFocus
            disabled={looking}
            error={fieldError}
            hint="8, 12 or 13 digits."
            onSubmit={submitManual}
          />
          {result.kind === 'error' ? <Banner tone="danger" compact text={`${result.message}. The barcode could not be looked up.`} style={styles.gap} /> : null}
          <Button label="Look up" icon="search" size="lg" fullWidth loading={looking} onPress={submitManual} style={styles.gap} testID="gtin-submit" />
          {cameraAvailable ? <Button label="Use the camera" variant="tertiary" icon="camera-outline" onPress={() => setMode('camera')} style={styles.center} /> : null}
        </Page>
      </ScrollView>
    );
  }

  return (
    <Screen>
      <StackHeader title="Scan a barcode" right={<View style={styles.balance} />} />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  status: { position: 'absolute', top: space.lg, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 999 },
  cameraError: { position: 'absolute', top: space.lg, left: space.lg, right: space.lg },
  scroll: { paddingBottom: space.xxxl },
  manual: { maxWidth: 520, paddingTop: space.lg },
  lead: { marginTop: 6, marginBottom: space.xl },
  gap: { marginTop: space.lg },
  center: { alignSelf: 'center', marginTop: space.xs },
  balance: { width: 44 },
});
