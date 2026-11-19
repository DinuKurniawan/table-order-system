import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { rejectPayment } from "@/server/services/cashier-orders";

type Params = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Alasan penolakan wajib diisi")
    .max(500, "Alasan penolakan maksimal 500 karakter"),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["CASHIER", "SUPER_ADMIN"]);
    const { id } = await params;
    const { reason } = rejectSchema.parse(await readJson(req));
    const data = await rejectPayment(id, user.id, reason);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
