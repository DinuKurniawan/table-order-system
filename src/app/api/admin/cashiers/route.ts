import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { createCashier, listCashiers } from "@/server/services/cashiers";
import { cashierCreateSchema } from "@/lib/validators/cashier";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const cashiers = await listCashiers();
    return NextResponse.json({ data: cashiers });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const input = cashierCreateSchema.parse(body);
    const cashier = await createCashier(input, user.id);
    return NextResponse.json({ data: cashier }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
