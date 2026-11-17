import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { reorderCategories } from "@/server/services/categories";
import { categoryReorderSchema } from "@/lib/validators/product";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const { ids } = categoryReorderSchema.parse(body);
    const categories = await reorderCategories(ids, user.id);
    return NextResponse.json({ data: categories });
  } catch (err) {
    return handleApiError(err);
  }
}
