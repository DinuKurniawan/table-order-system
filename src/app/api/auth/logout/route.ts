import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: "Berhasil logout",
    });

    await destroySession(response);

    return response;
  } catch (err) {
    logger.error("Logout API error", err);
    return NextResponse.json(
      { error: "Gagal memproses logout" },
      { status: 500 }
    );
  }
}
