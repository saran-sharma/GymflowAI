/** The member's own attendance. Read-only in V1. */

import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import * as api from '../../src/api/endpoints';
import type { MemberVisit } from '../../src/api/types';
import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, spacing } from '../../src/theme';
import { dayLabel, duration, timeOfDay } from '../../src/utils/format';

export default function MemberVisitsScreen() {
  const visits = useApi<MemberVisit[]>((token) => api.memberVisits(token), []);

  if (visits.loading) return <Loading label="Loading your visits" />;
  if (visits.error) {
    return (
      <Screen>
        <ErrorState detail={visits.error.message} onRetry={visits.reload} />
      </Screen>
    );
  }

  const rows = visits.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={visits.refreshing}
            onRefresh={visits.refresh}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Your visits</Txt>

        {rows.length === 0 ? (
          <EmptyState
            icon="footsteps-outline"
            title="No visits recorded"
            detail="Your gym entries will appear here once you check in at the branch."
          />
        ) : (
          rows.map((visit) => (
            <Card key={visit.work_date} style={styles.card}>
              <Row style={styles.head}>
                <Txt variant="body">{dayLabel(visit.work_date)}</Txt>
                <Txt variant="mono" color={colors.textMuted}>
                  {duration(visit.minutes)}
                </Txt>
              </Row>
              <Row style={styles.times}>
                <Txt variant="label" color={colors.textFaint}>
                  In {timeOfDay(visit.check_in_at)}
                </Txt>
                <Txt variant="label" color={colors.textFaint}>
                  Out {timeOfDay(visit.check_out_at)}
                </Txt>
              </Row>
            </Card>
          ))
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  head: { justifyContent: 'space-between' },
  times: { gap: spacing.lg },
});
