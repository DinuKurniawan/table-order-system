import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { adjustStock } from "@/server/services/stock";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const data = await adjustStock(await readJson(req), user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
