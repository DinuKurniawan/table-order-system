import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Pusher from "pusher";
import { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { orderAccessCookieName, timingSafeEqualString } from "@/lib/order-access";
import { logger } from "@/lib/logger";

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
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST /api/pusher/auth
 * Otorisasi channel private Pusher. Sesi staff divalidasi ke database
 * (isActive + tokenVersion) lewat jalur yang sama dengan requireRole.
 */
export async function POST(req: NextRequest) {
  try {
    const { socket_id: socketId, channel_name: channelName } = await readAuthBody(req);

    if (
      !socketId ||
      !channelName ||
      socketId.length > 100 ||
      channelName.length > 200 ||
      !/^[A-Za-z0-9_.:-]+$/.test(channelName)
    ) {
      return NextResponse.json(
        { error: "socket_id dan channel_name tidak valid" },
        { status: 400 }
      );
    }

    const user = await authenticateRequest(req);

    let allowed = false;

    if (channelName === "private-cashier") {
      allowed =
        user?.role === Role.SUPER_ADMIN || user?.role === Role.CASHIER;
    } else if (channelName === "private-admin") {
      allowed = user?.role === Role.SUPER_ADMIN;
    } else if (channelName.startsWith("private-user-")) {
      const userId = channelName.slice("private-user-".length);
      allowed = Boolean(user && user.id === userId);
    } else if (channelName.startsWith("private-order-")) {
      const code = channelName.slice("private-order-".length);
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
    } else if (channelName.startsWith("private-table-")) {
      const token = channelName.slice("private-table-".length);
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
