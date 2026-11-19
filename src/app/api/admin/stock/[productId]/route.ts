import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { updateStockSettings } from "@/server/services/stock";

type Params = { params: Promise<{ productId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { productId } = await params;
    const data = await updateStockSettings(productId, await readJson(req), user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
