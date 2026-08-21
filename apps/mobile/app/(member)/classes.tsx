/**
 * Group classes at the member's branch, and their yes/no answer.
 *
 * The answer is an RSVP, not attendance — turning up is recorded separately by
 * the trainer, and the two are never conflated.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { GroupClass, RsvpAnswer } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Row,
  Screen,
  Section,
  SkeletonScreen,
  Spacer,
  Stack,
  Text,
  color,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { dayLabel, timeOfDay } from '../../src/utils/format';

export default function MemberClassesScreen() {
  const { withToken } = useAuth();
  const classes = useApi<GroupClass[]>((token) => api.listClasses(token), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = useCallback(
    async (classId: number, response: RsvpAnswer) => {
      setBusyId(classId);
      setError(null);
      try {
        await withToken((token) => api.rsvpClass(classId, response, token));
        await classes.refresh();
      } catch (caught) {
        setError(
          caught instanceof ApiError ? caught.message : 'Could not save your answer. Try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [withToken, classes],
  );

  if (classes.loading) return <SkeletonScreen cards={4} stats={false} />;
  if (classes.error) {
    const offline = classes.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your classes'}
          detail={offline ? undefined : classes.error.message}
          onRetry={classes.reload}
        />
      </Screen>
    );
  }

  const rows = classes.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={classes.refreshing}
            onRefresh={() => void classes.refresh()}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Group classes</Text>
          <Text variant="body" tone={color.textSecondary}>
            Say yes to hold your place. Your trainer records who actually attends.
          </Text>
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No classes scheduled"
            detail="Your branch will announce classes here."
          />
        ) : (
          <Section title="Upcoming">
            {rows.map((row) => (
              <ClassCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onAnswer={(response) => void answer(row.id, response)}
              />
            ))}
          </Section>
        )}
      </Body>
    </Screen>
  );
}

function ClassCard({
  row,
  busy,
  onAnswer,
}: {
  row: GroupClass;
  busy: boolean;
  onAnswer: (response: RsvpAnswer) => void;
}) {
  const answered = row.my_response === 'yes' || row.my_response === 'no';
  const full = row.available <= 0 && row.my_response !== 'yes';

  return (
    <Card>
      <Row gap="sm">
        <Text variant="heading" style={styles.grow}>
          {row.name}
        </Text>
        {row.my_response === 'yes' ? (
          <Badge label="Going" tone="positive" solid />
        ) : row.my_response === 'no' ? (
          <Badge label="Not going" tone="neutral" />
        ) : (
          <Badge label="Reply" tone="caution" />
        )}
      </Row>

      <Text variant="label" tone={color.textSecondary}>
        {dayLabel(row.class_date)} · {timeOfDay(row.starts_at)}
        {row.trainer_name ? ` · ${row.trainer_name}` : ''}
      </Text>

      {row.description ? (
        <Text variant="label" tone={color.textTertiary}>
          {row.description}
        </Text>
      ) : null}

      <Divider />

      <Row gap="sm">
        <Text variant="label" tone={color.textSecondary}>
          {row.yes_count} going
        </Text>
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          {row.available} of {row.capacity} places left
        </Text>
      </Row>

      <Row gap="sm">
        <View style={styles.action}>
          <Button
            title="Yes"
            variant={row.my_response === 'yes' ? 'primary' : 'secondary'}
            loading={busy}
            disabled={full && row.my_response !== 'yes'}
            onPress={() => onAnswer('yes')}
          />
        </View>
        <View style={styles.action}>
          <Button
            title="No"
            variant={row.my_response === 'no' ? 'destructive' : 'secondary'}
            loading={busy}
            onPress={() => onAnswer('no')}
          />
        </View>
      </Row>

      {full ? (
        <Text variant="label" tone={color.status.caution}>
          This class is full.
        </Text>
      ) : !answered ? (
        <Text variant="label" tone={color.textTertiary}>
          Let your branch know so they can plan the floor.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  action: { flex: 1 },
});
