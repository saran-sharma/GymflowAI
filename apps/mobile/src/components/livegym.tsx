/**
 * Who is in the gym right now.
 *
 * Shared by the owner and the trainer because it is the same question asked
 * for different reasons — occupancy versus who to walk over to — and the
 * server answers it once, scoped to the caller's own branch.
 *
 * The duration is computed by the server from the arrival, so it is right at
 * the moment of the request; this does not tick. A number that counts up on
 * its own invites staring at it, and the list is refreshed by pulling down.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WhoIsInside } from '../api/types';
import {
  Badge,
  EmptyState,
  Eyebrow,
  Row,
  Spacer,
  Stack,
  Text,
  color,
  hairline,
  radii,
  space,
} from '../design';
import { duration, timeOfDay } from '../utils/format';

export function LiveGym({ data, emptyDetail }: { data: WhoIsInside; emptyDetail: string }) {
  if (data.count === 0) {
    return (
      <EmptyState
        icon="walk-outline"
        title="Nobody in the gym right now"
        detail={emptyDetail}
      />
    );
  }

  return (
    <Stack gap="sm">
      <Row gap="sm">
        <Eyebrow>{data.branch_name}</Eyebrow>
        <Spacer />
        <Badge
          label={data.capacity ? `${data.count} of ${data.capacity}` : `${data.count} inside`}
          tone="brand"
        />
      </Row>

      <View style={styles.list}>
        {data.members.map((member) => (
          <Row key={member.member_id} gap="md" style={styles.row}>
            <Stack gap="xxs" style={styles.grow}>
              <Text variant="body">{member.full_name}</Text>
              <Text variant="label" tone={color.textTertiary}>
                In at {timeOfDay(member.checked_in_at)}
              </Text>
            </Stack>
            <Text variant="mono" tone={color.textSecondary}>
              {duration(member.minutes_inside)}
            </Text>
          </Row>
        ))}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  list: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.lg,
    ...hairline,
    paddingHorizontal: space.lg,
  },
  row: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
