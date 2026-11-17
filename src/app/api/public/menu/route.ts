import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";

    let where: any = { deletedAt: null };

    // Filter by search query
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // Filter by category
    if (category) {
      if (category === "makanan") {
        where.category = { type: "FOOD" };
      } else if (category === "kopi") {
        where.category = { type: "DRINK", subtype: "COFFEE" };
      } else if (category === "non-kopi") {
        where.category = { type: "DRINK", subtype: "NON_COFFEE" };
      }
    }

    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ products });
  } catch (err) {
    console.error("Error fetching public menu:", err);
    return NextResponse.json(
      { error: "Gagal memuat menu" },
      { status: 500 }
    );
  }
}