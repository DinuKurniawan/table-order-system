import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import {
  createPaymentMethod,
  listPaymentMethods,
} from "@/server/services/payment-methods";
import { paymentMethodInputSchema } from "@/lib/validators/payment-method";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const methods = await listPaymentMethods();
    return NextResponse.json({ data: methods });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const input = paymentMethodInputSchema.parse(body);
    const method = await createPaymentMethod(input, user.id);
    return NextResponse.json({ data: method }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
