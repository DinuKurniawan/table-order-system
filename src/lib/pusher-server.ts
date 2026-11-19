/**
 * Pusher server instance for broadcasting realtime events.
 * 
 * Prinsip: Pusher hanya mengirim "signal" perubahan. Klien lalu meng-invalidasi
 * cache TanStack Query dan mengambil data terbaru dari API. Integrasi lengkap
 * (channel membership, auth handshake) akan dibuat di Step 9.
 */

import Pusher from "pusher";
import { logger } from "./logger";

let pusherInstance: Pusher | null = null;

/**
 * Menginisialisasi Pusher instance sekali saja (singleton).
 * Gunakan .env: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER.
 */
export function getPusher(): Pusher | null {
  if (process.env.DISABLE_REALTIME === "true") return null;
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
      logger.warn(
        "Pusher environment variables not fully configured. " +
          "Realtime features will be disabled until all PUSHER_* vars are set."
      );
      return null;
    }

    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }

  return pusherInstance;
}

/**
 * Emit event ke channel dengan penanganan error best-effort.
 * Jika Pusher tidak terkonfigurasi atau gagal, request tidak akan gagal.
 * Hanya log error ke konsol server.
 * 
 * @param channel Nama channel (misal: "private-order-ORD-123")
 * @param event Nama event (misal: "order.status_changed")
 * @param payload Data payload yang akan dikirim
 */
export function emitToChannel(channel: string, event: string, payload: unknown): void {
  const pusher = getPusher();
  if (!pusher) {
    // Pusher belum dikonfigurasi; biarkan aplikasi berjalan tanpa realtime
    logger.debug(`Pusher not configured, skip emit to channel "${channel}"`);
    return;
  }

  try {
    void pusher
      .trigger(channel, event, payload)
      .catch((err: unknown) =>
        logger.error(`Pusher emit gagal channel="${channel}" event="${event}"`, err)
      );
  } catch (err) {
    // Jangan melempar error ke request handler; hanya log
    logger.error(`Pusher emit gagal channel="${channel}" event="${event}"`, err);
  }
}