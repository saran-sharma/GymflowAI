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

import { ApiError } from '../api/client';
import * as api from '../api/endpoints';
import type { AppAlert } from '../api/types';
import { AlertRow, SectionHeader } from './programme';
import {
  Banner,
  Body,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
  Txt,
} from './ui';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../store/AuthContext';
import { colors, spacing } from '../theme';
import { dayLabel } from '../utils/format';

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

  const dismiss = useCallback(
    async (alert: AppAlert) => {
      setError(null);
      try {
        await withToken((token) => api.acknowledgeAlert(alert.id, true, token));
        await alerts.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not update that.');
      }
    },
    [withToken, alerts],
  );

  if (alerts.loading) return <Loading label="Loading updates" />;
  if (alerts.error) {
    return (
      <Screen>
        <ErrorState detail={alerts.error.message} onRetry={alerts.reload} />
      </Screen>
    );
  }

  const rows = alerts.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={alerts.refreshing}
            onRefresh={() => void alerts.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <SectionHeader title={title} />
        {error ? <Banner tone="danger">{error}</Banner> : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="Nothing needs you"
            detail="Alerts appear here as they happen."
          />
        ) : (
          rows.map((alert) => {
            const target = routeFor(alert);
            return (
              <AlertRow
                key={alert.id}
                severity={alert.severity}
                title={alert.title}
                body={`${alert.body}  ·  ${dayLabel(alert.created_at)}`}
                onPress={
                  target
                    ? () => router.push(target as never)
                    : () => void dismiss(alert)
                }
              />
            );
          })
        )}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          GymFlow shows alerts inside the app. Push and WhatsApp are not enabled.
        </Txt>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
});
