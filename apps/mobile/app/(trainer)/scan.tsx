/**
 * QR scanner.
 *
 * The camera reads the rotating code on the branch's desk screen and hands the
 * raw token back to the shift screen. Nothing is validated here — the token
 * only means anything to the server, which checks it against that branch's
 * secret and the current time window.
 */

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Screen, Txt } from '../../src/components/ui';
import { colors, radius, spacing } from '../../src/theme';

/** The prefix every GymFlow branch token carries. */
const TOKEN_PREFIX = 'GFQ1.';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();
  const [hint, setHint] = useState<string | null>(null);

  // A camera fires the same barcode many times a second; one scan per visit.
  const handled = useRef(false);

  function onScanned(value: string) {
    if (handled.current) return;

    if (!value.startsWith(TOKEN_PREFIX)) {
      setHint('That is not a GymFlow check-in code. Scan the code on the branch screen.');
      return;
    }

    handled.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace({
      pathname: '/(trainer)',
      params: { scannedToken: value, scanNonce: String(Date.now()) },
    });
  }

  if (!permission) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Txt variant="body" color={colors.textMuted}>
            Preparing the camera…
          </Txt>
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={44} color={colors.textFaint} />
          <Txt variant="heading" style={styles.centerText}>
            Camera access needed
          </Txt>
          <Txt variant="body" color={colors.textMuted} style={styles.centerText}>
            GymFlow scans the QR code shown at your branch to prove you are on site. You can use
            your PIN instead if you prefer.
          </Txt>
          <View style={styles.actions}>
            <Button title="Allow camera" onPress={requestPermission} icon="camera" />
            <Button title="Go back" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => onScanned(data)}
      />

      <Screen edges={['top', 'bottom']} style={styles.overlay}>
        <View style={styles.overlayTop}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            style={styles.close}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.reticleWrap}>
          <View style={styles.reticle} />
          <Txt variant="heading" style={styles.centerText}>
            Scan the branch code
          </Txt>
          <Txt variant="body" color={colors.textMuted} style={styles.centerText}>
            {hint ?? 'Point the camera at the GymFlow code on the front desk screen.'}
          </Txt>
        </View>

        <View style={styles.overlayBottom}>
          <Button title="Use PIN instead" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  overlay: { backgroundColor: 'transparent' },
  overlayTop: { padding: spacing.lg, alignItems: 'flex-end' },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  reticle: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.brand,
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  centerText: { textAlign: 'center' },
  actions: { marginTop: spacing.lg, gap: spacing.md, alignSelf: 'stretch', paddingHorizontal: spacing.xl },
  overlayBottom: { padding: spacing.xl, gap: spacing.md },
});
