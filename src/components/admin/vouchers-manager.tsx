"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  TicketPercent,
  Trash2,
  Eye,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionCard } from "@/components/admin/section-card";
import { StatCard } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/admin/empty-state";
import { PillBadge, type PillVariant } from "@/components/admin/pill-badge";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { VoucherDialog } from "@/components/admin/voucher-dialog";
import { VoucherDetail } from "@/components/admin/voucher-detail";
import { apiErrorMessage } from "@/lib/api-error";
import { formatRupiah, formatWIB } from "@/lib/utils";
import type {
  VoucherDTO,
  VoucherListResult,
  VoucherStatus,
} from "@/types/voucher";

type StatusFilter =
  | "all"
  | "active"
  | "scheduled"
  | "expired"
  | "exhausted"
  | "inactive";

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Aktif" },
  { value: "scheduled", label: "Terjadwal" },
  { value: "expired", label: "Berakhir" },
  { value: "exhausted", label: "Habis" },
  { value: "inactive", label: "Nonaktif" },
];

const statusMeta: Record<
  VoucherStatus,
  { label: string; variant: PillVariant }
> = {
  AKTIF: { label: "Aktif", variant: "success" },
  TERJADWAL: { label: "Terjadwal", variant: "info" },
  HABIS: { label: "Habis", variant: "warning" },
  BERAKHIR: { label: "Berakhir", variant: "neutral" },
  NONAKTIF: { label: "Nonaktif", variant: "danger" },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json, "Permintaan gagal"));
  return json as T;
}

function discountLabel(voucher: VoucherDTO): string {
  if (voucher.type === "PERCENT") {
    return `${voucher.value}% maks ${formatRupiah(voucher.maxDiscount ?? 0)}`;
  }
  return formatRupiah(voucher.value);
}

