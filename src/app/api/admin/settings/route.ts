import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { getSettings, updateSettings, type AppSettings } from "@/server/services/settings";
import { appSettingsSchema } from "@/server/services/settings";
import { prisma } from "@/lib/db";

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
    const body = await readJson(req);
    const input = appSettingsSchema.partial().parse(body) as Partial<AppSettings>;
    const settings = await updateSettings(input);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "settings.update",
        entity: "Setting",
        entityId: "app",
        meta: { changedFields: Object.keys(input) },
      },
    });

    return NextResponse.json({ data: settings });
  } catch (err) {
    return handleApiError(err);
  }
}
