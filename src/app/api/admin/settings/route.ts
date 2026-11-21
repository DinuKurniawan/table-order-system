import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { getPublicUrl } from "@/lib/r2";
import {
  getSettings,
  updateSettings,
  type AppSettings,
} from "@/server/services/settings";

function withLogoUrl(settings: AppSettings) {
  return {
    ...settings,
    logoUrl: settings.logoKey ? getPublicUrl(settings.logoKey) : null,
  };
}

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const settings = await getSettings();
    return NextResponse.json({ data: withLogoUrl(settings) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    // Validasi & merge di service: hanya key yang dikirim yang ditulis (T-01).
    const body = await readJson(req);
    const settings = await updateSettings(body, user.id);

    return NextResponse.json({ data: withLogoUrl(settings) });
  } catch (err) {
    return handleApiError(err);
  }
}
