import { CHANNELS } from "@/lib/realtime-events";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Pusher from "pusher";
import { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api";
import { orderAccessCookieName, timingSafeEqualString } from "@/lib/order-access";
import { logger } from "@/lib/logger";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/client-ip";

interface AuthBody {
  socket_id?: string;
  channel_name?: string;
}

async function readAuthBody(req: NextRequest): Promise<AuthBody> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await req.json()) as AuthBody;
  }

  const form = await req.formData();
  return {
    socket_id: String(form.get("socket_id") ?? ""),
    channel_name: String(form.get("channel_name") ?? ""),
  };
}

function forbidden(): NextResponse {
  // Pesan generik: jangan bocorkan alasan penolakan (audit T-04).
  return apiErrorResponse("FORBIDDEN", "Forbidden", 403);
}

/**
 * POST /api/pusher/auth
 * Otorisasi channel private Pusher. Sesi staff divalidasi ke database
 * (isActive + tokenVersion) lewat jalur yang sama dengan requireRole.
 */
export async function POST(req: NextRequest) {
  try {
    // SEC-05: batasi per IP sebelum parsing body / query DB apa pun.
    const ip = getClientIp(req);
    const ipLimit = await consumeRateLimit(`pusher:auth:ip:${ip}`, 30, 60);
    if (ipLimit.limited) return tooManyRequests(ipLimit);

    const { socket_id: socketId, channel_name: channelName } = await readAuthBody(req);

    if (
      !socketId ||
      !channelName ||
      socketId.length > 100 ||
      channelName.length > 200 ||
      !/^[A-Za-z0-9_.:-]+$/.test(channelName)
    ) {
      return apiErrorResponse(
        "VALIDATION_ERROR",
        "socket_id dan channel_name tidak valid",
        400
      );
    }

    const user = await authenticateRequest(req);

    // Batas per user staf; IP sudah dibatasi lebih dulu.
    if (user) {
      const userLimit = await consumeRateLimit(
        `pusher:auth:user:${user.id}`,
        60,
        60
      );
      if (userLimit.limited) return tooManyRequests(userLimit);
    }

    let allowed = false;

    if (channelName === CHANNELS.cashier) {
      allowed =
        user?.role === Role.SUPER_ADMIN || user?.role === Role.CASHIER;
    } else if (channelName === CHANNELS.admin) {
      allowed = user?.role === Role.SUPER_ADMIN;
    } else if (channelName.startsWith(CHANNELS.userPrefix)) {
      const userId = channelName.slice(CHANNELS.userPrefix.length);
      allowed = Boolean(user && user.id === userId);
    } else if (channelName.startsWith(CHANNELS.orderPrefix)) {
      const code = channelName.slice(CHANNELS.orderPrefix.length);
      const token = req.cookies.get(orderAccessCookieName(code))?.value;

      if (token) {
        const order = await prisma.order.findUnique({
          where: { code },
          select: { accessToken: true },
        });
        allowed = Boolean(
          order && timingSafeEqualString(token, order.accessToken)
        );
      }
    } else if (channelName.startsWith(CHANNELS.tablePrefix)) {
      const token = channelName.slice(CHANNELS.tablePrefix.length);
      const table = await prisma.table.findUnique({
        where: { token },
        select: { isActive: true },
      });
      allowed = Boolean(table?.isActive);
    }

    if (!allowed) {
      return forbidden();
    }

    const pusher = new Pusher({
      appId: env.PUSHER_APP_ID,
      key: env.PUSHER_KEY,
      secret: env.PUSHER_SECRET,
      cluster: env.PUSHER_CLUSTER,
      useTLS: true,
    });

    return NextResponse.json(pusher.authorizeChannel(socketId, channelName));
  } catch (err) {
    logger.error("Pusher auth error", err);
    return apiErrorResponse("INTERNAL", "Internal server error", 500);
  }
}
