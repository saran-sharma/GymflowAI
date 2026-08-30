/**
 * ScreenBackground — a low-opacity editorial photo behind a screen's content.
 *
 * This is texture, never a hero image and never a wallpaper. Every knob that
 * decides how present the photo is — which asset, how opaque, the flat scrim
 * over it, the fade toward the content-heavy lower half — lives in the tables
 * at the top of this file, so the treatment is one decision in one place
 * rather than a per-screen guess.
 *
 * Rendered by `Screen` when a screen opts in with `background="…"`. It sits
 * behind everything, ignores touches, and is hidden from the accessibility
 * tree. Cards (`Surface`/`Card`) are opaque, so content keeps its own ground
 * and its contrast regardless of what is behind the screen.
 *
 * The three photos are all dark. Dark mode can carry them at face value; light
 * mode drops the opacity, leans harder on the scrim and adds a faint blur so a
 * dark photo never turns into muddy grey patches under dark text.
 */

import React, { useId } from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Sibling design modules by relative path, not the barrel: `primitives`
// imports this file and the barrel re-exports `primitives`, so routing through
// the barrel here would close that loop.
import { color } from './tokens';
import { useTheme } from '../store/ThemeContext';

export type ScreenBackgroundVariant = 'member' | 'trainer' | 'owner' | 'auth';
export type ScreenBackgroundIntensity = 'subtle' | 'low' | 'medium' | 'bold';

/**
 * One image per role-feel. Member is aspirational — a spotlit platform.
 * Owner and trainer share the dark, red-lit room: premium and understated,
 * and its only bright bits are thin neon lines that never pool into a muddy
 * patch behind data. Auth gets the wide commercial floor behind the wordmark,
 * where the treatment is strong enough to carry a brighter photo.
 */
const IMAGE: Record<ScreenBackgroundVariant, ImageSourcePropType> = {
  member: require('../../assets/backgrounds/gym-spotlight.jpg'),
  trainer: require('../../assets/backgrounds/gym-neon.jpg'),
  owner: require('../../assets/backgrounds/gym-neon.jpg'),
  auth: require('../../assets/backgrounds/gym-floor.jpg'),
};

/**
 * What a screen gets if it passes only `variant`. Member Home carries the
 * most-present photo of any *content* screen, but still short of `medium`:
 * its cards are opaque `#111` on a `#0A` page, and a brighter photo lets a
 * highlight out-lighten a card, which reads as the photo sitting *on top of*
 * the content. `auth` can go `bold` because it has almost no cards.
 */
const DEFAULT_INTENSITY: Record<ScreenBackgroundVariant, ScreenBackgroundIntensity> = {
  member: 'low',
  trainer: 'low', // data is primary; imagery is a hint
  owner: 'subtle', // data-heavy dashboard — barely there
  auth: 'bold', // few controls, huge type — readability is easy here
};

/**
 * Fraction of the photo that shows through, before the light-mode discount.
 * "subtle" and "low" are deliberately near-subliminal — the screens that use
 * them are data-dense, and their cards sit only a step above the page.
 */
const PHOTO_OPACITY: Record<ScreenBackgroundIntensity, number> = {
  subtle: 0.05,
  low: 0.08,
  medium: 0.14,
  bold: 0.2,
};

/**
 * Flat wash of the page colour over the photo, per intensity. This is what
 * actually keeps a photo from reading as a *scene*: it crushes the bright
 * regions (windows, spotlight, neon) toward the page so nothing behind the
 * content approaches text luminance. The quieter the intensity, the heavier
 * the wash.
 */
const SCRIM_DARK: Record<ScreenBackgroundIntensity, number> = {
  subtle: 0.34,
  low: 0.24,
  medium: 0.12,
  bold: 0.06,
};

/**
 * Resolve the final treatment for a (variant, intensity, scheme). Exported so
 * the component test can assert the numbers without reaching into rendered
 * style objects.
 */
export function resolveTreatment(
  variant: ScreenBackgroundVariant,
  intensity: ScreenBackgroundIntensity | undefined,
  scheme: 'light' | 'dark',
) {
  const isDark = scheme === 'dark';
  const step = intensity ?? DEFAULT_INTENSITY[variant];
  const base = PHOTO_OPACITY[step];
  const darkScrim = SCRIM_DARK[step];
  return {
    // A dark photo over a light page turns to grey mud fast — hold it back.
    photoOpacity: Number((base * (isDark ? 1 : 0.5)).toFixed(3)),
    // Light mode needs a heavier wash still — a dark photo under dark text is
    // the failure mode there.
    scrimOpacity: isDark ? darkScrim : Math.min(0.62, darkScrim + 0.3),
    // Fade toward the bottom, where the card stack piles up: clear at the
    // very top (behind a greeting / wordmark, where nothing competes), then
    // ramping to a heavy page-colour wash by mid-screen so content sits on
    // calm ground.
    fadeMidOpacity: isDark ? 0.34 : 0.42,
    fadeEndOpacity: isDark ? 0.72 : 0.72,
    // A dark photo reads as texture, not imagery, with a touch of blur; the
    // dark theme doesn't need it.
    blurRadius: isDark ? 0 : 2,
  };
}

export function ScreenBackground({
  variant,
  intensity,
  testID = 'screen-background',
}: {
  variant: ScreenBackgroundVariant;
  intensity?: ScreenBackgroundIntensity;
  testID?: string;
}) {
  const { resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  // `useId()` returns strings like ":r0:" — the colons are not valid in an
  // SVG fragment id / `url(#…)` reference, so strip them.
  const gradientId = `screen-bg-fade-${useId().replace(/:/g, '')}`;
  const t = resolveTreatment(variant, intensity, resolvedScheme);
  const bg = color.background;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.layer,
        // Bleed back under the status bar / nav bar that `Screen`'s
        // SafeAreaView padded away, so the photo is genuinely full-bleed.
        { top: -insets.top, bottom: -insets.bottom, left: -insets.left, right: -insets.right },
      ]}
    >
      <Image
        testID={`${testID}-image`}
        source={IMAGE[variant]}
        resizeMode="cover"
        blurRadius={t.blurRadius}
        accessibilityIgnoresInvertColors
        style={[StyleSheet.absoluteFill, { opacity: t.photoOpacity }]}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bg, opacity: t.scrimOpacity }]} />
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={bg} stopOpacity={0} />
            <Stop offset="0.16" stopColor={bg} stopOpacity={0} />
            <Stop offset="0.4" stopColor={bg} stopOpacity={t.fadeMidOpacity} />
            <Stop offset="1" stopColor={bg} stopOpacity={t.fadeEndOpacity} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', overflow: 'hidden' },
});
