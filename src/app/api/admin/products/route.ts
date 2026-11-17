import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError, readJson } from "@/lib/api";
import { createProduct, listProducts } from "@/server/services/products";
import {
  productCreateSchema,
  productListQuerySchema,
} from "@/lib/validators/product";

export async function GET(req: Request) {
  try {
    await requireRole(["SUPER_ADMIN"]);
    const url = new URL(req.url);
    const query = productListQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await listProducts(query);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["SUPER_ADMIN"]);
    const body = await readJson(req);
    const input = productCreateSchema.parse(body);
    const product = await createProduct(input, user.id);
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
