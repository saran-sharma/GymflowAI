/**
 * "Share progress" — a user-initiated, one-photo-at-a-time share.
 *
 * GymFlow never posts anything and never composes the image server-side. The
 * member picks which optional fields to include, the branded card is rendered
 * here inside a `ViewShot`, captured to a temp file, and handed to the OS
 * share sheet. The server call records *that* a share happened and which
 * fields were agreed to — it returns only the sanitised labels, never a
 * phone, email, member id, trainer note or health figure.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Image, StyleSheet, Switch, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { ApiError, apiUrl } from '../api/client';
import * as api from '../api/endpoints';
import type { ProgressPhoto } from '../api/types';
import {
  Banner,
  Button,
  Input,
  Row,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';
import { useAuth } from '../store/AuthContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  photo: ProgressPhoto | null;
  comparePhoto?: ProgressPhoto | null;
};

// A single JPG icon asset already ships with the app; the wordmark is text.
const SLAM_MARK = require('../../assets/slam-logo.png');

export function ShareProgress({ visible, onClose, photo, comparePhoto }: Props) {
  const { withToken } = useAuth();
  const cardRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const [includeDate, setIncludeDate] = useState(true);
  const [includePeriod, setIncludePeriod] = useState(!!comparePhoto);
  const [message, setMessage] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<{ date?: string; period?: string; message?: string }>({});

  React.useEffect(() => {
    if (!visible) return;
    setIncludeDate(true);
    setIncludePeriod(!!comparePhoto);
    setMessage('');
    setCaption('');
    setError(null);
    setLabels({});
  }, [visible, comparePhoto]);

  if (!photo) return null;

  async function share() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Record the share + get the sanitised labels the card may show.
      const payload = await withToken((token) =>
        api.shareProgress(
          {
            photo_id: photo.id,
            compare_photo_id: comparePhoto?.id ?? null,
            caption: caption.trim() || null,
            include_date: includeDate,
            include_period: includePeriod,
            message: message.trim() || null,
          },
          token,
        ),
      );
      setLabels(payload.included);
      // 2. Let the card re-render with those labels, then capture it.
      await new Promise((r) => setTimeout(r, 60));
      const uri = await captureRef(cardRef, { format: 'jpg', quality: 0.92 });
      // 3. Hand it to the OS share sheet — never auto-post.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Share your progress',
        });
      }
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not prepare the share card. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Share progress"
      testID="share-progress"
      footer={
        <Button
          title="Share"
          icon="share-social"
          testID="share-progress-confirm"
          loading={busy}
          onPress={() => void share()}
        />
      }
    >
      <Stack gap="lg">
        {/* The branded card. Off-screen sizing is fine — ViewShot captures it. */}
        <ViewShot ref={cardRef} style={styles.card}>
         <View testID="share-progress-card" style={styles.cardInner}>
          <Row gap="sm" style={styles.brandRow}>
            <Image source={SLAM_MARK} style={styles.mark} resizeMode="contain" />
            <Text variant="heading" style={styles.brandText}>
              SLAM
            </Text>
            <Spacer />
            <Text variant="label" tone={color.textTertiary}>
              GymFlow
            </Text>
          </Row>

          <View style={styles.photos}>
            <Image
              source={{ uri: apiUrl(photo.image_url) }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {comparePhoto ? (
              <Image
                source={{ uri: apiUrl(comparePhoto.image_url) }}
                style={styles.photo}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </View>

          {(labels.date || labels.period || labels.message) && (
            <Stack gap="xxs" style={styles.cardMeta}>
              {labels.period ? (
                <Text variant="heading" testID="share-card-period">
                  {labels.period}
                </Text>
              ) : null}
              {labels.date ? (
                <Text variant="label" tone={color.textSecondary} testID="share-card-date">
                  {labels.date}
                </Text>
              ) : null}
              {labels.message ? (
                <Text variant="body" testID="share-card-message">
                  {labels.message}
                </Text>
              ) : null}
            </Stack>
          )}
         </View>
        </ViewShot>

        <Stack gap="sm">
          <Row gap="sm" style={styles.toggle}>
            <Text variant="label" style={styles.grow}>
              Show the date
            </Text>
            <Switch
              testID="share-toggle-date"
              value={includeDate}
              onValueChange={setIncludeDate}
              trackColor={{ true: color.brand, false: color.border }}
            />
          </Row>
          {comparePhoto ? (
            <Row gap="sm" style={styles.toggle}>
              <Text variant="label" style={styles.grow}>
                Show the time between the photos
              </Text>
              <Switch
                testID="share-toggle-period"
                value={includePeriod}
                onValueChange={setIncludePeriod}
                trackColor={{ true: color.brand, false: color.border }}
              />
            </Row>
          ) : null}
          <Input
            label="Progress message (optional, shown on the card)"
            testID="share-message"
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. 12 weeks of showing up"
            maxLength={120}
          />
          <Input
            label="Caption (optional, for the share text — not on the card)"
            testID="share-caption"
            value={caption}
            onChangeText={setCaption}
            placeholder="Anything you want to say alongside it"
            maxLength={280}
            multiline
          />
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline" testID="share-progress-error">
            {error}
          </Banner>
        ) : null}

        <Row gap="xs">
          <Ionicons name="lock-closed-outline" size={14} color={color.textTertiary} />
          <Text variant="label" tone={color.textTertiary} style={styles.grow}>
            Only what you switch on above is included. Your name, contact details, member id and any
            trainer notes are never added.
          </Text>
        </Row>
      </Stack>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
  },
  cardInner: { padding: space.md, gap: space.sm },
  brandRow: { alignItems: 'center' },
  mark: { width: 22, height: 22 },
  brandText: { letterSpacing: 1 },
  photos: { flexDirection: 'row', gap: space.xs },
  photo: { flex: 1, aspectRatio: 3 / 4, borderRadius: 10, backgroundColor: color.background },
  cardMeta: { paddingTop: space.xs },
  toggle: { alignItems: 'center' },
  grow: { flex: 1 },
});
