/**
 * Hitung notifikasi admin yang belum dibaca.
 *
 * Notifikasi berbentuk hitungan agregat (pesanan menunggu verifikasi, stok
 * menipis). "Sudah dibaca" disimpan per admin di tabel NotificationRead sebagai
 * waktu aktivitas terakhir yang sudah dilihat, bukan snapshot hitungan, agar
 * notifikasi baru tetap terdeteksi walau jumlahnya sempat turun.
 */

export interface NotificationAlertActivity {
  id: string;
  count: number;
  latestAt: string | Date;
  seenAt?: string | Date | null;
}

function toTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** Alert dianggap belum dibaca bila belum pernah dilihat atau ada aktivitas baru. */
export function isAlertUnread(alert: NotificationAlertActivity): boolean {
  if (!alert.seenAt) return true;
  return toTime(alert.latestAt) > toTime(alert.seenAt);
}

/** Total notifikasi baru: jumlah alert yang belum dilihat. */
export function unreadNotificationTotal(
  alerts: ReadonlyArray<NotificationAlertActivity>
): number {
  return alerts.reduce(
    (total, alert) => total + (isAlertUnread(alert) ? alert.count : 0),
    0
  );
}
