import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Pusher from "pusher";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * POST /api/pusher/auth
 * 
 * Mendapatkan token otorisasi Pusher untuk channel private.
 * 
 * Request body: { channel?: string }
 * Token diambil dari cookie session (session_token).
 * 
 * Response: { auth: string } untuk pusher-js channel auth
 * 
 * Prinsip: Pusher hanya mengirim "signal" perubahan. Klien lalu meng-invalidasi
 * cache TanStack Query dan mengambil data terbaru dari API.
 * Endpoint ini mengembalikan auth token yang pusher-js ambil via authEndpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requestedChannel = body?.channel;

    // --- Baca session token dari cookie ---
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    // --- Autentikasi user dari JWT session ---
    let user: { id: string; role: Role; isActive: boolean } | null = null;

    if (sessionToken) {
      try {
        const payload = await import("@/lib/session")
          .then((mod) => mod.verifySessionToken(sessionToken));

        if (payload?.sub && payload?.role) {
          user = {
            id: payload.sub,
            role: payload.role as Role,
            isActive: true,
          };
        }
      } catch {
        // session invalid - user remains null
      }
    }

    // --- Tentukan channel berdasarkan role ---
    let channelName: string | null = null;

    // 1. private-cashier: SUPER_ADMIN atau CASHIER
    if (user?.role === Role.SUPER_ADMIN || user?.role === Role.CASHIER) {
      channelName = "private-cashier";
    }
    // 2. private-admin: SUPER_ADMIN hanya
    else if (user?.role === Role.SUPER_ADMIN) {
      channelName = "private-admin";
    }
    // 3. private-user-{id}: hanya user yang bersangkutan
    else if (user?.id) {
      channelName = `private-user-${user.id}`;
    }

    if (!channelName) {
      return NextResponse.json(
        { error: "Forbidden: no matching channel" },
        { status: 403 }
      );
    }

    // Generate Pusher auth token menggunakan server SDK
    const pusher = new Pusher({
      appId: env.PUSHER_APP_ID,
      key: env.PUSHER_KEY,
      secret: env.PUSHER_SECRET,
      cluster: env.PUSHER_CLUSTER,
      useTLS: true,
    });

    // authenticate dengan socketId kosong (client pakai authEndpoint)
    // dan channelName yang sudah ditentukan
    const authResult = pusher.authenticate("", requestedChannel || channelName);

    return NextResponse.json({ auth: authResult.auth });

  } catch (err) {
    console.error("Pusher auth error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}