/**
 * Day-45 members ready for a PT conversation.
 *
 * Every entry here is a journey the server completed on its own. Selling is
 * SLAM's job; this screen only says who reached the end of the programme and
 * has not started PT.
 */

import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { FollowUpTask, Journey } from '../../src/api/types';
import { SectionHeader } from '../../src/components/programme';
import {
  Badge,
  Body,
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
import { colors, spacing } from '../../src/theme';
import { dayLabel } from '../../src/utils/format';

export default function OwnerOpportunitiesScreen() {
  const ready = useApi<Journey[]>((token) => api.journeysReadyForPt(token), []);
  const tasks = useApi<FollowUpTask[]>((token) => api.listTasks(token), []);

  if (ready.loading) return <Loading label="Loading PT opportunities" />;
  if (ready.error) {
    const offline = ready.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load PT opportunities'}
          detail={offline ? undefined : ready.error?.message}
          onRetry={ready.reload}
        />
      </Screen>
    );
  }

  const rows = ready.data ?? [];
  const followUps = (tasks.data ?? []).filter((t) => t.key === 'pt_follow_up');

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={ready.refreshing}
            onRefresh={() => {
              void ready.refresh();
              void tasks.refresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">PT opportunities</Txt>
        <Txt variant="label" color={colors.textMuted}>
          Members who finished the 45-day journey and have no PT package.
        </Txt>

        <SectionHeader title={`Ready for PT (${rows.length})`} />
        {rows.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title="Nobody waiting"
            detail="Members appear here the day they complete the 45-day journey."
          />
        ) : (
          rows.map((journey) => (
            <Card key={journey.id}>
              <Row style={styles.cardHead}>
                <Txt variant="heading">{journey.member_name}</Txt>
                <Badge label="Day 45" color={colors.brand} filled />
              </Row>
              <Txt variant="label" color={colors.textMuted}>
                Completed {dayLabel(journey.completed_on ?? journey.end_date)}
                {journey.assigned_trainer_name ? ` · ${journey.assigned_trainer_name}` : ''}
              </Txt>
              <Divider />
              <Row style={styles.stat}>
                <Txt variant="label" color={colors.textMuted}>
                  Workouts completed
                </Txt>
                <Txt variant="mono">{journey.workouts_completed}</Txt>
              </Row>
              <Row style={styles.stat}>
                <Txt variant="label" color={colors.textMuted}>
                  Days completed
                </Txt>
                <Txt variant="mono">
                  {journey.days_completed} / {journey.duration_days}
                </Txt>
              </Row>
            </Card>
          ))
        )}

        {followUps.length ? (
          <>
            <SectionHeader title="Follow-up tasks" />
            {followUps.map((task) => (
              <Card key={task.id}>
                <Eyebrow>{task.due_on ? `Due ${dayLabel(task.due_on)}` : 'Open'}</Eyebrow>
                <Txt variant="body">{task.title}</Txt>
                {task.detail ? (
                  <Txt variant="label" color={colors.textFaint}>
                    {task.detail}
                  </Txt>
                ) : null}
              </Card>
            ))}
          </>
        ) : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  stat: { justifyContent: 'space-between', paddingVertical: 2 },
});
