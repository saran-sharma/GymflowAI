/**
 * Things that sit on top of a screen.
 *
 * One shape, deliberately: a bottom sheet. Three screens had each grown their
 * own `Modal` with the same near-black backdrop and a centred card, and a
 * centred card is the wrong shape on a phone — it puts its actions in the
 * middle of the screen, furthest from the thumb, and leaves no room for a list.
 *
 * The things that make a sheet work on a real Android phone are all here rather
 * than remembered per call site: it clears the navigation bar, it scrolls when
 * its content is taller than the screen, the hardware back button closes it,
 * and tapping the backdrop closes it.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Motion } from './motion';
import { Row, Spacer, Text } from './primitives';
import { color, radii, space } from './tokens';
import { useThemedStyles } from './useThemedStyles';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Shown top-left. Omit for a sheet whose content speaks for itself. */
  title?: string;
  /** Sits under the title, quieter. */
  subtitle?: string;
  /** Replaces the scrolling body — for a sheet that manages its own layout. */
  children: React.ReactNode;
  /** Pinned below the scroll area, above the safe-area inset. */
  footer?: React.ReactNode;
  testID?: string;
}

/**
 * A sheet that rises from the bottom of the screen.
 *
 * `maxHeight` is a fraction of the screen rather than a fixed number so a long
 * menu scrolls inside the sheet instead of running off a short phone — the
 * failure that only shows up on the one device nobody tested on.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(buildOverlayStyles);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's hardware back must close a sheet. Without this it closes the
      // screen underneath, which is a data-loss bug in a sheet with a form.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* The backdrop is the dismiss target, and is not announced: a screen
            reader reaching "close" twice is worse than reaching it once. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

        <Motion.View style={styles.sheet} testID={testID}>
          <View style={styles.grabber} />

          {title ? (
            <Row gap="md" style={styles.header}>
              <View style={styles.grow}>
                <Text variant="heading" numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Spacer />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={space.md}
                style={styles.close}
              >
                <Text variant="label" tone={color.textSecondary}>
                  Close
                </Text>
              </Pressable>
            </Row>
          ) : null}

          <ScrollView
            // A sheet often holds a form; without this a tap on a button while
            // the keyboard is up only dismisses the keyboard.
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}

          {/* Clears the Android navigation bar. Without it the last row of a
              sheet sits underneath the system gesture area. */}
          <View style={{ height: Math.max(insets.bottom, space.md) }} />
        </Motion.View>
      </View>
    </Modal>
  );
}

function buildOverlayStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    sheet: {
      maxHeight: '88%',
      backgroundColor: color.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      borderTopWidth: 1,
      borderColor: color.border,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      marginTop: space.md,
      backgroundColor: color.borderStrong,
    },
    header: {
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
      paddingBottom: space.sm,
    },
    close: { paddingVertical: space.xs, paddingLeft: space.md },
    body: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
    footer: {
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      gap: space.sm,
      borderTopWidth: 1,
      borderTopColor: color.border,
    },
  });
}
