import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { listAuditLogs } from "@/server/services/audit";

/**
 * GET /api/admin/audit?page=&pageSize=&userId=&action=&from=&to=
 * SUPER_ADMIN saja. Tanggal dalam format YYYY-MM-DD (WIB, inklusif).
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN"]);

    const params = req.nextUrl.searchParams;
    const data = await listAuditLogs({
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
      userId: params.get("userId") || undefined,
      action: params.get("action") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
    });

    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
