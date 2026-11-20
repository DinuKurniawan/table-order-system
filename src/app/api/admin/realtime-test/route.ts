import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { REALTIME_EVENTS, CHANNELS } from "@/lib/realtime-events";
import { emitToChannel } from "@/lib/pusher-server";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";

/**
 * POST /api/admin/realtime-test
 * SEC-11: event uji dikirim dari server, bukan dari bundel client.
 */
const testEventSchema = z.object({
  event: z.enum([
    REALTIME_EVENTS.orderCreated,
    REALTIME_EVENTS.paymentUploaded,
    REALTIME_EVENTS.orderStatusChanged,
    REALTIME_EVENTS.userDeactivated,
  ]),
});

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);

    const limit = await consumeRateLimit(`realtime-test:${user.id}`, 10, 60);
    if (limit.limited) return tooManyRequests(limit);

    const { event } = testEventSchema.parse(await req.json());

    emitToChannel(CHANNELS.admin, event, {
      test: true,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
