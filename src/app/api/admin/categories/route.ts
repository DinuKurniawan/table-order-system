import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { createCategory, listCategories } from "@/server/services/categories";
import { categoryInputSchema } from "@/lib/validators/product";

export async function GET() {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const categories = await listCategories();
    return NextResponse.json({ data: categories });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const input = categoryInputSchema.parse(body);
    const category = await createCategory(input, user.id);
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
