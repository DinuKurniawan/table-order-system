import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Pusher from "pusher";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/session";
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

/**
 * POST /api/pusher/auth
 * Otorisasi channel private Pusher:
 * - staff: private-cashier / private-admin / private-user-{id}
 * - customer: private-order-{code} bila cookie accessToken cocok
 * - meja: private-table-{token} bila token meja aktif
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

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;
    const session = sessionToken ? await verifySessionToken(sessionToken) : null;

    const isStaff =
      session?.role === Role.SUPER_ADMIN || session?.role === Role.CASHIER;

    let allowed = false;

    if (channelName === "private-cashier" && isStaff) {
      allowed = true;
    } else if (channelName === "private-admin" && session?.role === Role.SUPER_ADMIN) {
      allowed = true;
    } else if (session && channelName === `private-user-${session.sub}`) {
      allowed = true;
    } else if (channelName.startsWith("private-order-")) {
      const code = channelName.slice("private-order-".length);
      const token = cookieStore.get(orderAccessCookieName(code))?.value;

      if (token) {
        const order = await prisma.order.findUnique({
          where: { code },
          select: { accessToken: true },
        });
        allowed = Boolean(order && timingSafeEqualString(token, order.accessToken));
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
      return NextResponse.json(
        { error: "Forbidden: channel tidak diizinkan" },
        { status: 403 }
      );
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
