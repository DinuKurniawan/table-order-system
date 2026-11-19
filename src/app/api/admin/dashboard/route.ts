import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  getDashboard,
  type DashboardRange,
} from "@/server/services/dashboard";

const rangeSchema = z
  .enum(["today", "week", "month", "year"])
  .default("month");

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const range = rangeSchema.parse(
      req.nextUrl.searchParams.get("range") ?? undefined
    ) as DashboardRange;
    const data = await getDashboard(range, {
      name: user.name,
      role: user.role,
    });
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}
