/**
 * Group classes at the member's branch, and their yes/no answer.
 *
 * The answer is an RSVP, not attendance — turning up is recorded separately by
 * the trainer, and the two are never conflated.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError } from '../../src/api/client';
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
  Eyebrow,
  Loading,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { colors, spacing } from '../../src/theme';
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

  if (classes.loading) return <Loading label="Loading classes" />;
  if (classes.error) {
    return (
      <Screen>
        <ErrorState detail={classes.error.message} onRetry={classes.reload} />
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
            tintColor={colors.brand}
          />
        }
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No classes scheduled"
            detail="Your branch will announce classes here."
          />
        ) : (
          rows.map((row) => {
            const answered = row.my_response === 'yes' || row.my_response === 'no';
            const full = row.available <= 0 && row.my_response !== 'yes';
            return (
              <Card key={row.id}>
                <Row style={styles.cardHead}>
                  <Txt variant="heading">{row.name}</Txt>
                  {row.my_response === 'yes' ? (
                    <Badge label="Going" color={colors.onTime} filled />
                  ) : row.my_response === 'no' ? (
                    <Badge label="Not going" color={colors.textFaint} />
                  ) : (
                    <Badge label="Reply" color={colors.late} />
                  )}
                </Row>
                <Txt variant="body" color={colors.textMuted}>
                  {dayLabel(row.class_date)} · {timeOfDay(row.starts_at)}
                  {row.trainer_name ? ` · ${row.trainer_name}` : ''}
                </Txt>
                {row.description ? (
                  <Txt variant="label" color={colors.textFaint}>
                    {row.description}
                  </Txt>
                ) : null}

                <Divider />
                <Row style={styles.counts}>
                  <Txt variant="label" color={colors.textMuted}>
                    {row.yes_count} going
                  </Txt>
                  <Txt variant="label" color={colors.textFaint}>
                    {row.available} of {row.capacity} places left
                  </Txt>
                </Row>

                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button
                      title="YES"
                      variant={row.my_response === 'yes' ? 'primary' : 'secondary'}
                      loading={busyId === row.id}
                      disabled={full && row.my_response !== 'yes'}
                      onPress={() => void answer(row.id, 'yes')}
                    />
                  </View>
                  <View style={styles.action}>
                    <Button
                      title="NO"
                      variant={row.my_response === 'no' ? 'danger' : 'secondary'}
                      loading={busyId === row.id}
                      onPress={() => void answer(row.id, 'no')}
                    />
                  </View>
                </View>

                {full ? (
                  <Txt variant="label" color={colors.late}>
                    This class is full.
                  </Txt>
                ) : !answered ? (
                  <Txt variant="label" color={colors.textFaint}>
                    Let your branch know so they can plan the floor.
                  </Txt>
                ) : null}
              </Card>
            );
          })
        )}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          Saying yes holds your place. Your trainer records who actually attends after the class.
        </Txt>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  counts: { justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.md },
});
