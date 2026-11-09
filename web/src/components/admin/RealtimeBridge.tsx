import { useEffect } from "react";

import { onRealtime } from "../../lib/realtime";

/**
 * Keeps the console WebSocket alive while the admin shell is mounted.
 * Feature panels subscribe to specific events via `onRealtime`.
 */
export default function RealtimeBridge() {
  useEffect(() => {
    return onRealtime("*", () => {
      /* connection keepalive — handlers elsewhere do the work */
    });
  }, []);
  return null;
}
