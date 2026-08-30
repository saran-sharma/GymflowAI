/**
 * Member → Progress → Progress Photos.
 *
 * Private by default: a photo is the member's alone until they explicitly turn
 * on "my trainer can see this" or "gym management can see this", and even then
 * the viewer still has to be the assigned trainer or same-branch management.
 * There is no public URL — every thumbnail loads through a short-lived signed
 * link the API mints per response.
 *
 * Upload goes straight to the authenticated GymFlow API as multipart; the
 * bytes never touch the app's own storage or a third party.
 */

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native';

import { ApiError, OFFLINE_CODE, apiUrl } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ProgressPhoto, ProgressPhotoAngle } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Chips,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  Row,
  Screen,
  Section,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';

const ANGLES: { value: ProgressPhotoAngle | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
];

const UPLOAD_ANGLES: { value: ProgressPhotoAngle; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProgressPhotosScreen() {
  const router = useRouter();
  const { withToken } = useAuth();
  const [angle, setAngle] = useState<ProgressPhotoAngle | 'all'>('all');
  const photos = useApi<ProgressPhoto[]>(
    (token) => api.myProgressPhotos(token, angle === 'all' ? undefined : angle),
    [angle],
  );

  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<ProgressPhoto | null>(null);
  const [pending, setPending] = useState<{
    uri: string;
    mime?: string | null;
    name?: string | null;
  } | null>(null);
  const [uploadAngle, setUploadAngle] = useState<ProgressPhotoAngle>('front');
  const [takenOn, setTakenOn] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAdd = useCallback(() => {
    setPending(null);
    setUploadAngle(angle === 'all' ? 'front' : angle);
    setTakenOn(today());
    setNote('');
    setError(null);
  }, [angle]);

  const pick = useCallback(
    async (source: 'library' | 'camera') => {
      setError(null);
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          source === 'camera'
            ? 'Camera access is off. You can turn it on in Settings, or pick from your library instead.'
            : 'Photo access is off. Turn it on in Settings to add a progress photo.',
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.85,
            });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPending({ uri: asset.uri, mime: asset.mimeType, name: asset.fileName });
    },
    [],
  );

  const upload = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await withToken((token) =>
        api.uploadProgressPhoto(
          {
            uri: pending.uri,
            angle: uploadAngle,
            taken_on: takenOn,
            note: note.trim() || null,
            mime_type: pending.mime ?? 'image/jpeg',
            file_name: pending.name ?? undefined,
          },
          token,
        ),
      );
      setAdding(false);
      resetAdd();
      await photos.reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === OFFLINE_CODE
          ? "We couldn't reach GymFlow. Your photo wasn't uploaded — try again on a better connection."
          : caught instanceof ApiError
            ? caught.message
            : 'The upload failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [pending, uploadAngle, takenOn, note, withToken, photos, resetAdd]);

  const mutate = useCallback(
    async (fn: (token: string) => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await withToken(fn);
        await photos.reload();
        setSelected(null);
      } catch {
        setError('That change did not save. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [withToken, photos],
  );

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

  const rows = photos.data ?? [];

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
          <Text variant="title">Progress photos</Text>
          <Text variant="body" tone={color.textSecondary}>
            Private to you. Nobody at the gym sees a photo unless you turn that on for it.
          </Text>
        </Stack>

        <Row gap="sm">
          <Button
            title="Add photo"
            icon="add"
            block={false}
            testID="progress-photo-add"
            onPress={() => {
              resetAdd();
              setAdding(true);
            }}
          />
          <Spacer />
          {rows.length >= 2 ? (
            <Button
              title="Before / after"
              variant="secondary"
              block={false}
              testID="progress-photo-compare"
              onPress={() => router.push('/(member)/progress-compare' as never)}
            />
          ) : null}
        </Row>

        <Chips
          options={ANGLES}
          value={angle}
          onChange={(v) => setAngle(v as ProgressPhotoAngle | 'all')}
          testIDPrefix="progress-photo-angle"
        />

        {error && !adding && !selected ? (
          <Banner tone="critical" icon="alert-circle-outline" testID="progress-photo-error">
            {error}
          </Banner>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="camera-outline"
            title="No photos yet"
            detail="Add a front, side or back photo to start your timeline."
          />
        ) : (
          <View style={styles.grid} testID="progress-photo-grid">
            {rows.map((photo) => (
              <Pressable
                key={photo.id}
                style={styles.cell}
                testID={`progress-photo-${photo.id}`}
                onPress={() => setSelected(photo)}
              >
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
                {photo.trainer_visible || photo.owner_visible ? (
                  <Text variant="label" tone={color.textTertiary}>
                    Shared with {photo.trainer_visible ? 'trainer' : ''}
                    {photo.trainer_visible && photo.owner_visible ? ' & ' : ''}
                    {photo.owner_visible ? 'owner' : ''}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </Body>

      {/* ---------------------------------------------------------- add */}
      <Sheet
        visible={adding}
        onClose={() => setAdding(false)}
        title="Add a progress photo"
        testID="progress-photo-add-sheet"
        footer={
          <Button
            title="Upload"
            testID="progress-photo-upload"
            loading={busy}
            disabled={!pending}
            onPress={() => void upload()}
          />
        }
      >
        <Stack gap="lg">
          {pending ? (
            <Image
              source={{ uri: pending.uri }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Row gap="sm">
              <Button
                title="Take photo"
                icon="camera"
                variant="secondary"
                testID="progress-photo-camera"
                onPress={() => void pick('camera')}
              />
              <Button
                title="Choose from library"
                icon="images"
                variant="secondary"
                testID="progress-photo-library"
                onPress={() => void pick('library')}
              />
            </Row>
          )}

          <Stack gap="xs">
            <Text variant="caption" caps tone={color.textTertiary}>
              Angle
            </Text>
            <Chips
              options={UPLOAD_ANGLES}
              value={uploadAngle}
              onChange={setUploadAngle}
              testIDPrefix="progress-photo-upload-angle"
            />
          </Stack>

          <Input
            label="Date"
            testID="progress-photo-date"
            value={takenOn}
            onChangeText={setTakenOn}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />

          <Input
            label="Note (optional)"
            testID="progress-photo-note"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. end of week 4, morning"
            maxLength={500}
          />

          {error ? (
            <Banner tone="critical" icon="alert-circle-outline" testID="progress-photo-add-error">
              {error}
            </Banner>
          ) : null}

          <Text variant="label" tone={color.textTertiary}>
            This photo is private to you. You can choose to share it with your trainer or the gym
            owner later, one photo at a time.
          </Text>
        </Stack>
      </Sheet>

      {/* ------------------------------------------------------- manage */}
      <Sheet
        visible={selected != null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.angle} · ${selected.taken_on}` : ''}
        testID="progress-photo-detail"
        footer={
          selected ? (
            <Button
              title="Delete this photo"
              variant="destructive"
              testID="progress-photo-delete"
              loading={busy}
              onPress={() =>
                void mutate((token) => api.deleteProgressPhoto(selected.id, token))
              }
            />
          ) : null
        }
      >
        {selected ? (
          <Stack gap="lg">
            <Image
              source={{ uri: apiUrl(selected.image_url) }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {selected.note ? (
              <Text variant="body" tone={color.textSecondary}>
                {selected.note}
              </Text>
            ) : null}

            <Row gap="sm" style={styles.switchRow}>
              <Text variant="label" style={styles.grow}>
                My trainer can see this photo
              </Text>
              <Switch
                testID={`progress-photo-trainer-visible-${selected.id}`}
                value={selected.trainer_visible}
                disabled={busy}
                onValueChange={(v) =>
                  void mutate((token) =>
                    api.updateProgressPhoto(selected.id, { trainer_visible: v }, token),
                  )
                }
                trackColor={{ true: color.brand, false: color.border }}
              />
            </Row>
            <Row gap="sm" style={styles.switchRow}>
              <Text variant="label" style={styles.grow}>
                Gym management can see this photo
              </Text>
              <Switch
                testID={`progress-photo-owner-visible-${selected.id}`}
                value={selected.owner_visible}
                disabled={busy}
                onValueChange={(v) =>
                  void mutate((token) =>
                    api.updateProgressPhoto(selected.id, { owner_visible: v }, token),
                  )
                }
                trackColor={{ true: color.brand, false: color.border }}
              />
            </Row>

            {error ? (
              <Banner tone="critical" icon="alert-circle-outline">
                {error}
              </Banner>
            ) : null}
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '47%', gap: space.xxs },
  thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: color.surface },
  caption: { alignItems: 'center' },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: color.surface },
  switchRow: { alignItems: 'center' },
  grow: { flex: 1 },
});
