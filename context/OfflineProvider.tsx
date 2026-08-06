import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { checkApiHealth, getLastApiHealth, type ApiHealthStatus } from '../lib/offline/health';
import { flushOutbox, subscribeOutboxSync } from '../lib/offline/sync';
import { loadOutbox } from '../lib/offline/outbox';
import { realtimeClient, type RealtimeEvent } from '../lib/realtime/client';
import { useAuth } from './AuthContext';

type OfflineContextValue = {
  isOnline: boolean;
  apiHealth: ApiHealthStatus;
  outboxCount: number;
  realtimeStatus: 'connected' | 'disconnected' | 'polling' | 'idle';
  refreshConnectivity: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus>(getLastApiHealth());
  const [outboxCount, setOutboxCount] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<OfflineContextValue['realtimeStatus']>('idle');

  const refreshConnectivity = useCallback(async () => {
    const net = await NetInfo.fetch();
    const online = !!(net.isConnected && net.isInternetReachable !== false);
    setIsOnline(online);
    if (online) {
      const health = await checkApiHealth({ force: true });
      setApiHealth(health);
      if (health === 'up') {
        const result = await flushOutbox();
        setOutboxCount(result.remaining);
        if (result.flushed > 0) {
          await queryClient.invalidateQueries();
        }
      }
    } else {
      setApiHealth('down');
    }
  }, [queryClient]);

  useEffect(() => {
    let mounted = true;
    void loadOutbox().then((items) => {
      if (mounted) setOutboxCount(items.length);
    });
    const unsubSync = subscribeOutboxSync(({ remaining }) => {
      if (mounted) setOutboxCount(remaining);
    });
    const unsubNet = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) void refreshConnectivity();
      else setApiHealth('down');
    });
    void refreshConnectivity();
    return () => {
      mounted = false;
      unsubSync();
      unsubNet();
    };
  }, [refreshConnectivity]);

  useEffect(() => {
    if (!isAuthed) {
      realtimeClient.stop();
      setRealtimeStatus('idle');
      return;
    }
    const unsub = realtimeClient.subscribe((event: RealtimeEvent) => {
      if (event.type === 'connection') {
        setRealtimeStatus(event.status);
        return;
      }
      if (event.type === 'activity_update' || event.type === 'order.updated' || event.type === 'booking.updated') {
        void queryClient.invalidateQueries({ queryKey: ['activity'] });
        void queryClient.invalidateQueries({ queryKey: ['laundryOrders'] });
        void queryClient.invalidateQueries({ queryKey: ['bnbBookings'] });
        void queryClient.invalidateQueries({ queryKey: ['listingRequests'] });
      }
    });
    realtimeClient.start(true);
    return () => {
      unsub();
      realtimeClient.stop();
    };
  }, [isAuthed, queryClient]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void refreshConnectivity();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [refreshConnectivity]);

  const value = useMemo(
    () => ({
      isOnline,
      apiHealth,
      outboxCount,
      realtimeStatus,
      refreshConnectivity,
    }),
    [isOnline, apiHealth, outboxCount, realtimeStatus, refreshConnectivity],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    return {
      isOnline: true,
      apiHealth: 'unknown',
      outboxCount: 0,
      realtimeStatus: 'idle',
      refreshConnectivity: async () => undefined,
    };
  }
  return ctx;
}
