"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/zod";
import { toast } from "sonner";
import {
  Activity,
  ExternalLink,
  KeyRound,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/admin/section-card";
import { EmptyState } from "@/components/admin/empty-state";
import { PillBadge } from "@/components/admin/pill-badge";
import { ImageUploader } from "@/components/image-uploader";
import { PaymentMethodsManager } from "@/components/admin/payment-methods-manager";

type Settings = {
  namaKafe?: string;
  timeoutBayarMenit?: number;
  maksUploadUlang?: number;
  footerStruk?: string;
  isOrderingOpen?: boolean;
  logoKey?: string | null;
  logoUrl?: string | null;
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

export function AdminSettingsPage() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ data: Settings }>("/api/admin/settings"),
  });

  if (settingsQuery.isLoading) {
    return (
      <SectionCard
        title="Pengaturan Kafe & Sistem"
        subtitle="Profil kafe, operasional, metode pembayaran, struk, dan diagnostik."
      >
        <div className="flex items-center gap-3 p-4 text-sm text-text-muted">
          <Loader2 className="size-4 animate-spin" />
          Memuat pengaturan...
        </div>
      </SectionCard>
    );
  }

  if (settingsQuery.isError) {
    return (
      <SectionCard
        title="Pengaturan Kafe & Sistem"
        subtitle="Profil kafe, operasional, metode pembayaran, struk, dan diagnostik."
      >
        <EmptyState
          title="Gagal memuat pengaturan"
          description={(settingsQuery.error as Error).message}
        />
      </SectionCard>
    );
  }

  const settings = settingsQuery.data?.data ?? {};

  return (
    <div className="space-y-6">
      <SectionCard
        title="Pengaturan Kafe & Sistem"
        subtitle="Profil kafe, operasional, metode pembayaran, struk, dan diagnostik."
      >
        <Tabs defaultValue="umum">
          <TabsList
            variant="line"
            className="w-full justify-start gap-1 overflow-x-auto border-b border-border"
          >
            <TabsTrigger value="umum" className="px-3">
              Umum
            </TabsTrigger>
            <TabsTrigger value="pembayaran" className="px-3">
              Pembayaran
            </TabsTrigger>
            <TabsTrigger value="struk" className="px-3">
              Struk
            </TabsTrigger>
            <TabsTrigger value="sistem" className="px-3">
              Sistem
            </TabsTrigger>
            <TabsTrigger value="keamanan" className="px-3">
              Keamanan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="umum" className="pt-5">
            <UmumForm settings={settings} />
          </TabsContent>
          <TabsContent value="pembayaran" className="pt-5">
            <PaymentMethodsManager />
          </TabsContent>
          <TabsContent value="struk" className="pt-5">
            <StrukForm settings={settings} />
          </TabsContent>
          <TabsContent value="sistem" className="pt-5">
            <SistemTab settings={settings} />
          </TabsContent>
          <TabsContent value="keamanan" className="pt-5">
            <SecurityTab />
          </TabsContent>
        </Tabs>
      </SectionCard>
    </div>
  );
}

const umumSchema = z.object({
  namaKafe: z.string().trim().min(1, "Nama kafe wajib diisi"),
  timeoutBayarMenit: z
    .number()
    .int()
    .min(1, "Minimal 1 menit")
    .max(120, "Maksimal 120 menit"),
  maksUploadUlang: z
    .number()
    .int()
    .min(1, "Minimal 1 kali")
    .max(10, "Maksimal 10 kali"),
  isOrderingOpen: z.boolean(),
});

type UmumValues = z.infer<typeof umumSchema>;

