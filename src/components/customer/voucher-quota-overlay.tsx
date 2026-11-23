"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/utils";

export function VoucherQuotaOverlay({
  open,
  code,
  totalWithoutVoucher,
  onContinueWithoutVoucher,
  onChangeCode,
}: {
  open: boolean;
  code: string;
  totalWithoutVoucher: number;
  onContinueWithoutVoucher: () => void;
  onChangeCode: () => void;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="voucher-quota-title"
      aria-describedby="voucher-quota-desc"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-0 bg-surface p-6 text-text shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-[#FEF1DF] text-[#8A4F06]">
        <TriangleAlert className="size-6" />
      </div>
      <h2
        id="voucher-quota-title"
        className="mt-4 text-lg font-bold text-text-strong"
      >
        Voucher baru saja habis
      </h2>
      <p id="voucher-quota-desc" className="mt-2 text-sm text-text-muted">
        Kode{" "}
        <span className="font-mono font-semibold text-text-strong">{code}</span>{" "}
        baru saja mencapai batas pemakaian. Pesanan belum dibuat dan stok belum
        dipotong.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
        <span className="text-text-muted">Total tanpa voucher</span>
        <span className="font-semibold tabular-nums text-text-strong">
          {formatRupiah(totalWithoutVoucher)}
        </span>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Button
          type="button"
          autoFocus
          onClick={onContinueWithoutVoucher}
          className="h-11 rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
        >
          Lanjutkan tanpa voucher
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onChangeCode}
          className="h-11 rounded-xl"
        >
          Ubah kode
        </Button>
      </div>
    </dialog>
  );
}
