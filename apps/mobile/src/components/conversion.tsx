/**
 * Moving a member from General Training onto PT.
 *
 * The whole product rule lives in one place here: **nothing converts a member
 * except a trainer, deliberately.** Reaching the end of General Training raises
 * an alert and stops. The decision is a conversation on the gym floor that
 * GymFlow did not witness, so this component's only job is to let the trainer
 * record its outcome — clearly, once, and with a confirmation in the way.
 *
 * Eligibility is derived from data the client screen already has: a completed
 * journey and no active package. No extra request, and no second opinion about
 * a state the server already decided.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Journey, PTPackage } from '../api/types';
import {
  Badge,
  Banner,
  Button,
  Card,
  Eyebrow,
  Row,
  Segmented,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';

export type ConversionState = 'eligible' | 'already_pt' | 'not_eligible';

/**
 * Whether this member can be converted, and why not when they cannot.
 *
 * An active package is the authority on "already PT" rather than
 * `journey.pt_converted`: the package is the thing the member actually trains
 * on, and a flag that disagreed with it would put the button back on screen
 * for somebody already training with their coach.
 */
export function conversionState(
  journey: Journey | null | undefined,
  pack: PTPackage | null | undefined,
): ConversionState {
  if (pack && pack.status === 'active') return 'already_pt';
  if (journey && journey.status === 'completed') return 'eligible';
  return 'not_eligible';
}

export interface ConvertToPtProps {
  state: ConversionState;
  memberName: string;
  /** Package sizes this branch sells. The server refuses anything else. */
  options: number[];
  busy?: boolean;
  /** Server message from a failed attempt, shown above the action. */
  error?: string | null;
  onConvert: (sessionsTotal: number) => void;
}

const FALLBACK_OPTIONS = [12, 20, 30];

/**
 * The action, its confirmation, and the state it leaves behind.
 *
 * Renders nothing at all for a member who is not eligible. An always-present
 * disabled button would invite a trainer to wonder what they had done wrong.
 */
export function ConvertToPt({
  state,
  memberName,
  options,
  busy = false,
  error,
  onConvert,
}: ConvertToPtProps) {
  const [asking, setAsking] = useState(false);
  const sizes = options.length ? options : FALLBACK_OPTIONS;
  const [size, setSize] = useState(String(sizes[0]));

  if (state === 'not_eligible') return null;

  if (state === 'already_pt') {
    return (
      <Row gap="sm" style={styles.active} testID="pt-active">
        <Ionicons name="checkmark-circle" size={18} color={color.status.positive} />
        <Text variant="label" tone={color.status.positive}>
          PT ACTIVE
        </Text>
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          Your programming is the active plan
        </Text>
      </Row>
    );
  }

  return (
    <>
      <Card>
        <Row gap="sm">
          <Eyebrow>Ready for PT</Eyebrow>
          <Spacer />
          <Badge label="General Training complete" tone="brand" />
        </Row>
        <Text variant="body" tone={color.textSecondary}>
          {memberName} has finished General Training. Converting makes your programming their active
          plan.
        </Text>
        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}
        <Button
          title="Convert to PT"
          icon="swap-horizontal"
          loading={busy}
          onPress={() => setAsking(true)}
          testID="convert-to-pt"
        />
      </Card>

      <Sheet
        visible={asking}
        onClose={() => setAsking(false)}
        title="Convert this member to PT?"
        subtitle={memberName}
        testID="convert-sheet"
        footer={
          <Stack gap="sm">
            <Button
              title="Convert to PT"
              loading={busy}
              onPress={() => {
                setAsking(false);
                onConvert(Number(size));
              }}
              testID="confirm-convert"
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setAsking(false)}
              testID="cancel-convert"
            />
          </Stack>
        }
      >
        <Text variant="body" tone={color.textSecondary}>
          Trainer programming will become the active training plan.
        </Text>

        <View style={styles.sizes}>
          <Eyebrow>Package</Eyebrow>
          <Segmented
            options={sizes.map((n) => ({ value: String(n), label: `${n}` }))}
            value={size}
            onChange={setSize}
            testIDPrefix="convert-size"
          />
          <Text variant="label" tone={color.textTertiary}>
            Sessions. Only the sizes your branch sells are offered.
          </Text>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  active: {
    borderWidth: 1,
    borderColor: color.status.positive,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sizes: { gap: space.sm, paddingTop: space.sm },
});
