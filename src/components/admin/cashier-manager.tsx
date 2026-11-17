"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  Users,
  X,
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
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { formatWIB, relativeTime } from "@/lib/utils";
import { CashierCreateInput, cashierCreateSchema } from "@/lib/validators/cashier";

interface CashierDTO {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  approvedCount: number;
  rejectedCount: number;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Permintaan gagal");
  return json as T;
}

function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function copyPassword(password: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(password);
    toast.success("Password disalin ke clipboard");
  } catch {
    toast.error("Gagal menyalin otomatis. Salin password secara manual.");
  }
}

export function CashierManager() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<
    | { mode: "create" }
    | { mode: "edit"; cashier: CashierDTO }
    | { mode: "reset"; cashier: CashierDTO }
    | null
  >(null);

  const cashiersQuery = useQuery({
    queryKey: ["cashiers"],
    queryFn: () => api<{ data: CashierDTO[] }>("/api/admin/cashiers"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cashiers"] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/cashiers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["cashiers"] });
      const previous = queryClient.getQueryData<{ data: CashierDTO[] }>(["cashiers"]);
      queryClient.setQueryData<{ data: CashierDTO[] }>(["cashiers"], (old) =>
        old
          ? { data: old.data.map((c) => (c.id === id ? { ...c, isActive } : c)) }
          : old
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["cashiers"], context.previous);
      }
      toast.error(err.message);
    },
    onSuccess: (_data, variables) =>
      toast.success(
        variables.isActive ? "Kasir diaktifkan kembali" : "Kasir dinonaktifkan, sesinya diputus"
      ),
    onSettled: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ mode: "soft" | "hard" }>(`/api/admin/cashiers/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      toast.success(
        result.mode === "soft"
          ? "Kasir punya riwayat verifikasi, jadi hanya dinonaktifkan"
          : "Akun kasir dihapus permanen"
      );
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cashiers = cashiersQuery.data?.data ?? [];
  const activeCount = cashiers.filter((c) => c.isActive).length;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Manajemen Akun Kasir"
        subtitle="Kelola staf kasir yang berhak login ke sistem dan memverifikasi pembayaran pesanan meja."
        action={
          <Button
            size="sm"
            className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="size-4" />
            Tambah Kasir
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <PillBadge variant="success">
              <UserCheck className="size-3.5" />
              {activeCount} kasir aktif
            </PillBadge>
            <PillBadge variant="neutral">
              <Users className="size-3.5" />
              {cashiers.length} akun terdaftar
            </PillBadge>
          </div>

          {cashiersQuery.isLoading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : cashiersQuery.isError ? (
            <EmptyState
              title="Gagal memuat daftar kasir"
              description={(cashiersQuery.error as Error).message}
            />
          ) : cashiers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Belum ada akun kasir"
              description="Tambahkan kasir pertama agar staf dapat memverifikasi pembayaran."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-surface-muted text-left text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Kasir</th>
                    <th className="px-4 py-3 font-medium text-center">Status</th>
                    <th className="px-4 py-3 font-medium">Verifikasi</th>
                    <th className="px-4 py-3 font-medium">Login Terakhir</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {cashiers.map((cashier) => (
                    <tr key={cashier.id} className="border-t border-border/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-9 shrink-0 rounded-full bg-primary-50 text-primary-800 flex items-center justify-center text-xs font-bold uppercase">
                            {cashier.name.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-text-strong truncate">
                              {cashier.name}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              @{cashier.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={cashier.isActive}
                            aria-label={`Status akun ${cashier.name}`}
                            onCheckedChange={(checked) => {
                              if (
                                !checked &&
                                !confirm(
                                  `Nonaktifkan akun ${cashier.name}? Sesi aktifnya akan langsung berakhir.`
                                )
                              ) {
                                return;
                              }
                              toggleMutation.mutate({ id: cashier.id, isActive: checked });
                            }}
                          />
                          <span className="text-[11px] text-text-muted w-16">
                            {cashier.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          <span
                            className="inline-flex items-center gap-1 text-[#0E8F66]"
                            title={`${cashier.approvedCount} pembayaran disetujui`}
                          >
                            <Check className="size-3.5" />
                            {cashier.approvedCount}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 text-[#C22F35]"
                            title={`${cashier.rejectedCount} pembayaran ditolak`}
                          >
                            <X className="size-3.5" />
                            {cashier.rejectedCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {cashier.lastLoginAt ? (
                          <span title={formatWIB(cashier.lastLoginAt)}>
                            {relativeTime(cashier.lastLoginAt)}
                          </span>
                        ) : (
                          "Belum pernah login"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-lg"
                            aria-label={`Ubah nama ${cashier.name}`}
                            onClick={() => setDialog({ mode: "edit", cashier })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-lg"
                            aria-label={`Reset password ${cashier.name}`}
                            onClick={() => setDialog({ mode: "reset", cashier })}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-lg text-destructive hover:bg-destructive/10"
                            aria-label={`Hapus ${cashier.name}`}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Hapus akun ${cashier.name}? Bila kasir sudah punya riwayat verifikasi, akun hanya akan dinonaktifkan.`
                                )
                              ) {
                                deleteMutation.mutate(cashier.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      {dialog?.mode === "create" && (
        <CreateCashierDialog
          onClose={() => setDialog(null)}
          onCreated={refresh}
        />
      )}

      {dialog?.mode === "edit" && (
        <EditCashierDialog
          key={dialog.cashier.id}
          cashier={dialog.cashier}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {dialog?.mode === "reset" && (
        <ResetPasswordDialog
          key={dialog.cashier.id}
          cashier={dialog.cashier}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function CreateCashierDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const form = useForm<CashierCreateInput>({
    resolver: zodResolver(cashierCreateSchema),
    defaultValues: { name: "", username: "", password: "" },
  });

  const password = useWatch({ control: form.control, name: "password" });

  const mutation = useMutation({
    mutationFn: (values: CashierCreateInput) =>
      api("/api/admin/cashiers", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => {
      toast.success("Kasir berhasil ditambahkan");
      onCreated();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Tambah Kasir</DialogTitle>
          <DialogDescription>
            Berikan username dan password kepada staf. Password hanya ditampilkan sekali di dialog ini.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="cashier-name" className="text-xs font-semibold">
              Nama Kasir
            </Label>
            <Input id="cashier-name" {...form.register("name")} className="rounded-xl h-10" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cashier-username" className="text-xs font-semibold">
              Username
            </Label>
            <Input
              id="cashier-username"
              autoComplete="off"
              {...form.register("username")}
              className="rounded-xl h-10"
            />
            {form.formState.errors.username && (
              <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cashier-password" className="text-xs font-semibold">
              Password
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="cashier-password"
                type="text"
                autoComplete="new-password"
                {...form.register("password")}
                className="rounded-xl h-10 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                aria-label="Buat password acak"
                title="Buat password acak"
                onClick={() =>
                  form.setValue("password", generatePassword(), { shouldValidate: true })
                }
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                aria-label="Salin password"
                title="Salin password"
                disabled={!password}
                onClick={() => copyPassword(password)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
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
              Simpan Kasir
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCashierDialog({
  cashier,
  onClose,
  onSaved,
}: {
  cashier: CashierDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(cashier.name);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/cashiers/${cashier.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      toast.success("Nama kasir diperbarui");
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Ubah Data Kasir</DialogTitle>
          <DialogDescription>Username @{cashier.username} tidak dapat diubah.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              toast.error("Nama kasir wajib diisi");
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-cashier-name" className="text-xs font-semibold">
              Nama Kasir
            </Label>
            <Input
              id="edit-cashier-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-xl h-10"
            />
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

function ResetPasswordDialog({
  cashier,
  onClose,
  onSaved,
}: {
  cashier: CashierDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = React.useState(() => generatePassword());
  const [copied, setCopied] = React.useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/cashiers/${cashier.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      toast.success("Password diperbarui. Sesi aktif kasir telah diputus.");
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Reset Password Kasir</DialogTitle>
          <DialogDescription>
            Password baru untuk {cashier.name} (@{cashier.username}). Salin sekarang — password tidak
            dapat ditampilkan lagi setelah dialog ditutup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password" className="text-xs font-semibold">
              Password Baru
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="reset-password"
                type="text"
                readOnly
                value={password}
                className="rounded-xl h-10 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                aria-label="Buat password acak baru"
                title="Buat password acak baru"
                onClick={() => {
                  setPassword(generatePassword());
                  setCopied(false);
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                aria-label="Salin password"
                title="Salin password"
                onClick={async () => {
                  await copyPassword(password);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-text-muted">
              Minimal 8 karakter. Kasir wajib login ulang setelah password direset.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || password.length < 8}
              onClick={() => mutation.mutate()}
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
            >
              {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Terapkan Password
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
