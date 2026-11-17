import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { createTable, listTables } from "@/server/services/tables";
import { tableInputSchema } from "@/lib/validators/table";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const tables = await listTables();
    return NextResponse.json({ data: tables });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const input = tableInputSchema.parse(body);
    const table = await createTable(input, user.id);
    return NextResponse.json({ data: table }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
