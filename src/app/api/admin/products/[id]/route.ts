import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { deleteProduct, updateProduct } from "@/server/services/products";
import { productUpdateSchema } from "@/lib/validators/product";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await readJson(req);
    const input = productUpdateSchema.parse(body);
    const product = await updateProduct(id, input, user.id);
    return NextResponse.json({ data: product });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const { id } = await params;
    const result = await deleteProduct(id, user.id);
    return NextResponse.json({ success: true, mode: result.mode });
  } catch (err) {
    return handleApiError(err);
  }
}
