/**
 * Publish availability.
 *
 * A day at a time, from a fixed grid of hours rather than a free time picker:
 * SLAM trainers publish on the hour, and a grid can be filled with a thumb in
 * a corridor between sessions where two scroll wheels cannot.
 *
 * Publishing a day replaces it. A booked slot is kept whatever is sent —
 * withdrawing an hour someone is booked into would leave the member holding a
 * session the trainer no longer believes exists — and the server enforces
 * that, so this screen only has to show it.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { AvailabilitySlot } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  Section,
  Spacer,
  Stack,
  Text,
  alpha,
  color,
  hairline,
  radii,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';

/** The hours SLAM actually runs PT, on the hour. */
const HOURS = [5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21];

const pad = (value: number) => String(value).padStart(2, '0');
const startOf = (hour: number) => `${pad(hour)}:00:00`;
const endOf = (hour: number) => `${pad(hour + 1)}:00:00`;
const label = (hour: number) => `${pad(hour)}:00`;

/** ISO date `n` days from today, in the device's own calendar. */
function isoDay(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDay(iso: string): { weekday: string; day: string } {
  const date = new Date(`${iso}T00:00:00`);
  return {
    weekday: date.toLocaleDateString([], { weekday: 'short' }),
    day: String(date.getDate()),
  };
}

export default function TrainerAvailabilityScreen() {
  const { withToken } = useAuth();
  const published = useApi<AvailabilitySlot[]>((token) => api.myAvailability(token, 14), []);

  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => isoDay(index)), []);
  const [selected, setSelected] = useState(days[0]);
  const [draft, setDraft] = useState<Set<number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const slotsForDay = useMemo(
    () => (published.data ?? []).filter((slot) => slot.slot_date === selected),
    [published.data, selected],
  );

  /** The hours currently shown as chosen: the local edit, or what is published. */
  const chosen = useMemo(() => {
    if (draft) return draft;
    return new Set(slotsForDay.map((slot) => Number(slot.start_time.slice(0, 2))));
  }, [draft, slotsForDay]);

  const bookedHours = useMemo(
    () =>
      new Set(
        slotsForDay
          .filter((slot) => slot.booked_session_id !== null)
          .map((slot) => Number(slot.start_time.slice(0, 2))),
      ),
    [slotsForDay],
  );

  const selectDay = useCallback((iso: string) => {
    setSelected(iso);
    setDraft(null);
    setSaved(false);
    setError(null);
  }, []);

  const toggle = useCallback(
    (hour: number) => {
      if (bookedHours.has(hour)) return;
      setSaved(false);
      setDraft((current) => {
        const next = new Set(current ?? chosen);
        if (next.has(hour)) next.delete(hour);
        else next.add(hour);
        return next;
      });
    },
    [bookedHours, chosen],
  );

  const publish = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const slots = [...chosen]
        .sort((a, b) => a - b)
        .map((hour) => ({ start_time: startOf(hour), end_time: endOf(hour) }));
      await withToken((token) => api.publishAvailability(selected, slots, token));
      setDraft(null);
      setSaved(true);
      await published.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'That did not publish. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [chosen, selected, withToken, published]);

  if (published.loading) return <Loading label="Loading your availability" />;

  if (published.error) {
    const offline = published.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your availability'}
          detail={offline ? undefined : published.error.message}
          onRetry={published.reload}
        />
      </Screen>
    );
  }

  const dirty = draft !== null;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={published.refreshing}
            onRefresh={() => void published.refresh()}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Availability</Text>
          <Text variant="body" tone={color.textSecondary}>
            Publish the hours you can take PT. Your branch books sessions into them.
          </Text>
        </Stack>

        {error ? <Banner tone="critical" icon="alert-circle-outline">{error}</Banner> : null}
        {saved && !dirty ? (
          <Banner tone="positive" icon="checkmark-circle-outline">
            Published. {chosen.size} hour{chosen.size === 1 ? '' : 's'} on this day.
          </Banner>
        ) : null}

        {/* Two weeks is as far ahead as anyone publishes. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row gap="sm">
            {days.map((iso) => {
              const { weekday, day } = shortDay(iso);
              const active = iso === selected;
              const count = (published.data ?? []).filter((s) => s.slot_date === iso).length;
              return (
                <Pressable
                  key={iso}
                  accessibilityRole="button"
                  accessibilityLabel={`${weekday} ${day}, ${count} slots published`}
                  accessibilityState={{ selected: active }}
                  onPress={() => selectDay(iso)}
                  style={[styles.day, active ? styles.dayActive : null]}
                >
                  <Text variant="caption" caps tone={active ? color.text : color.textTertiary}>
                    {weekday}
                  </Text>
                  <Text variant="heading" tone={active ? color.text : color.textSecondary}>
                    {day}
                  </Text>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: count ? color.brand : 'transparent' },
                    ]}
                  />
                </Pressable>
              );
            })}
          </Row>
        </ScrollView>

        <Card>
          <Row gap="sm">
            <Eyebrow>Hours</Eyebrow>
            <Spacer />
            <Badge
              label={`${chosen.size} selected`}
              tone={chosen.size ? 'brand' : 'neutral'}
            />
          </Row>

          <Row gap="sm" wrap>
            {HOURS.map((hour) => {
              const on = chosen.has(hour);
              const booked = bookedHours.has(hour);
              return (
                <Pressable
                  key={hour}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: booked }}
                  accessibilityLabel={`${label(hour)}${booked ? ', booked' : ''}`}
                  disabled={booked}
                  onPress={() => toggle(hour)}
                  style={[
                    styles.hour,
                    on ? styles.hourOn : null,
                    booked ? styles.hourBooked : null,
                  ]}
                >
                  <Text
                    variant="label"
                    tone={booked ? color.status.positive : on ? color.text : color.textSecondary}
                  >
                    {label(hour)}
                  </Text>
                </Pressable>
              );
            })}
          </Row>

          {bookedHours.size ? (
            <Text variant="label" tone={color.textTertiary}>
              Green hours are already booked and cannot be withdrawn here.
            </Text>
          ) : null}
        </Card>

        <Button
          title={dirty ? 'Publish this day' : 'Republish this day'}
          size="lg"
          icon="cloud-upload-outline"
          loading={busy}
          onPress={() => void publish()}
        />

        <Section title="Published">
          {(published.data ?? []).length === 0 ? (
            <Text variant="label" tone={color.textTertiary}>
              Nothing published yet. Pick a day and choose your hours.
            </Text>
          ) : (
            days
              .map((iso) => ({
                iso,
                slots: (published.data ?? []).filter((slot) => slot.slot_date === iso),
              }))
              .filter((entry) => entry.slots.length)
              .map((entry) => {
                const { weekday, day } = shortDay(entry.iso);
                return (
                  <Row key={entry.iso} gap="md" style={styles.summary}>
                    <Text variant="mono" tone={color.textTertiary} style={styles.summaryDay}>
                      {weekday} {day}
                    </Text>
                    <Text variant="label" tone={color.textSecondary} style={styles.grow}>
                      {entry.slots.map((slot) => slot.start_time.slice(0, 5)).join(' · ')}
                    </Text>
                  </Row>
                );
              })
          )}
        </Section>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  day: {
    alignItems: 'center',
    gap: 2,
    minWidth: 52,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radii.md,
    backgroundColor: color.surfaceRaised,
    ...hairline,
  },
  dayActive: { backgroundColor: color.surfaceOverlay, borderColor: color.brand },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  hour: {
    minWidth: 68,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radii.sm,
    backgroundColor: color.surfaceOverlay,
    borderWidth: 1,
    borderColor: color.border,
  },
  hourOn: { backgroundColor: alpha(color.brand, 0.18), borderColor: color.brand },
  hourBooked: {
    backgroundColor: alpha(color.status.positive, 0.12),
    borderColor: alpha(color.status.positive, 0.4),
  },
  summary: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  summaryDay: { minWidth: 62 },
});
