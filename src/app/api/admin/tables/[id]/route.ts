import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { deleteTable, updateTable } from "@/server/services/tables";
import { tableUpdateSchema } from "@/lib/validators/table";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await readJson(req);
    const input = tableUpdateSchema.parse(body);
    const table = await updateTable(id, input, user.id);
    return NextResponse.json({ data: table });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    await deleteTable(id, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
