import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { listVoucherRedemptions } from "@/server/services/vouchers";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "10");
    const result = await listVoucherRedemptions(id, { page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
