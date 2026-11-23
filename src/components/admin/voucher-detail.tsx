"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PillBadge, type PillVariant } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { formatRupiah, formatWIB } from "@/lib/utils";
import type {
  VoucherDTO,
  VoucherRedemptionResult,
  VoucherStatus,
} from "@/types/voucher";

function statusMeta(status: VoucherStatus): {
  label: string;
  variant: PillVariant;
} {
  switch (status) {
    case "AKTIF":
      return { label: "Aktif", variant: "success" };
    case "TERJADWAL":
      return { label: "Terjadwal", variant: "info" };
    case "HABIS":
      return { label: "Habis", variant: "warning" };
    case "BERAKHIR":
      return { label: "Berakhir", variant: "neutral" };
    default:
      return { label: "Nonaktif", variant: "danger" };
  }
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat data");
  return json as T;
}

export function VoucherDetail({
  voucher,
  onClose,
  onEdit,
}: {
  voucher: VoucherDTO;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [page, setPage] = React.useState(1);
  const meta = statusMeta(voucher.status);

  const redemptionsQuery = useQuery({
    queryKey: ["voucher-redemptions", voucher.id, page],
    queryFn: () =>
      api<VoucherRedemptionResult>(
        `/api/admin/vouchers/${voucher.id}/redemptions?page=${page}&pageSize=10`
      ),
  });

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 font-mono text-lg tracking-wider">
                {voucher.code}
                <PillBadge variant={meta.variant}>{meta.label}</PillBadge>
              </SheetTitle>
              <SheetDescription>
                {voucher.description || "Tanpa deskripsi internal"}
              </SheetDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={onEdit}
            >
              <Pencil className="mr-1.5 size-3.5" />
              Edit
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
              <div className="text-text-muted">Diskon</div>
              <div className="mt-1 font-semibold text-text-strong">
                {voucher.type === "PERCENT"
                  ? `${voucher.value}% · maks ${formatRupiah(voucher.maxDiscount ?? 0)}`
                  : formatRupiah(voucher.value)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
              <div className="text-text-muted">Min. belanja</div>
              <div className="mt-1 font-semibold text-text-strong">
                {voucher.minSpend > 0
                  ? formatRupiah(voucher.minSpend)
                  : "Tanpa minimum"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
              <div className="text-text-muted">Kuota</div>
              <div className="mt-1 font-semibold text-text-strong">
                {voucher.usedCount}/{voucher.quota ?? "∞"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-muted/50 p-3">
              <div className="text-text-muted">Sisa</div>
              <div className="mt-1 font-semibold text-text-strong">
                {voucher.quota === null
                  ? "Tanpa batas"
                  : Math.max(0, voucher.quota - voucher.usedCount)}
              </div>
            </div>
            <div className="col-span-2 rounded-xl border border-border bg-surface-muted/50 p-3">
              <div className="text-text-muted">Periode (WIB)</div>
              <div className="mt-1 font-semibold text-text-strong">
                {formatWIB(voucher.startsAt)} – {formatWIB(voucher.endsAt)}
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-strong">
              Riwayat Pemakaian
            </h3>
            {redemptionsQuery.isLoading ? (
              <p className="py-6 text-center text-xs text-text-muted">
                Memuat riwayat...
              </p>
            ) : redemptionsQuery.isError ? (
              <EmptyState
                title="Gagal memuat riwayat"
                description={(redemptionsQuery.error as Error).message}
              />
            ) : redemptionsQuery.data?.items.length === 0 ? (
              <EmptyState
                icon={TicketPercent}
                title="Belum pernah dipakai"
                description="Riwayat akan muncul setelah customer memakai kode ini."
              />
            ) : (
              <>
                <div className="rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Meja</TableHead>
                        <TableHead>Diskon</TableHead>
                        <TableHead>Waktu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {redemptionsQuery.data?.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-[11px]">
                            {item.orderCode}
                            {item.releasedAt && (
                              <span className="ml-1 text-[10px] text-destructive">
                                dilepas
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.tableName}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatRupiah(item.discountAmount)}
                          </TableCell>
                          <TableCell className="text-[11px] text-text-muted">
                            {formatWIB(item.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
                  <span>
                    {redemptionsQuery.data?.meta.total ?? 0} pemakaian
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Halaman sebelumnya"
                      disabled={page <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <span>
                      {page}/{redemptionsQuery.data?.meta.totalPages ?? 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Halaman berikutnya"
                      disabled={
                        page >= (redemptionsQuery.data?.meta.totalPages ?? 1)
                      }
                      onClick={() => setPage((prev) => prev + 1)}
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
