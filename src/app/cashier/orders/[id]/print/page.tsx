import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { cn, formatRupiah, formatWIB } from "@/lib/utils";
import { getSettings } from "@/server/services/settings";
import { getCashierOrder } from "@/server/services/cashier-orders";
import { PrintRunner } from "@/components/cashier/print-runner";

const WIDTHS = { 58: "58mm", 80: "80mm" } as const;

export default async function PrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  await requireRole(["CASHIER", "SUPER_ADMIN"]);
  const { id } = await params;
  const { w } = await searchParams;
  const width = w === "80" ? 80 : 58;

  let order;
  try {
    order = await getCashierOrder(id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  const settings = await getSettings();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <style>{`@page { size: ${width}mm auto; margin: 0; }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/cashier/orders/${order.id}`}
            className="font-medium text-primary hover:underline"
          >
            ← Kembali ke pesanan
          </Link>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">
            Dicetak {order.printCount}×
            {order.printedAt ? ` (terakhir ${formatWIB(order.printedAt, "short")})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(["58", "80"] as const).map((option) => (
            <Link
              key={option}
              href={`/cashier/orders/${order.id}/print?w=${option}`}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                width === Number(option)
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-text"
              )}
            >
              {option} mm
            </Link>
          ))}
          <PrintRunner orderId={order.id} />
        </div>
      </div>

      <div
        className="mx-auto bg-white text-black shadow-card print:shadow-none"
        style={{ width: WIDTHS[width], padding: "4mm 3mm" }}
      >
        <div className={cn("font-mono leading-tight", width === 58 ? "text-[10px]" : "text-[11px]")}>
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-wide">
              {settings.namaKafe}
            </p>
            <p className="mt-1 border-y border-dashed border-black py-1 font-bold">
              {order.code}
            </p>
          </div>

          <div className="mt-2 space-y-0.5">
            <div className="flex justify-between gap-2">
              <span>Meja</span>
              <span className="font-bold">{order.tableName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Waktu</span>
              <span>{formatWIB(order.createdAt, "short")}</span>
            </div>
            {order.customerName && (
              <div className="flex justify-between gap-2">
                <span>Nama</span>
                <span>{order.customerName}</span>
              </div>
            )}
          </div>

          <div className="my-2 border-t border-dashed border-black" />

          <ul className="space-y-1.5">
            {order.items.map((item) => {
              const note = item.note?.trim();
              return (
                <li key={item.id}>
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatRupiah(item.price * item.quantity)}
                    </span>
                  </div>
                  {note && (
                    <p className="uppercase">* {note.toUpperCase()}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {order.note && (
            <>
              <div className="my-2 border-t border-dashed border-black" />
              <p className="font-bold uppercase">CATATAN: {order.note.toUpperCase()}</p>
            </>
          )}

          <div className="my-2 border-t border-dashed border-black" />

          <div className="flex justify-between gap-2 text-sm font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatRupiah(order.total)}</span>
          </div>
          <p className="mt-1 text-center font-bold tracking-widest">LUNAS</p>

          <div className="my-2 border-t border-dashed border-black" />

          <p className="text-center text-[9px] uppercase leading-snug">
            {settings.footerStruk}
          </p>
          <p className="mt-1 text-center text-[8px]">
            {order.printCount + 1 > 1 ? "CETAK ULANG" : "STRUK PESANAN"}
          </p>
        </div>
      </div>
    </div>
  );
}
