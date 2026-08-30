/**
 * The read-only progress-photo strip a trainer or owner sees on a member's
 * detail screen.
 *
 * Shows only the photos the member has consented to share with that role, and
 * only within branch scope — the API enforces both. When there is nothing to
 * show it says so plainly rather than implying the member has no photos.
 */

import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { apiUrl } from '../api/client';
import * as api from '../api/endpoints';
import type { ProgressPhoto } from '../api/types';
import { Badge, EmptyState, Row, Section, Spacer, Text, color, space } from '../design';
import { useApi } from '../hooks/useApi';

export function MemberProgressPhotos({ memberId }: { memberId: number }) {
  const photos = useApi<ProgressPhoto[]>((token) => api.memberProgressPhotos(memberId, token), [
    memberId,
  ]);

  if (photos.loading) {
    return (
      <Section title="Progress photos">
        <Text variant="label" tone={color.textTertiary}>
          Loading…
        </Text>
      </Section>
    );
  }

  const rows = photos.data ?? [];

  return (
    <Section title="Progress photos">
      {photos.error || rows.length === 0 ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Nothing shared"
          detail="Progress photos are private to the member. They appear here only for photos the member chooses to share with you."
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {rows.map((photo) => (
            <View key={photo.id} style={styles.cell} testID={`member-progress-photo-${photo.id}`}>
              <Image
                source={{ uri: apiUrl(photo.image_url) }}
                style={styles.thumb}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <Row gap="xs" style={styles.caption}>
                <Text variant="label" tone={color.textSecondary}>
                  {photo.taken_on}
                </Text>
                <Spacer />
                <Badge label={photo.angle} tone="neutral" />
              </Row>
            </View>
          ))}
        </ScrollView>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.sm, paddingVertical: space.xs },
  cell: { width: 130, gap: space.xxs },
  thumb: { width: 130, height: 174, borderRadius: 12, backgroundColor: color.surface },
  caption: { alignItems: 'center' },
});
