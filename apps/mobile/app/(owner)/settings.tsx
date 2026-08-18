/**
 * Business rules, as configuration.
 *
 * Nothing SLAM might want to retune is compiled into this app: grace periods,
 * journey length, PT package sizes, class capacity and the alert thresholds all
 * live on the server and are edited here. Changes are audited.
 */

import React, { useCallback, useState } from 'react';
import { Modal, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { AppSetting } from '../../src/api/types';
import {
  Banner,
  Body,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Input,
  Loading,
  Row,
  Screen,
  Section,
  Text,
  color,
  radii,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';

/** Group the flat key list into something an owner can navigate. */
const GROUPS: { title: string; prefix: string }[] = [
  { title: 'Shifts & attendance', prefix: 'shift.' },
  { title: 'Attendance windows', prefix: 'attendance.' },
  { title: 'Punctuality scoring', prefix: 'punctuality.' },
  { title: '45-day journey', prefix: 'journey.' },
  { title: 'Personal training', prefix: 'pt.' },
  { title: 'Group classes', prefix: 'classes.' },
  { title: 'Alerts', prefix: 'alerts.' },
  { title: 'Occupancy', prefix: 'occupancy.' },
];

/** Parse what was typed back into the shape the setting had. */
function parseValue(raw: string, previous: unknown): unknown {
  const text = raw.trim();
  if (Array.isArray(previous)) {
    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (Number.isNaN(Number(part)) ? part : Number(part)));
  }
  if (typeof previous === 'boolean') return /^(true|yes|on|1)$/i.test(text);
  if (typeof previous === 'number') {
    const n = Number(text);
    return Number.isNaN(n) ? previous : n;
  }
  return text;
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

export default function OwnerSettingsScreen() {
  const { withToken, user } = useAuth();
  const settings = useApi<AppSetting[]>((token) => api.listSettings(token), []);

  const [editing, setEditing] = useState<AppSetting | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const readOnly = user?.role !== 'owner' && user?.role !== 'super_admin';

  const save = useCallback(async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await withToken((token) =>
        api.updateSetting(editing.key, parseValue(draft, editing.value), token),
      );
      setSaved(editing.key);
      setEditing(null);
      await settings.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that setting.');
    } finally {
      setBusy(false);
    }
  }, [editing, draft, withToken, settings]);

  if (settings.loading) return <Loading label="Loading settings" />;
  if (settings.error) {
    const offline = settings.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load settings'}
          detail={offline ? undefined : settings.error?.message}
          onRetry={settings.reload}
        />
      </Screen>
    );
  }

  const rows = settings.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={settings.refreshing}
            onRefresh={() => void settings.refresh()}
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">Settings</Text>
        <Text variant="label" tone={color.textSecondary}>
          These are the rules GymFlow runs on. Changing one takes effect immediately and is recorded
          in the audit trail.
        </Text>

        {saved ? (
          <Banner tone="positive">
            <Text variant="label" tone={color.status.positive} style={styles.grow}>
              {saved} updated.
            </Text>
          </Banner>
        ) : null}
        {error && !editing ? <Banner tone="critical">{error}</Banner> : null}
        {readOnly ? (
          <Banner tone="info">
            You can see these rules. Only an owner or admin can change them.
          </Banner>
        ) : null}

        {/* Every group can filter to nothing, and a screen that renders only a
            header over empty space reads as a failure rather than a state. */}
        {GROUPS.every((group) => !rows.some((row) => row.key.startsWith(group.prefix))) ? (
          <EmptyState
            icon="options-outline"
            title="No settings to show"
            detail={
              rows.length
                ? 'This branch has settings recorded, but none in the groups shown here. Ask an admin which keys apply.'
                : 'No business rules are configured yet. An admin sets these up for your branch.'
            }
          />
        ) : null}

        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.key.startsWith(group.prefix));
          if (!groupRows.length) return null;
          return (
            <React.Fragment key={group.prefix}>
              <Section title={group.title}>
                <Card>
                  {groupRows.map((row, index) => (
                    <React.Fragment key={row.key}>
                      {index > 0 ? <Divider /> : null}
                      <Row style={styles.setting}>
                        <View style={styles.grow}>
                          <Text variant="body">{row.key.split('.').slice(1).join('.')}</Text>
                          {row.description ? (
                            <Text variant="label" tone={color.textTertiary}>
                              {row.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          variant="mono"
                          tone={readOnly ? color.textSecondary : color.brandAccent}
                          accessibilityRole={readOnly ? undefined : 'button'}
                          onPress={
                            readOnly
                              ? undefined
                              : () => {
                                  setEditing(row);
                                  setDraft(displayValue(row.value));
                                  setSaved(null);
                                }
                          }
                          style={styles.value}
                        >
                          {displayValue(row.value)}
                        </Text>
                      </Row>
                    </React.Fragment>
                  ))}
                </Card>
              </Section>
            </React.Fragment>
          );
        })}

        <Section title="Automations">
          <Card>
            <Eyebrow>Run now</Eyebrow>
            <Text variant="body" tone={color.textSecondary}>
              Journey completion, attendance settlement, PT package status and alerts all run on the
              server on their own. This forces a pass immediately.
            </Text>
            <Button
              title="RUN AUTOMATIONS"
              variant="secondary"
              icon="refresh"
              loading={busy}
              onPress={() =>
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await withToken((token) => api.runAutomations(token));
                    setSaved('Automations');
                  } catch (caught) {
                    setError(caught instanceof ApiError ? caught.message : 'Could not run those.');
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            />
          </Card>
        </Section>
      </Body>

      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text variant="heading">{editing?.key}</Text>
            {editing?.description ? (
              <Text variant="label" tone={color.textSecondary}>
                {editing.description}
              </Text>
            ) : null}
            {Array.isArray(editing?.value) ? (
              <Text variant="label" tone={color.textTertiary}>
                Separate values with commas.
              </Text>
            ) : null}

            <Input
              label="Value"
              value={draft}
              onChangeText={setDraft}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={`Value for ${editing?.key ?? 'setting'}`}
              testID="setting-value"
            />

            {error ? <Banner tone="critical">{error}</Banner> : null}

            <Button title="SAVE" loading={busy} onPress={save} />
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  setting: { gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start' },
  value: { textAlign: 'right', flexShrink: 1, maxWidth: '45%', paddingVertical: 4 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalCard: { gap: space.md },
});
