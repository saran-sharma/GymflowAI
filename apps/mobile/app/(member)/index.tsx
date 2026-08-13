/**
 * Member home — the SLAM journey, first.
 *
 * The whole screen comes from one request: opening the app on gym wifi should
 * not cost six round trips. Reading it also settles a finished journey
 * server-side, which is how Day 45 completes without anyone pressing anything.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { MemberHome } from '../../src/api/types';
import {
  AlertRow,
  DayCounter,
  DemoTag,
  SectionHeader,
  SplitBadge,
} from '../../src/components/programme';
import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  Loading,
  Meter,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, spacing } from '../../src/theme';
import { initials, timeOfDay } from '../../src/utils/format';

export default function MemberHomeScreen() {
  const router = useRouter();
  const home = useApi<MemberHome>((token) => api.memberHome(token), []);

  if (home.loading) return <Loading label="Loading your SLAM" />;
  if (home.error || !home.data) {
    return (
      <Screen>
        <ErrorState
          title={home.error?.code === OFFLINE_CODE ? 'No connection' : 'Could not load your home'}
          detail={home.error?.message}
          onRetry={home.reload}
        />
      </Screen>
    );
  }

  const me = home.data;
  const journey = me.journey;
  const crowd = me.occupancy;
  const expiring = (me.days_remaining ?? 999) <= 30;
  const journeyComplete = journey?.status === 'completed';

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={home.refreshing}
            onRefresh={() => void home.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <Row style={styles.identity}>
          <View style={styles.avatar}>
            <Txt variant="heading">{initials(me.full_name)}</Txt>
          </View>
          <View style={styles.identityText}>
            <Txt variant="heading">{me.full_name}</Txt>
            <Txt variant="label" color={colors.textMuted}>
              {me.branch_name}
            </Txt>
          </View>
          {me.is_inside ? <Badge label="Inside" color={colors.onTime} filled /> : null}
        </Row>

        {/* The 45-day journey is the member's reason to open the app. */}
        {journey ? (
          <Card>
            <Row style={styles.cardHead}>
              <Eyebrow>{journeyComplete ? 'General training' : 'Your 45-day journey'}</Eyebrow>
              {journey.is_demo ? <DemoTag /> : null}
            </Row>
            {journeyComplete ? (
              <>
                <Txt variant="heading">Your 45-Day journey is complete.</Txt>
                <Txt variant="body" color={colors.textMuted}>
                  {journey.workouts_completed} workouts recorded over {journey.duration_days} days.
                </Txt>
                {!journey.pt_converted ? (
                  <Button
                    title="SEE WHAT COMES NEXT"
                    variant="secondary"
                    icon="arrow-forward"
                    onPress={() => router.push('/(member)/pt' as never)}
                  />
                ) : null}
              </>
            ) : (
              <>
                <DayCounter
                  currentDay={journey.current_day}
                  totalDays={journey.duration_days}
                  phase={journey.phase}
                  split={journey.split_today}
                />
                {journey.phase === 'assessment' ? (
                  <>
                    <Divider />
                    <Row style={styles.detail}>
                      <Txt variant="label" color={colors.textMuted}>
                        Assessment
                      </Txt>
                      <Badge
                        label={
                          journey.assessment_status === 'completed' ? 'Completed' : 'Not started'
                        }
                        color={
                          journey.assessment_status === 'completed' ? colors.onTime : colors.late
                        }
                      />
                    </Row>
                    <Row style={styles.detail}>
                      <Txt variant="label" color={colors.textMuted}>
                        Cardio
                      </Txt>
                      <Txt variant="mono">
                        {journey.cardio_completed} / {journey.cardio_required}
                      </Txt>
                    </Row>
                  </>
                ) : null}
              </>
            )}
          </Card>
        ) : (
          <Card>
            <Eyebrow>General training</Eyebrow>
            <Txt variant="body" color={colors.textMuted}>
              Your 45-day journey has not started yet. Speak to your trainer at {me.branch_name}.
            </Txt>
          </Card>
        )}

        {/* Today's workout. */}
        <SectionHeader title="Today" action="Open" onAction={() => router.push('/(member)/workout' as never)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Today's workout"
          onPress={() => router.push('/(member)/workout' as never)}
          style={({ pressed }) => [styles.pressableCard, pressed && styles.pressed]}
        >
          <Row style={styles.cardHead}>
            <Txt variant="heading">
              {me.today_workout
                ? me.today_workout.split_label
                : journey
                  ? 'Workout not started'
                  : 'No workout planned'}
            </Txt>
            {journey ? <SplitBadge split={journey.split_today} /> : null}
          </Row>
          {me.today_workout ? (
            <>
              <Meter
                value={
                  me.today_workout.total_items
                    ? (me.today_workout.completed_items / me.today_workout.total_items) * 100
                    : 0
                }
                color={colors.onTime}
              />
              <Txt variant="label" color={colors.textMuted}>
                {me.today_workout.completed_items} of {me.today_workout.total_items} exercises done
              </Txt>
            </>
          ) : (
            <Txt variant="label" color={colors.textMuted}>
              Tap to see the chart and start.
            </Txt>
          )}
        </Pressable>

        {/* Today's PT, if there is one. */}
        {me.next_pt_session ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your next PT session"
            onPress={() => router.push('/(member)/pt' as never)}
            style={({ pressed }) => [styles.pressableCard, pressed && styles.pressed]}
          >
            <Row style={styles.cardHead}>
              <Eyebrow>Next PT session</Eyebrow>
              <Badge
                label={`${me.next_pt_session.session_number} / ${me.next_pt_session.package_size ?? '—'}`}
                color={colors.brand}
              />
            </Row>
            <Row style={styles.detail}>
              <Txt variant="heading">{timeOfDay(me.next_pt_session.scheduled_start)}</Txt>
              <Txt variant="label" color={colors.textMuted}>
                {me.next_pt_session.trainer_name ?? 'Your trainer'}
              </Txt>
            </Row>
          </Pressable>
        ) : null}

        <View style={styles.tiles}>
          <StatTile
            label="Streak"
            value={me.streak_days}
            hint={me.streak_days === 1 ? 'day' : 'days'}
            accent={me.streak_days > 0 ? colors.onTime : colors.textFaint}
          />
          <StatTile
            label="Inside now"
            value={crowd ? crowd.inside : '—'}
            hint={crowd ? `of ${crowd.capacity}` : undefined}
            accent={colors.brand}
          />
          <StatTile
            label="Days left"
            value={me.days_remaining ?? '—'}
            hint={me.membership_plan ?? undefined}
            accent={expiring ? colors.late : colors.text}
          />
        </View>

        {crowd ? (
          <Card>
            <Row style={styles.cardHead}>
              <Eyebrow>How busy is {me.branch_name}</Eyebrow>
              <Badge
                label={crowd.crowd_level}
                color={
                  crowd.crowd_level === 'High'
                    ? colors.absent
                    : crowd.crowd_level === 'Medium'
                      ? colors.late
                      : colors.onTime
                }
              />
            </Row>
            <Meter value={crowd.occupancy_pct} color={colors.brand} />
            <Txt variant="label" color={colors.textFaint}>
              {crowd.inside} members inside · {crowd.entries_today} entries today
            </Txt>
          </Card>
        ) : null}

        {me.next_class ? (
          <>
            <SectionHeader title="Next class" />
            <AlertRow
              severity="info"
              title={`${me.next_class.name} · ${timeOfDay(me.next_class.starts_at)}`}
              body={
                me.next_class.my_response === 'yes'
                  ? "You said yes. See you there."
                  : `${me.next_class.available} places left — tap to reply.`
              }
              onPress={() => router.push('/(member)/classes' as never)}
            />
          </>
        ) : null}

        {me.trainer_name ? (
          <Card>
            <Eyebrow>Your trainer</Eyebrow>
            <Divider />
            <Row style={styles.trainer}>
              <View style={styles.avatarSmall}>
                <Txt variant="label">{initials(me.trainer_name)}</Txt>
              </View>
              <View style={styles.identityText}>
                <Txt variant="body">{me.trainer_name}</Txt>
                <Txt variant="label" color={colors.textFaint}>
                  {me.branch_name}
                </Txt>
              </View>
              <Ionicons name="fitness-outline" size={20} color={colors.textFaint} />
            </Row>
          </Card>
        ) : null}

        {me.membership_plan ? (
          <Card>
            <Row style={styles.cardHead}>
              <Eyebrow>Membership</Eyebrow>
              <Badge
                label={me.membership_status ?? 'unknown'}
                color={me.membership_status === 'active' ? colors.onTime : colors.absent}
              />
            </Row>
            <Txt variant="body">{me.membership_plan}</Txt>
            {me.days_remaining !== null ? (
              <Txt variant="label" color={expiring ? colors.late : colors.textMuted}>
                {me.days_remaining} days remaining
              </Txt>
            ) : null}
          </Card>
        ) : null}

        {me.unread_alerts > 0 ? (
          <Button
            title={`${me.unread_alerts} UPDATE${me.unread_alerts === 1 ? '' : 'S'}`}
            variant="secondary"
            icon="notifications-outline"
            onPress={() => router.push('/(member)/alerts' as never)}
          />
        ) : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { gap: spacing.md },
  identityText: { flex: 1, gap: 2 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  trainer: { gap: spacing.md },
  pressableCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
});
