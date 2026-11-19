import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import {
  createFinanceTransaction,
  listFinanceTransactions,
} from "@/server/services/finance";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const params = req.nextUrl.searchParams;
    const data = await listFinanceTransactions({
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
      type: params.get("type") ?? undefined,
      category: params.get("category") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const data = await createFinanceTransaction(await readJson(req), user.id);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
