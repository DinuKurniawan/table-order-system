import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { regenerateTableToken } from "@/server/services/tables";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const table = await regenerateTableToken(id, user.id);
    return NextResponse.json({ data: table });
  } catch (err) {
    return handleApiError(err);
  }
}
