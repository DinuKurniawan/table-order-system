import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { resetCashierPassword } from "@/server/services/cashiers";
import { cashierResetPasswordSchema } from "@/lib/validators/cashier";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await readJson(req);
    const input = cashierResetPasswordSchema.parse(body);
    await resetCashierPassword(id, input, user.id);
    return NextResponse.json({
      success: true,
      message: "Password kasir diperbarui. Sesi aktif kasir telah diputus.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
