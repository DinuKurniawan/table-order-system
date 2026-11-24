import * as React from "react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { orderAccessCookieName } from "@/lib/order-access";
import {
  getCustomerOrder,
  type CustomerOrderDTO,
} from "@/server/services/orders";
import { AccessForm } from "./access-form";
import { OrderTracking } from "./order-tracking";

export const metadata: Metadata = {
  title: "Lacak Pesanan",
  description: "Pantau status dan pembayaran pesanan Anda secara realtime",
};

export default function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ metode?: string | string[] }>;
}) {
  return (
    <main className="min-h-screen bg-app px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <React.Suspense fallback={<TrackingSkeleton />}>
          <OrderGate params={params} searchParams={searchParams} />
        </React.Suspense>
      </div>
    </main>
  );
}

async function OrderGate({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ metode?: string | string[] }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const preferredMethodId =
    typeof query.metode === "string" ? query.metode : undefined;
  const cookieStore = await cookies();
  const token = cookieStore.get(orderAccessCookieName(code))?.value;

  if (!token) {
    return <AccessForm code={code} />;
  }

  let order: CustomerOrderDTO | null = null;
  try {
    order = await getCustomerOrder(code, token);
  } catch {
    order = null;
  }

  if (!order) {
    return <AccessForm code={code} invalid />;
  }

  return (
    <OrderTracking initial={order} preferredMethodId={preferredMethodId} />
  );
}

function TrackingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-40 rounded-[20px] border border-border bg-surface" />
      <div className="h-56 rounded-[20px] border border-border bg-surface" />
      <p className="text-center text-xs text-text-muted">Memuat pesanan...</p>
    </div>
  );
}
