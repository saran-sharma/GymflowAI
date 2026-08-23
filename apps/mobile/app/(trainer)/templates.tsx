/**
 * Workout templates — a reusable, editable starting point for a member's
 * programme. Push / Pull / Legs is one entry here, not the architecture.
 *
 * Reached from a member's `plan/[id]` screen with that member's id, so
 * "Apply to member" on the next screen always knows who it is applying to.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import * as api from '../../src/api/endpoints';
import { OFFLINE_CODE } from '../../src/api/client';
import type { WorkoutTemplate } from '../../src/api/types';
import { CategoryBadge } from '../../src/components/programme';
import {
  Body,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  Stack,
  TappableCard,
  Text,
  color,
  useThemedStyles,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';

function buildStyles() {
  return StyleSheet.create({ grow: { flex: 1 } });
}

export default function WorkoutTemplatesScreen() {
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { memberId, name } = useLocalSearchParams<{ memberId: string; name?: string }>();

  const templates = useApi<WorkoutTemplate[]>((token) => api.workoutTemplates(token), []);

  if (templates.loading) return <Loading label="Loading templates" />;

  if (templates.error) {
    const offline = templates.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load templates'}
          detail={offline ? undefined : templates.error.message}
          onRetry={templates.reload}
        />
      </Screen>
    );
  }

  const list = templates.data ?? [];

  return (
    <Screen>
      <Body>
        <Stack gap="xxs">
          <Text variant="title">Workout Templates</Text>
          <Text variant="body" tone={color.textSecondary}>
            {name ? `Pick a starting point for ${name}.` : 'Pick a starting point.'} Applying one
            copies it — editing the template afterward never changes a member who already has it.
          </Text>
        </Stack>

        {list.length === 0 ? (
          <EmptyState
            icon="albums-outline"
            title="No templates yet"
            detail="The default pack should be seeded automatically. Ask an admin to check the backend."
          />
        ) : (
          list.map((template) => (
            <TappableCard
              key={template.id}
              testID={`template-${template.id}`}
              accessibilityLabel={`Preview ${template.name}`}
              onPress={() =>
                router.push({
                  pathname: '/(trainer)/template-preview/[templateId]',
                  params: {
                    templateId: String(template.id),
                    memberId,
                    name: name ?? '',
                  },
                } as never)
              }
            >
              <Row gap="sm">
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="heading">{template.name}</Text>
                  <Text variant="label" tone={color.textSecondary}>
                    {template.description}
                  </Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {template.days.length} day{template.days.length === 1 ? '' : 's'}
                  </Text>
                </Stack>
                <CategoryBadge category={template.category} />
              </Row>
            </TappableCard>
          ))
        )}
      </Body>
    </Screen>
  );
}
