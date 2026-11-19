import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { listCashierOrders } from "@/server/services/cashier-orders";

export async function GET() {
  try {
    await requireRole(["CASHIER", "SUPER_ADMIN"]);
    const data = await listCashierOrders();
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
