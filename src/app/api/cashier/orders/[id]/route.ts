import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getCashierOrder } from "@/server/services/cashier-orders";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireRole(["CASHIER", "SUPER_ADMIN"]);
    const { id } = await params;
    const data = await getCashierOrder(id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
