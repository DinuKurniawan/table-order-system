import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { getSettings, updateSettings } from "@/server/services/settings";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const settings = await getSettings();
    return NextResponse.json({ data: settings });
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

    return NextResponse.json({ data: settings });
  } catch (err) {
    return handleApiError(err);
  }
}
