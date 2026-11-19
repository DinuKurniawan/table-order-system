import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { listStockProducts } from "@/server/services/stock";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const data = await listStockProducts();
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
