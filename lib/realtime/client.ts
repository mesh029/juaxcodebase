import { AppState, type AppStateStatus } from 'react-native';
import { getApiBaseUrl, getStoredToken } from '../api';
import { getWsUrl } from '../config';
import { cacheActivitySnapshot } from '../offline/cache';
import { checkApiHealth } from '../offline/health';

export type RealtimeEvent =
  | { type: 'activity_update'; snapshot: unknown; at?: string }
  | { type: 'order.updated' | 'laundry.status'; payload: unknown }
  | { type: 'booking.updated'; payload: unknown }
  | { type: 'trip.updated'; payload: unknown }
  | { type: 'notification'; payload: unknown }
  | { type: 'ping' }
  | { type: 'connection'; status: 'connected' | 'disconnected' | 'polling' };

type Listener = (event: RealtimeEvent) => void;

const POLL_MS = 35_000;
const MAX_BACKOFF_MS = 45_000;

function deriveSseUrl(token: string): string {
  const base = getApiBaseUrl();
  return `${base}/api/v1/activity/stream?token=${encodeURIComponent(token)}`;
}

/**
 * Thin realtime adapter:
 * 1) WebSocket if EXPO_PUBLIC_WS_URL set
 * 2) SSE activity stream (backend today)
 * 3) Poll /api/v1/activity/snapshot every ~35s
 */
export class RealtimeClient {
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private aborted = false;
  private backoff = 1000;
  private sseAbort: AbortController | null = null;
  private appState: AppStateStatus = AppState.currentState;
  private authed = false;
  private appStateSub: { remove: () => void } | null = null;

  start(authed: boolean) {
    this.authed = authed;
    this.aborted = false;
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener('change', this.onAppState);
    }
    void this.connect();
  }

  stop() {
    this.aborted = true;
    this.cleanupTransport();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RealtimeEvent) {
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch {
        /* ignore */
      }
    });
  }

  private onAppState = (next: AppStateStatus) => {
    this.appState = next;
    if (next === 'active' && this.authed && !this.aborted) {
      void this.connect();
    } else if (next !== 'active') {
      this.cleanupTransport();
    }
  };

  private cleanupTransport() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    if (this.sseAbort) {
      this.sseAbort.abort();
      this.sseAbort = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.aborted || this.appState !== 'active') return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const jitter = Math.floor(Math.random() * 400);
    const delay = Math.min(MAX_BACKOFF_MS, this.backoff) + jitter;
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 1.7);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private async connect() {
    if (this.aborted || !this.authed || this.appState !== 'active') return;
    const health = await checkApiHealth();
    if (health !== 'up') {
      this.startPolling();
      return;
    }

    const token = await getStoredToken();
    if (!token) {
      this.emit({ type: 'connection', status: 'disconnected' });
      return;
    }

    const wsBase = getWsUrl();
    if (wsBase) {
      this.connectWs(wsBase, token);
      return;
    }

    void this.connectSse(token);
  }

  private connectWs(wsBase: string, token: string) {
    this.cleanupTransport();
    const url = `${wsBase}/socket?token=${encodeURIComponent(token)}`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.backoff = 1000;
        this.emit({ type: 'connection', status: 'connected' });
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(String(msg.data)) as RealtimeEvent & { type: string };
          this.handlePayload(data);
        } catch {
          /* ignore malformed */
        }
      };
      ws.onerror = () => {
        this.emit({ type: 'connection', status: 'disconnected' });
      };
      ws.onclose = () => {
        this.ws = null;
        this.scheduleReconnect();
      };
    } catch {
      void this.connectSse(token);
    }
  }

  private async connectSse(token: string) {
    this.cleanupTransport();
    const controller = new AbortController();
    this.sseAbort = controller;
    const url = deriveSseUrl(token);

    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        this.startPolling();
        return;
      }
      this.backoff = 1000;
      this.emit({ type: 'connection', status: 'connected' });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!this.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const dataLine = chunk
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
            .join('');
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine) as RealtimeEvent & { type: string };
            this.handlePayload(payload);
          } catch {
            /* ignore */
          }
        }
      }
      if (!this.aborted) this.scheduleReconnect();
    } catch {
      if (!this.aborted) this.startPolling();
    }
  }

  private startPolling() {
    this.cleanupTransport();
    this.emit({ type: 'connection', status: 'polling' });
    const tick = async () => {
      if (this.aborted || this.appState !== 'active' || !this.authed) return;
      try {
        const { fetchActivitySnapshot } = await import('../api');
        const snapshot = await fetchActivitySnapshot();
        await cacheActivitySnapshot(snapshot);
        this.emit({ type: 'activity_update', snapshot, at: new Date().toISOString() });
      } catch {
        /* keep last cache */
      }
    };
    void tick();
    this.pollTimer = setInterval(() => {
      void tick();
    }, POLL_MS);
  }

  private handlePayload(data: { type: string; snapshot?: unknown; payload?: unknown; at?: string }) {
    if (data.type === 'ping') {
      this.emit({ type: 'ping' });
      return;
    }
    if (data.type === 'activity_update') {
      void cacheActivitySnapshot(data.snapshot);
      this.emit({ type: 'activity_update', snapshot: data.snapshot, at: data.at });
      return;
    }
    if (
      data.type === 'order.updated' ||
      data.type === 'laundry.status' ||
      data.type === 'booking.updated' ||
      data.type === 'trip.updated' ||
      data.type === 'notification'
    ) {
      this.emit(data as RealtimeEvent);
    }
  }
}

export const realtimeClient = new RealtimeClient();
