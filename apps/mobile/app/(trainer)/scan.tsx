/**
 * QR scanner.
 *
 * The camera reads the rotating code on the branch's desk screen and hands the
 * raw token back to the shift screen. Nothing is validated here — the token
 * only means anything to the server, which checks it against that branch's
 * secret and the current time window. The one check this screen makes is the
 * `GFQ1.` prefix, and only to tell the trainer "that is not our code" instead
 * of bouncing them to a server error.
 *
 * A camera fires the same barcode many times a second. This screen never calls
 * `setState` on a frame it is going to ignore: the first valid read latches
 * `phase`, and a wrong code updates a hint at most once every couple of
 * seconds. The scanning animation runs entirely on the UI thread, so it holds
 * its frame rate while the JS thread is busy.
 */

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Loading,
  Screen,
  Stack,
  SuccessCheck,
  Text,
  color,
  haptics,
  radii,
  space,
  useReducedMotion,
  useThemedStyles,
} from '../../src/design';

/** The prefix every GymFlow branch token carries. */
const TOKEN_PREFIX = 'GFQ1.';
/** The square the camera should be pointed through. */
const RETICLE = 248;
/** Don't re-render a rejected-code hint more often than this. */
const HINT_THROTTLE_MS = 1800;

type Phase = 'scanning' | 'invalid' | 'success' | 'camera-error';

