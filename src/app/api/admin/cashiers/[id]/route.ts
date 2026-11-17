import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { deleteCashier, updateCashier } from "@/server/services/cashiers";
import { cashierUpdateSchema } from "@/lib/validators/cashier";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await readJson(req);
    const input = cashierUpdateSchema.parse(body);
    const cashier = await updateCashier(id, input, user.id);
    return NextResponse.json({ data: cashier });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const result = await deleteCashier(id, user.id);
    return NextResponse.json({ success: true, mode: result.mode });
  } catch (err) {
    return handleApiError(err);
  }
}
