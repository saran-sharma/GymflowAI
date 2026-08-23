/**
 * Preview one template's days and exercises, then apply it to a member.
 *
 * "Apply" copies the template's rows into a new `MemberWorkoutProgram` for
 * this member — a real, independent copy. Editing the template afterward
 * (from here or anywhere else) never rewrites what the member now has.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { WorkoutTemplate } from '../../../src/api/types';
import { CategoryBadge, WorkoutArtwork } from '../../../src/components/programme';
import {
  Banner,
  Body,
  Button,
  Card,
  Divider,
  ErrorState,
  Loading,
  Row,
  Screen,
  Stack,
  Text,
  color,
  useThemedStyles,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';

export default function TemplatePreviewScreen() {
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { templateId, memberId, name } = useLocalSearchParams<{
    templateId: string;
    memberId: string;
    name?: string;
  }>();
  const { withToken } = useAuth();

  const template = useApi<WorkoutTemplate>(
    (token) => api.workoutTemplate(Number(templateId), token),
    [templateId],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await withToken((token) =>
        api.applyWorkoutTemplate(Number(memberId), Number(templateId), token),
      );
      router.replace({
        pathname: '/(trainer)/plan/[id]',
        params: { id: memberId, name: name ?? '' },
      } as never);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not apply this template.');
    } finally {
      setBusy(false);
    }
  }, [memberId, name, router, templateId, withToken]);

  if (template.loading) return <Loading label="Loading template" />;

  if (template.error) {
    const offline = template.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load this template'}
          detail={offline ? undefined : template.error.message}
          onRetry={template.reload}
        />
      </Screen>
    );
  }

  const data = template.data;
  if (!data) return null;

  return (
    <Screen>
      <Body>
        <Stack gap="xxs">
          <Text variant="title">{data.name}</Text>
          <Text variant="body" tone={color.textSecondary}>
            {data.description}
          </Text>
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {data.days.map((day, index) => (
          <Card key={day.id} testID={`preview-day-${index}`}>
            <WorkoutArtwork category={day.category} testID={`preview-day-art-${index}`} />
            <Row gap="sm">
              <Stack gap="xxs" style={styles.grow}>
                <Text variant="label" tone={color.textTertiary}>
                  Day {index + 1}
                </Text>
                <Text variant="heading">{day.name}</Text>
              </Stack>
              <CategoryBadge category={day.category} />
            </Row>
            <Text variant="label" tone={color.textTertiary}>
              {day.exercises.length} exercise{day.exercises.length === 1 ? '' : 's'}
              {day.estimated_duration_minutes ? ` · ~${day.estimated_duration_minutes} min` : ''}
            </Text>
            <Divider />
            {day.exercises.map((exercise) => (
              <Text key={exercise.id} variant="label" tone={color.textSecondary}>
                {exercise.exercise} — {exercise.sets} × {exercise.reps}
              </Text>
            ))}
          </Card>
        ))}

        <Button
          title={`Apply to ${name || 'this member'}`}
          loading={busy}
          onPress={() => void apply()}
          testID="apply-template"
        />
      </Body>
    </Screen>
  );
}

function buildStyles() {
  return StyleSheet.create({ grow: { flex: 1 } });
}
