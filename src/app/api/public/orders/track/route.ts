import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, handleApiError, readJson } from "@/lib/api";
import {
  consumeRateLimit,
  isRateLimited,
  recordFailedAttempt,
  tooManyRequests,
} from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";
import { findActiveTableByToken } from "@/server/services/tables";
import { trackOrdersByCustomer } from "@/server/services/orders";

const TRACK_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_SECONDS = 10 * 60;

const trackSchema = z.object({
  name: z
    .string({ error: "Nama pemesan wajib diisi" })
    .trim()
    .min(2, "Nama pemesan minimal 2 karakter")
    .max(80, "Nama pemesan maksimal 80 karakter"),
  table: z
    .string({ error: "Nomor meja wajib diisi" })
    .trim()
    .min(1, "Nomor meja wajib diisi")
    .max(40, "Nomor meja maksimal 40 karakter"),
  tableToken: z
    .string({ error: "Barcode meja wajib dipindai" })
    .trim()
    .min(8, "Barcode meja tidak valid")
    .max(120, "Barcode meja tidak valid"),
});

/**
 * POST /api/public/orders/track
 * Lacak status pesanan lewat nama pemesan di meja yang berasal dari barcode.
 * Meja ditentukan server dari token barcode; pilihan meja dari klien hanya
 * dibandingkan, tidak pernah dipakai untuk query. Respons hanya berisi kode,
 * status, dan waktu; tanpa item/total.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Polling status tetap lancar; hanya pencarian gagal yang dihitung sebagai
    // percobaan enumerasi (pola yang sama dengan rate limit login).
    const flood = await consumeRateLimit(
      `track:flood:${ip}`,
      120,
      RATE_WINDOW_SECONDS
    );
    if (flood.limited) return tooManyRequests(flood);

    const misses = await isRateLimited(`track:miss:${ip}`, 10);
    if (misses.limited) return tooManyRequests(misses);

    const body = trackSchema.parse(await readJson(req, { maxBytes: 4096 }));

    const barcodeTable = await findActiveTableByToken(body.tableToken);
    const matchesBarcode =
      barcodeTable !== null &&
      barcodeTable.name.toLowerCase() === body.table.toLowerCase();

    if (!matchesBarcode) {
      await recordFailedAttempt(`track:miss:${ip}`, RATE_WINDOW_SECONDS);
      return apiErrorResponse(
        "FORBIDDEN",
        barcodeTable
          ? "Meja yang dipilih tidak sesuai dengan barcode meja Anda."
          : "Barcode meja tidak valid. Scan ulang QR di meja Anda.",
        403
      );
    }

    const since = new Date(Date.now() - TRACK_WINDOW_MS);
    const orders = await trackOrdersByCustomer({
      name: body.name,
      tableName: barcodeTable.name,
      since,
    });

    if (orders.length === 0) {
      await recordFailedAttempt(`track:miss:${ip}`, RATE_WINDOW_SECONDS);
    }

    return NextResponse.json(
      { orders },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