export default function ScanScreen() {
  const styles = useThemedStyles(buildStyles);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('scanning');
  const [torch, setTorch] = useState(false);

  // A camera fires the same barcode many times a second; one scan per visit.
  const handled = useRef(false);
  const lastHintAt = useRef(0);

  const goToPin = useCallback(() => router.back(), [router]);

  const onScanned = useCallback(
    (value: string) => {
      if (handled.current) return;

      if (!value.startsWith(TOKEN_PREFIX)) {
        // Throttled: a wrong code in frame would otherwise setState ~30×/s.
        const now = Date.now();
        if (now - lastHintAt.current < HINT_THROTTLE_MS) return;
        lastHintAt.current = now;
        setPhase('invalid');
        haptics.notify('warning');
        return;
      }

      handled.current = true;
      setPhase('success');
      haptics.notify('success');
      // A short, skippable confirmation, then hand the token to the shift
      // screen. Back-navigation during it cancels cleanly — nothing is
      // committed here.
      setTimeout(
        () => {
          router.replace({
            pathname: '/(trainer)',
            params: { scannedToken: value, scanNonce: String(Date.now()) },
          });
        },
        reduceMotion ? 150 : 620,
      );
    },
    [router, reduceMotion],
  );

  /* --------------------------------------------------------- scan line */

  const sweep = useSharedValue(0);
  const scanning = phase === 'scanning' || phase === 'invalid';
  useEffect(() => {
    if (reduceMotion || !scanning) {
      cancelAnimation(sweep);
      sweep.value = 0.5;
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(sweep);
  }, [sweep, reduceMotion, scanning]);

  const scanLine = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (RETICLE - 2) }],
  }));

  /* ------------------------------------------------------------ states */

  if (!permission) return <Loading label="Preparing the camera" />;

  if (!permission.granted) {
    const denied = permission.canAskAgain === false;
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centred}>
          <Ionicons name="camera-outline" size={44} color={color.textTertiary} />
          <Text variant="heading" align="center">
            {denied ? 'Camera is turned off for GymFlow' : 'Camera access needed'}
          </Text>
          <Text variant="body" tone={color.textSecondary} align="center" style={styles.centredBody}>
            {denied
              ? 'Turn the camera on for GymFlow in your phone’s Settings, or check in with your PIN instead.'
              : 'GymFlow scans the QR code on your branch screen to prove you are on site. You can use your PIN instead.'}
          </Text>
          <Stack gap="sm" style={styles.centredActions}>
            {!denied ? (
              <Button title="Allow camera" icon="camera" onPress={requestPermission} />
            ) : null}
            <Button title="Check in with PIN" variant="secondary" icon="keypad-outline" onPress={goToPin} />
          </Stack>
        </View>
      </Screen>
    );
  }

  if (phase === 'camera-error') {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centred}>
          <Ionicons name="alert-circle-outline" size={44} color={color.status.critical} />
          <Text variant="heading" align="center">
            The camera did not start
          </Text>
          <Text variant="body" tone={color.textSecondary} align="center" style={styles.centredBody}>
            Another app may be using it. Close it and try again, or check in with your PIN.
          </Text>
          <Stack gap="sm" style={styles.centredActions}>
            <Button title="Try again" icon="refresh" onPress={() => setPhase('scanning')} />
            <Button title="Check in with PIN" variant="secondary" icon="keypad-outline" onPress={goToPin} />
          </Stack>
        </View>
      </Screen>
    );
  }

  const frameColor =
    phase === 'success'
      ? color.status.positive
      : phase === 'invalid'
        ? color.status.caution
        : color.brand;

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={phase === 'success' ? undefined : ({ data }) => onScanned(data)}
        onMountError={() => setPhase('camera-error')}
      />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

      {/* Top bar — close, clear of the status bar. */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          hitSlop={space.sm}
          style={styles.iconButton}
        >
          <Ionicons name="close" size={24} color={color.text} />
        </Pressable>
        <Pressable
          onPress={() => setTorch((on) => !on)}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
          accessibilityState={{ selected: torch }}
          hitSlop={space.sm}
          style={[styles.iconButton, torch ? styles.iconButtonOn : null]}
        >
          <Ionicons
            name={torch ? 'flashlight' : 'flashlight-outline'}
            size={22}
            color={torch ? color.textInverse : color.text}
          />
        </Pressable>
      </View>

      {/* Reticle. */}
      <View style={styles.reticleWrap} pointerEvents="none">
        <View style={styles.reticle}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
            <View key={corner} style={[styles.corner, styles[corner], { borderColor: frameColor }]} />
          ))}
          {phase === 'success' ? (
            <View style={styles.reticleCentre}>
              <SuccessCheck size={72} accessibilityLabel="Code accepted" />
            </View>
          ) : (
            <Animated.View
              style={[
                styles.scanLine,
                { backgroundColor: frameColor },
                reduceMotion ? styles.scanLineStatic : scanLine,
              ]}
            />
          )}
        </View>

        <View style={styles.caption} pointerEvents="none">
          <Text
            variant="heading"
            align="center"
            style={styles.captionShadow}
            accessibilityLiveRegion="polite"
          >
            {phase === 'success'
              ? 'Code accepted'
              : phase === 'invalid'
                ? 'That is not a GymFlow code'
                : 'Point at the branch code'}
          </Text>
          <Text
            variant="label"
            tone={phase === 'invalid' ? color.status.caution : color.text}
            align="center"
            style={styles.captionShadow}
          >
            {phase === 'success'
              ? 'Recording your check-in…'
              : phase === 'invalid'
                ? 'Scan the rotating code on the front-desk screen.'
                : 'Hold steady — it scans on its own.'}
          </Text>
        </View>
      </View>

      {/* Bottom — PIN fallback, clear of the gesture bar. */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        <Button
          title="Use PIN instead"
          variant="secondary"
          icon="keypad-outline"
          onPress={goToPin}
        />
      </View>
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: color.background },
    scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
    centred: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.xl,
      gap: space.sm,
    },
    centredBody: { maxWidth: 320 },
    centredActions: { marginTop: space.lg, alignSelf: 'stretch', paddingHorizontal: space.lg },
    top: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: space.lg,
      paddingBottom: space.sm,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonOn: { backgroundColor: color.brand },
    reticleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
    reticle: {
      width: RETICLE,
      height: RETICLE,
      borderRadius: radii.lg,
      overflow: 'hidden',
    },
    corner: {
      position: 'absolute',
      width: 34,
      height: 34,
    },
    tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radii.lg },
    tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radii.lg },
    bl: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: radii.lg,
    },
    br: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: radii.lg,
    },
    scanLine: {
      position: 'absolute',
      left: space.md,
      right: space.md,
      height: 2,
      borderRadius: 1,
      opacity: 0.9,
    },
    scanLineStatic: { top: RETICLE / 2 - 1 },
    reticleCentre: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    caption: {
      gap: space.xs,
      alignItems: 'center',
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      borderRadius: radii.lg,
      backgroundColor: 'rgba(10,10,10,0.68)',
      maxWidth: 340,
    },
    captionShadow: {
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    bottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: space.xl,
    },
  });
}