function UmumForm({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const [logoKey, setLogoKey] = React.useState<string | null>(
    settings.logoKey ?? null
  );
  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    settings.logoUrl ?? null
  );

  const form = useForm<UmumValues>({
    resolver: zodResolver(umumSchema),
    defaultValues: {
      namaKafe: settings.namaKafe ?? "",
      timeoutBayarMenit: settings.timeoutBayarMenit ?? 15,
      maksUploadUlang: settings.maksUploadUlang ?? 3,
      isOrderingOpen: settings.isOrderingOpen !== false,
    },
  });

  const save = useMutation({
    mutationFn: (values: UmumValues) =>
      api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ ...values, logoKey }),
      }),
    onSuccess: () => {
      toast.success("Pengaturan umum disimpan");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const orderingOpen = useWatch({
    control: form.control,
    name: "isOrderingOpen",
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="space-y-5"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-nama-kafe" className="text-xs font-semibold">
              Nama Kafe
            </Label>
            <Input
              id="settings-nama-kafe"
              {...form.register("namaKafe")}
              className="rounded-xl h-10"
            />
            {form.formState.errors.namaKafe && (
              <p className="text-xs text-destructive">
                {form.formState.errors.namaKafe.message}
              </p>
            )}
            <p className="text-[11px] text-text-muted">
              Muncul di halaman menu customer, halaman pesanan, dan struk.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="settings-timeout-bayar"
                className="text-xs font-semibold"
              >
                Timeout Bayar (menit)
              </Label>
              <Input
                id="settings-timeout-bayar"
                type="number"
                min={1}
                max={120}
                {...form.register("timeoutBayarMenit", { valueAsNumber: true })}
                className="rounded-xl h-10"
              />
              {form.formState.errors.timeoutBayarMenit && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.timeoutBayarMenit.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="settings-maks-upload"
                className="text-xs font-semibold"
              >
                Maks Upload Ulang Bukti
              </Label>
              <Input
                id="settings-maks-upload"
                type="number"
                min={1}
                max={10}
                {...form.register("maksUploadUlang", { valueAsNumber: true })}
                className="rounded-xl h-10"
              />
              {form.formState.errors.maksUploadUlang && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.maksUploadUlang.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="text-xs font-semibold">Status Pemesanan</p>
              <p className="text-[11px] text-text-muted">
                Saat ditutup, customer tidak bisa checkout pesanan baru.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PillBadge variant={orderingOpen ? "success" : "danger"}>
                {orderingOpen ? "Buka" : "Tutup"}
              </PillBadge>
              <Switch
                aria-label="Status pemesanan dibuka"
                checked={orderingOpen}
                onCheckedChange={(checked) =>
                  form.setValue("isOrderingOpen", checked, {
                    shouldDirty: true,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <ImageUploader
            preset="logo"
            label="Logo Kafe (opsional)"
            value={logoUrl}
            onChange={(url, key) => {
              setLogoUrl(url || null);
              setLogoKey(key || null);
            }}
          />
          <p className="text-[11px] text-text-muted">
            Tampil di halaman menu customer dan struk. Kosongkan untuk memakai
            logo bawaan.
          </p>
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          type="submit"
          disabled={save.isPending}
          className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
        >
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Simpan Perubahan
        </Button>
      </div>
    </form>
  );
}

const strukSchema = z.object({
  footerStruk: z.string(),
});

type StrukValues = z.infer<typeof strukSchema>;

function StrukForm({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const form = useForm<StrukValues>({
    resolver: zodResolver(strukSchema),
    defaultValues: {
      footerStruk: settings.footerStruk ?? "",
    },
  });

  const save = useMutation({
    mutationFn: (values: StrukValues) =>
      api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast.success("Pengaturan struk disimpan");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const footer = useWatch({
    control: form.control,
    name: "footerStruk",
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="settings-footer-struk" className="text-xs font-semibold">
            Footer Struk
          </Label>
          <Textarea
            id="settings-footer-struk"
            rows={3}
            maxLength={300}
            {...form.register("footerStruk")}
            className="rounded-xl"
          />
          <p className="text-[11px] text-text-muted">
            Teks penutup pada struk cetak kasir. Maksimal 300 karakter.
          </p>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button
            type="submit"
            disabled={save.isPending}
            className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
          >
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan Struk
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-text-strong">Pratinjau Struk</p>
        <div className="mx-auto w-full max-w-[220px] rounded-xl border border-border bg-white p-3 font-mono text-[10px] leading-tight text-black shadow-sm">
          <p className="text-center font-bold uppercase">
            {settings.namaKafe || "Nama Kafe"}
          </p>
          <p className="mt-1 border-y border-dashed border-black py-1 text-center font-bold">
            TRX-0001
          </p>
          <div className="mt-2 flex justify-between gap-2">
            <span>Meja</span>
            <span className="font-bold">Meja 1</span>
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between gap-2">
            <span>1x Kopi</span>
            <span>Rp 20.000</span>
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between gap-2 font-bold">
            <span>TOTAL</span>
            <span>Rp 20.000</span>
          </div>
          <p className="mt-2 text-center text-[9px] uppercase">
            {footer.trim() || "Footer struk tampil di sini"}
          </p>
        </div>
      </div>
    </form>
  );
}

function SistemTab({ settings }: { settings: Settings }) {
  const orderingOpen = settings.isOrderingOpen !== false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div>
          <p className="text-xs font-semibold">Status Pemesanan</p>
          <p className="text-[11px] text-text-muted">
            {orderingOpen
              ? "Customer dapat membuat pesanan baru."
              : "Checkout customer sedang ditutup."}
          </p>
        </div>
        <PillBadge variant={orderingOpen ? "success" : "danger"}>
          {orderingOpen ? "Pemesanan Buka" : "Pemesanan Tutup"}
        </PillBadge>
      </div>

      <Link
        href="/admin/settings/audit"
        className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary-300 hover:bg-surface-muted/50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <ScrollText className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-strong">
            Riwayat Audit
          </span>
          <span className="block text-[11px] text-text-muted">
            Telusuri perubahan produk, pesanan, pembayaran, stok, dan pengaturan.
          </span>
        </span>
        <ExternalLink className="size-4 shrink-0 text-text-muted" />
      </Link>

      <Link
        href="/admin/settings/realtime-test"
        className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary-300 hover:bg-surface-muted/50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Activity className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-strong">
            Tes Realtime
          </span>
          <span className="block text-[11px] text-text-muted">
            Kirim event uji untuk memastikan notifikasi realtime sampai ke klien.
          </span>
        </span>
        <ExternalLink className="size-4 shrink-0 text-text-muted" />
      </Link>

      <p className="text-[11px] leading-relaxed text-text-muted">
        Kunci integrasi (database, Cloudflare R2, Pusher, dan domain aplikasi)
        diatur melalui environment variable server. Nilainya tidak diedit dari
        halaman ini agar tidak tersimpan di database atau terkirim ke browser.
      </p>
    </div>
  );
}

const securitySchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    newPassword: z
      .string()
      .min(12, "Password baru minimal 12 karakter")
      .max(128, "Password baru maksimal 128 karakter"),
    confirmPassword: z.string().min(1, "Ulangi password baru"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });

type SecurityValues = z.infer<typeof securitySchema>;

function SecurityTab() {
  const router = useRouter();
  const form = useForm<SecurityValues>({
    resolver: zodResolver(securitySchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const save = useMutation({
    mutationFn: (values: SecurityValues) =>
      api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      }),
    onSuccess: () => {
      toast.success("Password berhasil diubah. Silakan login kembali.");
      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 900);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="max-w-md space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-text-strong">
            Ubah Password
          </h3>
          <p className="text-[11px] text-text-muted">
            Gunakan password unik minimal 12 karakter. Setelah disimpan, semua
            sesi berakhir dan Anda diarahkan ke halaman login.
          </p>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label
            htmlFor="settings-current-password"
            className="text-xs font-semibold"
          >
            Password Saat Ini
          </Label>
          <Input
            id="settings-current-password"
            type="password"
            autoComplete="current-password"
            {...form.register("currentPassword")}
            className="h-10 rounded-xl"
          />
          {form.formState.errors.currentPassword && (
            <p className="text-xs text-destructive">
              {form.formState.errors.currentPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="settings-new-password"
            className="text-xs font-semibold"
          >
            Password Baru
          </Label>
          <Input
            id="settings-new-password"
            type="password"
            autoComplete="new-password"
            {...form.register("newPassword")}
            className="h-10 rounded-xl"
          />
          {form.formState.errors.newPassword && (
            <p className="text-xs text-destructive">
              {form.formState.errors.newPassword.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="settings-confirm-password"
            className="text-xs font-semibold"
          >
            Ulangi Password Baru
          </Label>
          <Input
            id="settings-confirm-password"
            type="password"
            autoComplete="new-password"
            {...form.register("confirmPassword")}
            className="h-10 rounded-xl"
          />
          {form.formState.errors.confirmPassword && (
            <p className="text-xs text-destructive">
              {form.formState.errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={save.isPending}
          className="h-10 rounded-xl bg-primary-600 text-white hover:bg-primary-700"
        >
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Simpan Password Baru
        </Button>
      </form>
    </div>
  );
}

