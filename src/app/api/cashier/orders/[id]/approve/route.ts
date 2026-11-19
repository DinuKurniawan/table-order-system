import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { approvePayment } from "@/server/services/cashier-orders";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["CASHIER", "SUPER_ADMIN"]);
    const { id } = await params;
    const data = await approvePayment(id, user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
