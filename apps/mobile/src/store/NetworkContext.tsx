/**
 * Network state.
 *
 * V1 requires a connection for check-in and check-out. There is no offline
 * queue on purpose: an attendance event written from a phone's clock, or
 * replayed hours later, would be exactly the kind of record this product
 * exists to make trustworthy. Offline, the app says so and records nothing.
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface NetworkState {
  isConnected: boolean;
  /** The device has a link *and* the OS believes the internet is reachable. */
  isOnline: boolean;
  type: string;
}

const NetworkContext = createContext<NetworkState>({
  isConnected: true,
  isOnline: true,
  type: 'unknown',
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isOnline: true,
    type: 'unknown',
  });

  useEffect(() => {
    const apply = (info: NetInfoState) => {
      const connected = info.isConnected ?? false;
      setState({
        isConnected: connected,
        // `isInternetReachable` is null while the OS is still deciding; treating
        // that as offline would flash a warning on every cold start.
        isOnline: connected && info.isInternetReachable !== false,
        type: info.type,
      });
    };

    NetInfo.fetch().then(apply).catch(() => undefined);
    return NetInfo.addEventListener(apply);
  }, []);

  const value = useMemo(() => state, [state]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkState {
  return useContext(NetworkContext);
}

export const OFFLINE_MESSAGE =
  'No connection. Check-in needs the server so the time is recorded from GymFlow, not your phone.';
