import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import {
  deletePaymentMethod,
  updatePaymentMethod,
} from "@/server/services/payment-methods";
import { paymentMethodUpdateSchema } from "@/lib/validators/payment-method";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await readJson(req);
    const input = paymentMethodUpdateSchema.parse(body);
    const method = await updatePaymentMethod(id, input, user.id);
    return NextResponse.json({ data: method });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    await deletePaymentMethod(id, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
