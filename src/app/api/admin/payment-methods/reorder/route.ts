import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { reorderPaymentMethods } from "@/server/services/payment-methods";
import { paymentMethodReorderSchema } from "@/lib/validators/payment-method";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const { ids } = paymentMethodReorderSchema.parse(body);
    const methods = await reorderPaymentMethods(ids, user.id);
    return NextResponse.json({ data: methods });
  } catch (err) {
    return handleApiError(err);
  }
}
