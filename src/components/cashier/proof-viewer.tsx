"use client";

import * as React from "react";
import {
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProofViewer({
  orderId,
  paymentId,
}: {
  orderId: string;
  paymentId: string;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const dragRef = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/cashier/orders/${orderId}/proof?paymentId=${paymentId}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Gagal memuat bukti");
        if (!cancelled) setUrl(json.data.url);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat bukti");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, paymentId]);

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-strong">Bukti Pembayaran</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Perkecil bukti"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-10 text-center text-xs font-semibold tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Perbesar bukti"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Reset tampilan bukti"
            onClick={reset}
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Buka bukti layar penuh"
            onClick={() => frameRef.current?.requestFullscreen?.().catch(() => undefined)}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>
      <div
        ref={frameRef}
        className="relative h-[380px] cursor-grab touch-none overflow-hidden rounded-xl bg-black/90 active:cursor-grabbing"
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          setOffset({
            x: drag.ox + (event.clientX - drag.x),
            y: drag.oy + (event.clientY - drag.y),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((z) => Math.min(4, Math.max(0.5, z - event.deltaY * 0.001)));
        }}
      >
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/70">
            {error}
          </p>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Bukti pembayaran"
            draggable={false}
            className="absolute left-1/2 top-1/2 max-h-none select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
            Memuat bukti...
          </p>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-text-muted">
        Geser untuk pan, gulir untuk zoom. Tautan berlaku 60 detik.
      </p>
    </div>
  );
}
