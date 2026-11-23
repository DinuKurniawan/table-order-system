import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { createVoucher, listVouchers } from "@/server/services/vouchers";
import {
  voucherCreateSchema,
  voucherListQuerySchema,
} from "@/lib/validators/voucher";

export async function GET(req: Request) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const url = new URL(req.url);
    const query = voucherListQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );
    const result = await listVouchers(query);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const input = voucherCreateSchema.parse(body);
    const voucher = await createVoucher(input, user.id);
    return NextResponse.json({ data: voucher }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
