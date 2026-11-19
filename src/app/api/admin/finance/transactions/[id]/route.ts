import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import {
  deleteFinanceTransaction,
  updateFinanceTransaction,
} from "@/server/services/finance";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const data = await updateFinanceTransaction(id, await readJson(req), user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const data = await deleteFinanceTransaction(id, user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