export function AdminVouchersPage({
  initialData,
}: {
  initialData: VoucherListResult;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<
    "newest" | "most_used" | "ending_soon"
  >("newest");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const [dialog, setDialog] = React.useState<
    | { mode: "create" }
    | { mode: "edit"; voucher: VoucherDTO }
    | { mode: "duplicate"; voucher: VoucherDTO }
    | null
  >(null);
  const [detail, setDetail] = React.useState<VoucherDTO | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<VoucherDTO | null>(
    null
  );
  const [pendingToggle, setPendingToggle] = React.useState<VoucherDTO | null>(
    null
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ["vouchers", debouncedSearch, status, sort, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({
        status,
        sort,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      return api<VoucherListResult>(`/api/admin/vouchers?${params}`);
    },
    initialData:
      debouncedSearch === "" && status === "all" && sort === "newest" && page === 1 && pageSize === 10
        ? initialData
        : undefined,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["vouchers"] });

  const toggleMutation = useMutation({
    mutationFn: (voucher: VoucherDTO) =>
      api(`/api/admin/vouchers/${voucher.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !voucher.isActive }),
      }),
    onSuccess: (_data, voucher) => {
      toast.success(
        voucher.isActive ? "Voucher dinonaktifkan" : "Voucher diaktifkan"
      );
      setPendingToggle(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (voucher: VoucherDTO) =>
      api(`/api/admin/vouchers/${voucher.id}`, { method: "DELETE" }),
    onSuccess: (_data, voucher) => {
      toast.success(`Voucher "${voucher.code}" dihapus`);
      setPendingDelete(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Kode voucher disalin");
    } catch {
      toast.error("Gagal menyalin kode");
    }
  };

  const data = query.data;
  const tabs = statusTabs;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Voucher Aktif"
          value={data?.stats.activeCount ?? 0}
          icon={TicketPercent}
          variant="indigo"
        />
        <StatCard
          title="Pemakaian Bulan Ini"
          value={data?.stats.monthRedemptions ?? 0}
          icon={TicketPercent}
          variant="blue"
        />
        <StatCard
          title="Total Diskon Bulan Ini"
          value={formatRupiah(data?.stats.monthDiscount ?? 0)}
          icon={TicketPercent}
          variant="green"
        />
        <StatCard
          title="Akan Berakhir"
          value={data?.stats.expiringSoon ?? 0}
          icon={TicketPercent}
          variant="lemon"
        />
      </div>

      <SectionCard
        title="Voucher Diskon"
        subtitle="Kelola kode promo, kuota, dan masa berlaku."
        action={
          <Button
            size="sm"
            className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="size-4" />
            Tambah Voucher
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                  className={
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                    (status === tab.value
                      ? "bg-primary-600 text-white"
                      : "text-text-muted hover:bg-surface-muted")
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kode atau deskripsi"
                  aria-label="Cari voucher"
                  className="h-9 w-56 rounded-xl pl-8 text-xs"
                />
              </div>
              <Select
                value={sort}
                onValueChange={(value) => {
                  setSort(value as typeof sort);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-44 rounded-xl text-xs">
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Terbaru</SelectItem>
                  <SelectItem value="most_used">Paling banyak dipakai</SelectItem>
                  <SelectItem value="ending_soon">Berakhir terdekat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {query.isLoading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : query.isError ? (
            <EmptyState
              title="Gagal memuat voucher"
              description={(query.error as Error).message}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => query.refetch()}
                >
                  Coba lagi
                </Button>
              }
            />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={TicketPercent}
              title={
                debouncedSearch || status !== "all"
                  ? "Tidak ada voucher yang cocok"
                  : "Belum ada voucher"
              }
              description={
                debouncedSearch || status !== "all"
                  ? "Ubah kata kunci atau filter status."
                  : "Buat voucher pertama untuk memberi potongan harga ke pelanggan."
              }
            />
          ) : (
            <>
              <div className="rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Diskon</TableHead>
                      <TableHead>Min. Belanja</TableHead>
                      <TableHead>Kuota</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dipakai</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((voucher) => {
                      const meta = statusMeta[voucher.status];
                      return (
                        <TableRow key={voucher.id}>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => copyCode(voucher.code)}
                              className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-text-strong hover:text-primary-700"
                              title="Salin kode"
                            >
                              {voucher.code}
                              <Copy className="size-3 text-text-muted" />
                            </button>
                            {voucher.description && (
                              <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-text-muted">
                                {voucher.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {discountLabel(voucher)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {voucher.minSpend > 0
                              ? formatRupiah(voucher.minSpend)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {voucher.usedCount}/{voucher.quota ?? "∞"}
                          </TableCell>
                          <TableCell className="text-[11px] text-text-muted">
                            {formatWIB(voucher.startsAt, "date")} -{" "}
                            {formatWIB(voucher.endsAt, "date")}
                          </TableCell>
                          <TableCell>
                            <PillBadge variant={meta.variant}>
                              {meta.label}
                            </PillBadge>
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {voucher.usedCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="inline-flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-muted"
                                aria-label={`Aksi voucher ${voucher.code}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => setDetail(voucher)}
                                  className="rounded-lg text-xs"
                                >
                                  <Eye className="mr-2 size-3.5" />
                                  Detail
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setDialog({ mode: "edit", voucher })
                                  }
                                  className="rounded-lg text-xs"
                                >
                                  <Pencil className="mr-2 size-3.5" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setDialog({ mode: "duplicate", voucher })
                                  }
                                  className="rounded-lg text-xs"
                                >
                                  <Copy className="mr-2 size-3.5" />
                                  Duplikat
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setPendingToggle(voucher)}
                                  className="rounded-lg text-xs"
                                >
                                  <Power className="mr-2 size-3.5" />
                                  {voucher.isActive ? "Nonaktifkan" : "Aktifkan"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setPendingDelete(voucher)}
                                  className="rounded-lg text-xs"
                                >
                                  <Trash2 className="mr-2 size-3.5" />
                                  Hapus
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-text-muted">
                <div className="flex items-center gap-2">
                  <span>{data.meta.total} voucher</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-28 rounded-lg text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 / halaman</SelectItem>
                      <SelectItem value="20">20 / halaman</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-[11px]"
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  >
                    Sebelumnya
                  </Button>
                  <span className="tabular-nums">
                    {data.meta.page}/{data.meta.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-[11px]"
                    disabled={page >= data.meta.totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {dialog && (
        <VoucherDialog
          voucher={dialog.mode === "edit" ? dialog.voucher : null}
          template={dialog.mode === "duplicate" ? dialog.voucher : null}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {detail && (
        <VoucherDetail
          voucher={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDialog({ mode: "edit", voucher: detail });
            setDetail(null);
          }}
        />
      )}

      <AlertDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open && !toggleMutation.isPending) setPendingToggle(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.isActive
                ? "Nonaktifkan voucher ini?"
                : "Aktifkan voucher ini?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle?.isActive
                ? "Customer tidak dapat memakai kode ini sampai diaktifkan kembali. Riwayat pemakaian tetap tersimpan."
                : "Customer dapat memakai kode ini lagi bila masih dalam periode dan kuota tersedia."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-xl"
              disabled={toggleMutation.isPending}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              disabled={toggleMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingToggle) toggleMutation.mutate(pendingToggle);
              }}
            >
              {toggleMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {pendingToggle?.isActive ? "Nonaktifkan" : "Aktifkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Voucher{" "}
              <strong className="text-text-strong">{pendingDelete?.code}</strong>{" "}
              akan dihapus permanen. Voucher yang sudah punya riwayat pemakaian
              tidak dapat dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-xl"
              disabled={deleteMutation.isPending}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
              }}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
