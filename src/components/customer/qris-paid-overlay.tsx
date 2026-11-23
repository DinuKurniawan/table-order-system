"use client";

import * as React from "react";
import { CheckCircle2, Loader2, QrCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/utils";

export type QrisOverlayStage = "reminder" | "confirm" | "success" | null;

/**
 * Overlay QRIS: pengingat klaim, konfirmasi, dan status berhasil.
 * Native <dialog> seperti voucher-quota-overlay; fokus terperangkap.
 */
export function QrisPaidOverlay({
  stage,
  code,
  total,
  submitting,
  onConfirm,
  onDismiss,
}: {
  stage: QrisOverlayStage;
  code: string;
  total: number;
  submitting: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (stage && !dialog.open) dialog.showModal();
    if (!stage && dialog.open) dialog.close();
  }, [stage]);

  if (!stage) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="qris-overlay-title"
      aria-describedby="qris-overlay-desc"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border-0 bg-surface p-6 text-text shadow-pop backdrop:bg-black/50"
    >
      {stage === "reminder" && (
        <>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-50">
            <QrCode className="size-6 text-primary" />
          </div>
          <h2
            id="qris-overlay-title"
            className="mt-4 text-center text-lg font-bold text-text-strong"
          >
            Sudah melakukan pembayaran?
          </h2>
          <p
            id="qris-overlay-desc"
            className="mt-2 text-center text-sm text-text"
          >
            Tekan <strong>Saya sudah bayar</strong> agar pesananmu masuk antrean
            kasir. Kalau belum, abaikan peringatan ini.
          </p>
          <div className="mt-5 grid gap-2">
            <Button
              type="button"
              className="h-11 w-full"
              onClick={onConfirm}
              autoFocus
            >
              Saya sudah bayar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={onDismiss}
            >
              Nanti
            </Button>
          </div>
        </>
      )}

      {stage === "confirm" && (
        <>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-orange/15">
            <TriangleAlert className="size-6 text-accent-orange" />
          </div>
          <h2
            id="qris-overlay-title"
            className="mt-4 text-center text-lg font-bold text-text-strong"
          >
            Konfirmasi Pembayaran QRIS
          </h2>
          <p
            id="qris-overlay-desc"
            className="mt-2 text-center text-sm text-text"
          >
            Pastikan pembayaran <strong>{formatRupiah(total)}</strong> sudah
            berhasil. Kasir akan mencocokkan mutasi; klaim palsu akan ditolak.
          </p>
          <div className="mt-5 grid gap-2">
            <Button
              type="button"
              className="h-11 w-full gap-2"
              disabled={submitting}
              onClick={onConfirm}
              autoFocus
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Mengirim..." : "Ya, sudah bayar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              disabled={submitting}
              onClick={onDismiss}
            >
              Belum
            </Button>
          </div>
        </>
      )}

      {stage === "success" && (
        <>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-green/15">
            <CheckCircle2 className="size-6 text-emerald-600" />
          </div>
          <h2
            id="qris-overlay-title"
            className="mt-4 text-center text-lg font-bold text-text-strong"
          >
            Pembayaran terkirim
          </h2>
          <p
            id="qris-overlay-desc"
            className="mt-2 text-center text-sm text-text"
          >
            Kasir akan memverifikasi pembayaranmu. Tidak perlu unggah bukti.
          </p>
          <p className="mt-3 text-center font-mono text-sm font-bold tracking-wide text-text-muted">
            {code}
          </p>
          <Button
            type="button"
            className="mt-5 h-11 w-full"
            onClick={onDismiss}
            autoFocus
          >
            Tutup
          </Button>
        </>
      )}
    </dialog>
  );
}
