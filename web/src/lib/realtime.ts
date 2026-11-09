import { apiBase } from "./apiBase";
import { authHeader, readSession } from "./auth";

/**
 * Console realtime over Supabase Realtime (Phoenix protocol on a native WebSocket).
 * The API publishes per-user broadcasts; the topic comes from /realtime/config.
 */

export type RealtimeEvent = {
  event: string;
  data: Record<string, unknown>;
  at: string;
};

type Handler = (message: RealtimeEvent) => void;

type RealtimeConfig = {
  enabled: boolean;
  url: string | null;
  key: string | null;
  topic: string | null;
};

type PhoenixFrame = {
  event?: string;
  topic?: string;
  ref?: string | null;
  payload?: {
    status?: string;
    event?: string;
    payload?: Record<string, unknown>;
  };
};

const HEARTBEAT_MS = 25_000;

async function loadConfig(): Promise<RealtimeConfig | null> {
  const response = await fetch(`${apiBase()}/api/v1/realtime/config`, {
    headers: authHeader(),
  });
  if (!response.ok) return null;
  return (await response.json()) as RealtimeConfig;
}

function socketUrl(config: RealtimeConfig): string {
  const url = new URL(`${config.url}/realtime/v1/websocket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("apikey", config.key ?? "");
  url.searchParams.set("vsn", "1.0.0");
  return url.toString();
}

class RealtimeClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private intentionalClose = false;
  private attempt = 0;
  private ref = 0;
  private joinedOnce = false;
  private connecting = false;
  private disabled = false;

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    void this.ensureConnected();
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) this.disconnect();
    };
  }

  private nextRef(): string {
    this.ref += 1;
    return String(this.ref);
  }

  private emit(message: RealtimeEvent) {
    for (const handler of this.handlers) handler(message);
  }

  private async ensureConnected() {
    if (this.disabled || this.connecting || !readSession()?.accessToken) return;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.connecting = true;
    this.intentionalClose = false;
    let config: RealtimeConfig | null = null;
    try {
      config = await loadConfig();
    } catch {
      config = null;
    } finally {
      this.connecting = false;
    }
    if (this.handlers.size === 0) return;
    if (!config) {
      this.scheduleReconnect();
      return;
    }
    if (!config.enabled || !config.url || !config.key || !config.topic) {
      this.disabled = true;
      return;
    }
    this.open(config);
  }

  private open(config: RealtimeConfig) {
    const topic = `realtime:${config.topic}`;
    const socket = new WebSocket(socketUrl(config));
    this.socket = socket;
    const joinRef = this.nextRef();

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          topic,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { key: "" },
              postgres_changes: [],
              private: false,
            },
          },
          ref: joinRef,
          join_ref: joinRef,
        }),
      );
      this.stopHeartbeat();
      this.heartbeatTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: this.nextRef() }),
          );
        }
      }, HEARTBEAT_MS);
    };

    socket.onmessage = (event) => {
      let frame: PhoenixFrame;
      try {
        frame = JSON.parse(String(event.data)) as PhoenixFrame;
      } catch {
        return;
      }
      if (frame.topic !== topic) return;
      if (frame.event === "phx_reply" && frame.ref === joinRef) {
        if (frame.payload?.status !== "ok") {
          socket.close();
          return;
        }
        this.attempt = 0;
        // Panels already loaded on mount; only a re-join may have missed events.
        if (this.joinedOnce) {
          this.emit({ event: "realtime.ready", data: {}, at: new Date().toISOString() });
        }
        this.joinedOnce = true;
        return;
      }
      if (frame.event === "broadcast" && frame.payload?.event) {
        const data = frame.payload.payload ?? {};
        this.emit({
          event: frame.payload.event,
          data,
          at: typeof data.at === "string" ? data.at : new Date().toISOString(),
        });
      }
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      if (this.socket === socket) this.socket = null;
      if (this.intentionalClose || this.handlers.size === 0) return;
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, delay);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.joinedOnce = false;
    this.disabled = false;
  }
}

export const realtime = new RealtimeClient();

export function onRealtime(events: string[] | "*", handler: Handler): () => void {
  const wanted = events === "*" ? null : new Set(events);
  return realtime.subscribe((message) => {
    if (wanted && !wanted.has(message.event)) return;
    handler(message);
  });
}

/** Runs `callback` when the tab becomes visible again and every `intervalMs` while visible. */
export function onVisibleRefresh(callback: () => void, intervalMs: number): () => void {
  let timer: number | null = null;
  const start = () => {
    if (timer == null) timer = window.setInterval(callback, intervalMs);
  };
  const stop = () => {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      callback();
      start();
    } else {
      stop();
    }
  };
  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
