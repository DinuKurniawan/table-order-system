import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getPublicProduct } from "@/server/services/menu";
import { ItemDetailClient } from "./item-detail-client";

export const metadata: Metadata = {
  title: "Detail Menu",
};

// Data item harus ikut HTML pertama, sama seperti halaman menu.
export const instant = false;

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ token: string; productId: string }>;
}) {
  const { token, productId } = await params;

  let product;
  try {
    product = await getPublicProduct({ token, productId });
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  return <ItemDetailClient token={token} product={product} />;
}
