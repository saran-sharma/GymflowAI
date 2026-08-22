/**
 * The in-app alert centre, shared by all three roles.
 *
 * This is V1's only notification channel. Push and WhatsApp are future
 * channels and nothing here waits on them — an alert is a row the server
 * wrote, read over HTTP like everything else.
 */

import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../api/client';
import * as api from '../api/endpoints';
import type { AlertSeverity, AppAlert } from '../api/types';
import {
  AlertCard,
  Banner,
  Body,
  EmptyState,
  ErrorState,
  LinkButton,
  Screen,
  Section,
  SkeletonScreen,
  Text,
  color,
  space,
} from '../design';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../store/AuthContext';
import { dayLabel } from '../utils/format';

/**
 * Severity as a design-system tone.
 *
 * The server's three severities are not the system's seven tones, and mapping
 * them here rather than passing a raw colour is what keeps an alert's rule the
 * same hue as every other critical thing in the app.
 */
const SEVERITY_TONE = {
  info: 'info',
  warning: 'caution',
  critical: 'critical',
} as const;

/**
 * The groups a wall of alerts collapses into, most urgent first, each
 * collapsed to a handful of rows with a "Show N more" toggle rather than
 * every open alert stacked in one flat list.
 */
const SEVERITY_GROUPS: { key: AlertSeverity; title: string }[] = [
  { key: 'critical', title: 'Needs attention now' },
  { key: 'warning', title: 'Worth a look' },
  { key: 'info', title: 'Updates' },
];

const INITIAL_VISIBLE = 3;

/**
 * Map the server's action route onto an app route.
 *
 * The server describes *what* an alert is about; the client decides which of
 * its own screens shows that. Anything unrecognised simply does not navigate,
 * rather than dumping the user on a blank screen.
 */
function routeFor(alert: AppAlert): string | null {
  const route = alert.action_route ?? '';
  if (route.startsWith('/member/pt')) return '/(member)/pt';
  if (route.startsWith('/member/classes')) return '/(member)/classes';
  if (route.startsWith('/member')) return '/(member)';
  if (route.startsWith('/trainer/attendance')) return '/(trainer)/attendance';
  if (route.startsWith('/owner/trainer/')) {
    const id = route.split('/').pop();
    return id ? `/(owner)/trainer/${id}` : '/(owner)/trainers';
  }
  if (route.startsWith('/owner/corrections')) return '/(owner)/corrections';
  if (route.startsWith('/owner/classes')) return '/(owner)/classes';
  if (route.startsWith('/owner/member/')) return '/(owner)/members';
  return null;
}

export function AlertCentre({ title = 'Updates' }: { title?: string }) {
  const router = useRouter();
  const { withToken } = useAuth();
  const alerts = useApi<AppAlert[]>((token) => api.listAlerts(token), []);
  const [error, setError] = useState<string | null>(null);

  /* An alert that opens a screen is still acted on when it does — the member
   * read it and went where it pointed. Only an alert with nowhere to go is a
   * true dismissal. Acknowledging both the same way (`dismiss: true`) would
   * leave every actionable alert `OPEN` forever: it would keep reappearing in
   * this list and keep the unread badge on Home lit after the member had
   * already dealt with it. */
  const act = useCallback(
    async (alert: AppAlert, dismiss: boolean) => {
      setError(null);
      try {
        await withToken((token) => api.acknowledgeAlert(alert.id, dismiss, token));
        await alerts.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not update that.');
      }
    },
    [withToken, alerts],
  );

  if (alerts.loading) return <SkeletonScreen cards={4} stats={false} />;
  if (alerts.error) {
    const offline = alerts.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your updates'}
          detail={offline ? undefined : alerts.error.message}
          onRetry={alerts.reload}
        />
      </Screen>
    );
  }

  const rows = alerts.data ?? [];
  const groups = SEVERITY_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((a) => a.severity === group.key),
  })).filter((group) => group.rows.length > 0);

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={alerts.refreshing}
            onRefresh={() => void alerts.refresh()}
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">{title}</Text>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Nothing needs you"
            detail="Alerts appear here as they happen."
          />
        ) : (
          groups.map((group) => (
            <SeverityGroup
              key={group.key}
              title={group.title}
              rows={group.rows}
              onOpen={(alert) => {
                const target = routeFor(alert);
                if (target) {
                  void act(alert, false);
                  router.push(target as never);
                } else {
                  void act(alert, true);
                }
              }}
            />
          ))
        )}

        <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
          GymFlow shows alerts inside the app. Push and WhatsApp are not enabled.
        </Text>
      </Body>
    </Screen>
  );
}

/**
 * One severity's rows, collapsed to `INITIAL_VISIBLE` with a "Show N more"
 * toggle — the wall-of-cards problem was every open alert rendered at once
 * regardless of how many there were; this bounds what a trainer or owner
 * sees before choosing to see more of one severity specifically.
 */
function SeverityGroup({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: AppAlert[];
  onOpen: (alert: AppAlert) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, INITIAL_VISIBLE);
  const remaining = rows.length - visible.length;

  return (
    <Section
      title={`${title} (${rows.length})`}
      action={
        remaining > 0 ? (
          <LinkButton title={`Show ${remaining} more`} onPress={() => setExpanded(true)} />
        ) : expanded && rows.length > INITIAL_VISIBLE ? (
          <LinkButton title="Show less" onPress={() => setExpanded(false)} />
        ) : undefined
      }
    >
      {visible.map((alert) => (
        <AlertCard
          key={alert.id}
          tone={SEVERITY_TONE[alert.severity] ?? 'info'}
          title={alert.title}
          body={alert.body}
          meta={dayLabel(alert.created_at)}
          onPress={() => onOpen(alert)}
        />
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: space.lg },
});
