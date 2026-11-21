"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/admin/empty-state";
import { PillBadge } from "@/components/admin/pill-badge";
import { ImageUploader } from "@/components/image-uploader";

type PaymentMethod = {
  id: string;
  kind: "QRIS" | "BANK";
  label: string;
  accountNo: string | null;
  accountName: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

type Draft = {
  id: string | null;
  kind: "QRIS" | "BANK";
  label: string;
  accountNo: string;
  accountName: string;
  imageKey: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  kind: "QRIS",
  label: "",
  accountNo: "",
  accountName: "",
  imageKey: null,
  imageUrl: null,
  isActive: true,
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

export function PaymentMethodsManager() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<Draft | null>(null);

  const methodsQuery = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api<{ data: PaymentMethod[] }>("/api/admin/payment-methods"),
  });

  const methods = methodsQuery.data?.data ?? [];
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["payment-methods"] });

  const saveMutation = useMutation({
    mutationFn: (value: Draft) => {
      const label = value.label.trim();
      const accountName = value.accountName.trim();

      if (value.id) {
        const payload: Record<string, unknown> = {
          label,
          isActive: value.isActive,
        };
        if (accountName) payload.accountName = accountName;
        if (value.kind === "QRIS") payload.imageKey = value.imageKey;
        else payload.accountNo = value.accountNo.trim();
        return api(`/api/admin/payment-methods/${value.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      const payload =
        value.kind === "QRIS"
          ? {
              kind: "QRIS" as const,
              label,
              isActive: value.isActive,
              imageKey: value.imageKey,
              accountName: accountName || null,
            }
          : {
              kind: "BANK" as const,
              label,
              isActive: value.isActive,
              accountNo: value.accountNo.trim(),
              accountName,
            };
      return api("/api/admin/payment-methods", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (_data, value) => {
      toast.success(
        value.id ? "Metode pembayaran diperbarui" : "Metode pembayaran ditambahkan"
      );
      setDraft(null);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/payment-methods/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: refresh,
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (method: PaymentMethod) =>
      api(`/api/admin/payment-methods/${method.id}`, { method: "DELETE" }),
    onSuccess: (_data, method) => {
      toast.success(`Metode "${method.label}" dihapus`);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api("/api/admin/payment-methods/reorder", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: refresh,
    onError: (err: Error) => toast.error(err.message),
  });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= methods.length) return;
    const ids = methods.map((method) => method.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderMutation.mutate(ids);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;

    if (!draft.label.trim()) {
      toast.error("Label wajib diisi");
      return;
    }

    if (draft.kind === "BANK") {
      const accountNo = draft.accountNo.trim();
      if (accountNo.length < 4) {
        toast.error("Nomor rekening minimal 4 karakter");
        return;
      }
      if (!/^[0-9 -]+$/.test(accountNo)) {
        toast.error("Nomor rekening hanya boleh angka, spasi, atau strip");
        return;
      }
      if (!draft.accountName.trim()) {
        toast.error("Atas nama wajib diisi");
        return;
      }
    }

    saveMutation.mutate(draft);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-text-strong">
            Metode Pembayaran
          </h4>
          <p className="text-[11px] text-text-muted">
            Tampil di halaman pembayaran customer. Urutan di sini menentukan
            urutan tampil.
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5"
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
        >
          <Plus className="size-4" />
          Tambah Metode
        </Button>
      </div>

      {methodsQuery.isLoading ? (
        <div className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm text-text-muted">
          <Loader2 className="size-4 animate-spin" />
          Memuat metode pembayaran...
        </div>
      ) : methodsQuery.isError ? (
        <EmptyState
          title="Gagal memuat metode pembayaran"
          description={(methodsQuery.error as Error).message}
        />
      ) : methods.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="Belum ada metode pembayaran"
          description="Tambahkan QRIS atau rekening bank agar customer bisa membayar."
          action={
            <Button
              size="sm"
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
            >
              <Plus className="size-4" />
              Tambah Metode
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {methods.map((method, index) => (
            <div
              key={method.id}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              {method.kind === "QRIS" ? (
                method.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- gambar QRIS dari R2
                  <img
                    src={method.imageUrl}
                    alt={`QRIS ${method.label}`}
                    className="size-12 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
                  />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-text-muted">
                    <QrCode className="size-5" />
                  </span>
                )
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-text-muted">
                  <Landmark className="size-5" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text-strong">
                    {method.label}
                  </span>
                  <PillBadge variant={method.kind === "QRIS" ? "info" : "primary"}>
                    {method.kind === "QRIS" ? "QRIS" : "Transfer Bank"}
                  </PillBadge>
                  {!method.isActive && (
                    <PillBadge variant="neutral">Nonaktif</PillBadge>
                  )}
                </div>
                <p className="truncate text-[11px] text-text-muted">
                  {method.kind === "QRIS"
                    ? method.accountName || "Pembayaran via QRIS"
                    : `${method.accountNo ?? "-"} · ${method.accountName ?? "-"}`}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Naikkan ${method.label}`}
                  title="Naikkan urutan"
                  disabled={index === 0 || reorderMutation.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Turunkan ${method.label}`}
                  title="Turunkan urutan"
                  disabled={index === methods.length - 1 || reorderMutation.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Switch
                  checked={method.isActive}
                  disabled={
                    toggleMutation.isPending &&
                    toggleMutation.variables?.id === method.id
                  }
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: method.id, isActive: checked })
                  }
                  aria-label={`Aktifkan ${method.label}`}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${method.label}`}
                  title="Edit"
                  onClick={() =>
                    setDraft({
                      id: method.id,
                      kind: method.kind,
                      label: method.label,
                      accountNo: method.accountNo ?? "",
                      accountName: method.accountName ?? "",
                      imageKey: method.imageKey,
                      imageUrl: method.imageUrl,
                      isActive: method.isActive,
                    })
                  }
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hapus ${method.label}`}
                  title="Hapus"
                  className="text-destructive hover:text-destructive"
                  disabled={
                    deleteMutation.isPending &&
                    deleteMutation.variables?.id === method.id
                  }
                  onClick={() => {
                    if (
                      confirm(
                        `Hapus metode pembayaran "${method.label}"? Tindakan ini tidak bisa dibatalkan.`
                      )
                    ) {
                      deleteMutation.mutate(method);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-2xl">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {draft.id ? "Edit Metode Pembayaran" : "Tambah Metode Pembayaran"}
                </DialogTitle>
                <DialogDescription>
                  Metode aktif akan tampil di halaman pembayaran customer.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Jenis</Label>
                  {draft.id ? (
                    <Input
                      value={draft.kind === "QRIS" ? "QRIS" : "Transfer Bank"}
                      disabled
                      className="rounded-xl h-10"
                    />
                  ) : (
                    <Select
                      value={draft.kind}
                      onValueChange={(value) =>
                        setDraft({
                          ...draft,
                          kind: (value as Draft["kind"]) ?? "QRIS",
                        })
                      }
                    >
                      <SelectTrigger className="rounded-xl h-10 w-full">
                        <SelectValue placeholder="Pilih jenis" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QRIS">QRIS</SelectItem>
                        <SelectItem value="BANK">Transfer Bank</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payment-label" className="text-xs font-semibold">
                    Label
                  </Label>
                  <Input
                    id="payment-label"
                    value={draft.label}
                    maxLength={80}
                    onChange={(event) =>
                      setDraft({ ...draft, label: event.target.value })
                    }
                    placeholder={
                      draft.kind === "QRIS" ? "QRIS Utama" : "Bank BCA"
                    }
                    className="rounded-xl h-10"
                  />
                </div>

                {draft.kind === "QRIS" ? (
                  <>
                    <ImageUploader
                      preset="qris"
                      label="Gambar QRIS"
                      value={draft.imageUrl}
                      onChange={(url, key) =>
                        setDraft({
                          ...draft,
                          imageUrl: url || null,
                          imageKey: key || null,
                        })
                      }
                    />
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="payment-account-name"
                        className="text-xs font-semibold"
                      >
                        Atas Nama (opsional)
                      </Label>
                      <Input
                        id="payment-account-name"
                        value={draft.accountName}
                        maxLength={80}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            accountName: event.target.value,
                          })
                        }
                        placeholder="Nama pemilik QRIS"
                        className="rounded-xl h-10"
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="payment-account-no"
                        className="text-xs font-semibold"
                      >
                        Nomor Rekening
                      </Label>
                      <Input
                        id="payment-account-no"
                        value={draft.accountNo}
                        maxLength={30}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            accountNo: event.target.value,
                          })
                        }
                        placeholder="1234567890"
                        className="rounded-xl h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="payment-account-owner"
                        className="text-xs font-semibold"
                      >
                        Atas Nama
                      </Label>
                      <Input
                        id="payment-account-owner"
                        value={draft.accountName}
                        maxLength={80}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            accountName: event.target.value,
                          })
                        }
                        placeholder="Nama pemilik rekening"
                        className="rounded-xl h-10"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="text-xs font-semibold">Aktif</p>
                    <p className="text-[11px] text-text-muted">
                      Nonaktifkan untuk menyembunyikan metode ini dari customer.
                    </p>
                  </div>
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(checked) =>
                      setDraft({ ...draft, isActive: checked })
                    }
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setDraft(null)}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
                  >
                    {saveMutation.isPending && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Simpan
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
