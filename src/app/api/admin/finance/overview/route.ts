import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getFinanceOverview } from "@/server/services/finance";
import type { FinancePreset } from "@/lib/validators/finance";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const params = req.nextUrl.searchParams;
    const preset = params.get("preset");
    const data = await getFinanceOverview({
      preset: preset ? (preset as FinancePreset) : undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
