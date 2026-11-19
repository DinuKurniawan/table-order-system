import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { advanceOrderStatus } from "@/server/services/cashier-orders";

type Params = { params: Promise<{ id: string }> };

const statusSchema = z.object({
  status: z.enum(["PREPARING", "READY", "COMPLETED"]),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["CASHIER", "SUPER_ADMIN"]);
    const { id } = await params;
    const { status } = statusSchema.parse(await readJson(req));
    const data = await advanceOrderStatus(id, user.id, status);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
