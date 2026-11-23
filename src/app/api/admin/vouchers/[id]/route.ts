import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import {
  deleteVoucher,
  getVoucher,
  updateVoucher,
} from "@/server/services/vouchers";
import { voucherUpdateSchema } from "@/lib/validators/voucher";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const voucher = await getVoucher(id);
    return NextResponse.json({ data: voucher });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await readJson(req);
    const input = voucherUpdateSchema.parse(body);
    const voucher = await updateVoucher(id, input, user.id);
    return NextResponse.json({ data: voucher });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    await deleteVoucher(id, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
