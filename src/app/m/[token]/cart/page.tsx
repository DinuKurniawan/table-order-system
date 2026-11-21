import CartPage from "./cart-client";

// Render server blocking: state "memuat keranjang" ikut HTML pertama (target LCP).
export const instant = false;

export default async function CartRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CartPage token={token} />;
}
