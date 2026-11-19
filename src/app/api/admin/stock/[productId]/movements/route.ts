import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { stockHistoryQuerySchema } from "@/lib/validators/stock";
import { listStockMovements } from "@/server/services/stock";

type Params = { params: Promise<{ productId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const { productId } = await params;
    const query = stockHistoryQuerySchema.parse({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
    });
    const data = await listStockMovements(productId, query);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
