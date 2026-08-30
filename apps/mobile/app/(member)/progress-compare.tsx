/**
 * Before / after — pick two of your own progress photos and see them side by
 * side with their dates, then share the pair on a branded card.
 *
 * Same-angle comparisons only: a front vs a back photo is not a comparison.
 * The pair never leaves the app except through the OS share sheet, and only
 * with the fields you switch on in the share step.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE, apiUrl } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ProgressPhoto, ProgressPhotoAngle } from '../../src/api/types';
import { ShareProgress } from '../../src/components/share-progress';
import {
  Badge,
  Body,
  Button,
  Card,
  Chips,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';

const ANGLES: { value: ProgressPhotoAngle; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
];

export default function ProgressCompareScreen() {
  const photos = useApi<ProgressPhoto[]>((token) => api.myProgressPhotos(token), []);
  const [angle, setAngle] = useState<ProgressPhotoAngle>('front');
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [afterId, setAfterId] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

  const forAngle = useMemo(
    () =>
      (photos.data ?? [])
        .filter((p) => p.angle === angle)
        .slice()
        .sort((a, b) => a.taken_on.localeCompare(b.taken_on)),
    [photos.data, angle],
  );

  const before = forAngle.find((p) => p.id === beforeId) ?? null;
  const after = forAngle.find((p) => p.id === afterId) ?? null;

  function tap(photo: ProgressPhoto) {
    // First tap sets "before", second sets "after"; a third resets.
    if (beforeId == null || (beforeId != null && afterId != null)) {
      setBeforeId(photo.id);
      setAfterId(null);
      return;
    }
    if (photo.id === beforeId) {
      setBeforeId(null);
      return;
    }
    setAfterId(photo.id);
  }

  if (photos.loading && !photos.data) return <Loading label="Loading your photos" />;

  if (photos.error && !photos.data) {
    const offline = photos.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your photos'}
          detail={offline ? undefined : photos.error.message}
          onRetry={photos.reload}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={photos.refreshing}
            onRefresh={photos.refresh}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Before / after</Text>
          <Text variant="body" tone={color.textSecondary}>
            Pick two {angle} photos — the earlier one becomes “before”.
          </Text>
        </Stack>

        <Chips
          options={ANGLES}
          value={angle}
          onChange={(v) => {
            setAngle(v);
            setBeforeId(null);
            setAfterId(null);
          }}
          testIDPrefix="compare-angle"
        />

        {forAngle.length < 2 ? (
          <EmptyState
            icon="images-outline"
            title={`Need two ${angle} photos`}
            detail="Add more from the Progress Photos screen to compare them."
          />
        ) : (
          <>
            {before && after ? (
              <Card gap="sm" testID="compare-result">
                <Row gap="sm">
                  <View style={styles.side}>
                    <Image
                      source={{ uri: apiUrl(before.image_url) }}
                      style={styles.photo}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                    <Text variant="label" tone={color.textSecondary} testID="compare-before-date">
                      Before · {before.taken_on}
                    </Text>
                  </View>
                  <View style={styles.side}>
                    <Image
                      source={{ uri: apiUrl(after.image_url) }}
                      style={styles.photo}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                    <Text variant="label" tone={color.textSecondary} testID="compare-after-date">
                      After · {after.taken_on}
                    </Text>
                  </View>
                </Row>
                <Button
                  title="Share progress"
                  icon="share-social"
                  testID="compare-share"
                  onPress={() => setSharing(true)}
                />
              </Card>
            ) : (
              <Text variant="label" tone={color.textTertiary}>
                {beforeId == null ? 'Tap a photo to set “before”.' : 'Now tap a later photo for “after”.'}
              </Text>
            )}

            <View style={styles.grid}>
              {forAngle.map((photo) => {
                const role =
                  photo.id === beforeId ? 'Before' : photo.id === afterId ? 'After' : null;
                return (
                  <Pressable
                    key={photo.id}
                    style={styles.cell}
                    testID={`compare-pick-${photo.id}`}
                    onPress={() => tap(photo)}
                  >
                    <Image
                      source={{ uri: apiUrl(photo.image_url) }}
                      style={[styles.thumb, role ? styles.thumbActive : null]}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                    <Row gap="xs" style={styles.caption}>
                      <Text variant="label" tone={color.textSecondary}>
                        {photo.taken_on}
                      </Text>
                      <Spacer />
                      {role ? <Badge label={role} tone="brand" /> : null}
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Body>

      <ShareProgress
        visible={sharing}
        onClose={() => setSharing(false)}
        photo={before}
        comparePhoto={after}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '47%', gap: space.xxs },
  thumb: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { borderColor: color.brand },
  caption: { alignItems: 'center' },
  side: { flex: 1, gap: space.xs },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: color.surface },
});
