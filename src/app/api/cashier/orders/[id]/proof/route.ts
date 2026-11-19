import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { getSignedReadUrl } from "@/lib/r2";
import { getPaymentProofKey } from "@/server/services/cashier-orders";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/cashier/orders/[id]/proof?paymentId=...
 * Mengembalikan presigned URL bukti bayar (bucket privat, berlaku 60 detik).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireRole(["CASHIER", "SUPER_ADMIN"]);
    const { id } = await params;
    const paymentId = req.nextUrl.searchParams.get("paymentId") ?? undefined;

    const key = await getPaymentProofKey(id, paymentId);
    const url = await getSignedReadUrl(env.R2_BUCKET_PRIVATE, key, 60);

    return NextResponse.json({ data: { url, expiresIn: 60 } });
  } catch (err) {
    return handleApiError(err);
  }
}
