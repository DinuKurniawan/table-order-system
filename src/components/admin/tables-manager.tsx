"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  X,
  Copy,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { tableInputSchema, tableUpdateSchema, TableUpdateInput } from "@/lib/validators/table";
import { SectionCard } from "@/components/admin/section-card";
import { formatWIB, relativeTime } from "@/lib/utils";
import { TableSkeleton } from "@/components/admin/table-skeleton";

type TableRow = {
  id: string;
  name: string;
  area: string | null;
  token: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt?: string | null;
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

export function AdminTablesPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<
    | { mode: "create" }
    | { mode: "edit"; table: TableRow }
    | null
>(null);

  const tablesQuery = useQuery({
    queryKey: ["tables"],
    queryFn: () => api<{ data: TableRow[] }>("/api/admin/tables"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tables"] });

  const deleteMutation = useMutation({
    mutationFn: (table: TableRow) =>
      api(`/api/admin/tables/${table.id}`, { method: "DELETE" }),
    onSuccess: (_data, table) => {
      toast.success(`Meja "${table.name}" dihapus`);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Meja & Barcode QR Code"
        subtitle="Kelola nomor meja kafe, cetak lembar stiker QR, dan pantau status meja yang sedang aktif terisi."
        action={
          <Button
            size="sm"
            className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="size-4" />
            Tambah Meja
          </Button>
        }
      >
        <div className="space-y-4">
          {tablesQuery.isLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : tablesQuery.isError ? (
            <EmptyState
              title="Gagal memuat daftar meja"
              description={(tablesQuery.error as Error).message}
            />
          ) : tablesQuery.data?.data.length === 0 ? (
            <EmptyState
              icon={Eye}
              title="Belum ada meja"
              description="Tambahkan meja pertama agar customer dapat memesan via QR."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {tablesQuery.data?.data.map((table) => {
                return (
                  <section
                    key={table.id}
                    className="rounded-2xl border border-border bg-surface p-4 flex flex-col min-h-[200px] transition-all hover:shadow-lg hover:shadow-border/30"
                  >
                    <div className="flex justify-center mb-3 min-h-[120px]">
                      {/* QR dirender per-request oleh route handler; next/image tidak relevan. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/tables/${table.id}/qr?format=svg`}
                        alt={`QR Meja ${table.name}`}
                        className="size-full object-contain"
                        loading="lazy"
                      />
                    </div>

                    <div className="flex-1 flex flex-col">
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="font-semibold text-text-strong truncate line-clamp-1">
                          {table.name}
                        </span>
                        <span className="text-[10px] text-text-muted">{table.token}</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>
                          {table.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                        {table.lastSeenAt && (
                          <span title={formatWIB(table.lastSeenAt)}>
                            {relativeTime(table.lastSeenAt)}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex gap-1.5 pt-2">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Nonaktifkan meja"
                          title="Nonaktifkan meja"
                          onClick={() => {
                            if (confirm(`Nonaktifkan meja "${table.name}"? Sesi kasir dan customer akan langsung terputus.`)) {
                              // Toggle status meja
                            }
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Unduh QR PNG"
                          title="Unduh QR PNG"
                          onClick={() => window.open(`/api/admin/tables/${table.id}/qr?format=png&download=1`, "_blank")}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Unduh QR SVG"
                          title="Unduh QR SVG"
                          onClick={() => window.open(`/api/admin/tables/${table.id}/qr?format=svg&download=1`, "_blank")}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Hapus meja"
                          title="Hapus meja & barcode"
                          disabled={deleteMutation.isPending && deleteMutation.variables?.id === table.id}
                          className="ml-auto text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Hapus meja "${table.name}"? Barcode/QR meja ini langsung tidak berlaku dan tidak bisa dikembalikan.`)) {
                              deleteMutation.mutate(table);
                            }
                          }}
                        >
                          {deleteMutation.isPending && deleteMutation.variables?.id === table.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {dialog?.mode === "create" && (
        <CreateTableDialog onClose={() => setDialog(null)} onCreated={refresh} />
      )}

      {dialog?.mode === "edit" && (
        <EditTableDialog
          key={dialog.table.id}
          table={dialog.table}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function CreateTableDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(tableInputSchema),
    defaultValues: { name: "", area: "", isActive: true },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof tableInputSchema>) =>
      api("/api/admin/tables", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => {
      toast.success("Meja berhasil ditambahkan");
      onCreated();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Tambah Meja</DialogTitle>
          <DialogDescription>
            Berikan nama meja (contoh: &ldquo;Meja 1&rdquo;) dan area opsional.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="table-name" className="text-xs font-semibold">
              Nama Meja
            </Label>
            <Input
              id="table-name"
              autoComplete="off"
              {...form.register("name")}
              className="rounded-xl h-10"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="table-area" className="text-xs font-semibold">
              Area (Opsional)
            </Label>
            <Input
              id="table-area"
              autoComplete="off"
              {...form.register("area")}
              className="rounded-xl h-10"
            />
            {form.formState.errors.area && (
              <p className="text-xs text-destructive">{form.formState.errors.area.message}</p>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <Switch
              checked={true}
              disabled={true}
              className="rounded-xl h-5 w-11"
              defaultChecked
            />
            <span className="text-[11px] text-text-muted">
              Aktif secara default
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
            >
              {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan Meja
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTableDialog({
  table,
  onClose,
  onSaved,
}: {
  table: TableRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<TableUpdateInput>({
    resolver: zodResolver(tableUpdateSchema),
    defaultValues: {
      name: table.name,
      area: table.area || "",
      isActive: table.isActive,
    },
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/tables/${table.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: form.getValues().name, area: form.getValues().area, isActive: form.getValues().isActive }),
      }),
    onSuccess: () => {
      toast.success("Data meja diperbarui");
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Ubah Data Meja</DialogTitle>
          <DialogDescription>Nama meja unik, area opsional.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-table-name" className="text-xs font-semibold">
              Nama Meja
            </Label>
            <Input
              id="edit-table-name"
              value={form.getValues().name}
              onChange={(e) => form.setValue("name", e.target.value)}
              className="rounded-xl h-10"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-table-area" className="text-xs font-semibold">
              Area
            </Label>
            <Input
              id="edit-table-area"
              value={form.getValues().area || ""}
              onChange={(e) => form.setValue("area", e.target.value)}
              className="rounded-xl h-10"
            />
            {form.formState.errors.area && (
              <p className="text-xs text-destructive">{form.formState.errors.area.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
            >
              {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}