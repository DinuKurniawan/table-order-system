import { listPaymentMethods } from "@/server/services/payment-methods";
import CartPage from "./cart-client";

// Render server blocking: state "memuat keranjang" ikut HTML pertama (target LCP).
export const instant = false;

export default async function CartRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const paymentMethods = (await listPaymentMethods())
    .filter((method) => method.isActive)
    .map((method) => ({
      id: method.id,
      label: method.label,
    }));

  return <CartPage token={token} paymentMethods={paymentMethods} />;
}
