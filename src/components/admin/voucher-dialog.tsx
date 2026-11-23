"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { z } from "@/lib/zod";
import { formatRupiah } from "@/lib/utils";
import { computeVoucherDiscount } from "@/lib/voucher-discount";
import { generateVoucherCode, voucherCodeSchema } from "@/lib/voucher-code";
import { apiErrorMessage } from "@/lib/api-error";
import type { VoucherDTO } from "@/types/voucher";

const formSchema = z
  .object({
    code: voucherCodeSchema,
    description: z.string().trim().max(160, "Maksimal 160 karakter").optional(),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z
      .number({ error: "Nilai diskon wajib diisi" })
      .int("Harus bilangan bulat")
      .min(1, "Minimal 1"),
    maxDiscount: z
      .number({ error: "Maks. diskon wajib diisi" })
      .int("Harus bilangan bulat")
      .min(1, "Minimal Rp1")
      .optional(),
    minSpend: z
      .number({ error: "Min. belanja wajib diisi" })
      .int("Harus bilangan bulat")
      .min(0, "Tidak boleh negatif"),
    quota: z
      .number({ error: "Kuota wajib diisi" })
      .int("Harus bilangan bulat")
      .min(1, "Minimal 1")
      .optional(),
    startsAt: z.string().min(1, "Tanggal mulai wajib diisi"),
    endsAt: z.string().min(1, "Tanggal berakhir wajib diisi"),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.endsAt && data.startsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Tanggal berakhir harus setelah tanggal mulai",
      });
    }
    if (data.type === "PERCENT") {
      if (data.value > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Persentase maksimal 100",
        });
      }
      if (!data.maxDiscount) {
        ctx.addIssue({
          code: "custom",
          path: ["maxDiscount"],
          message: "Maks. diskon wajib diisi untuk tipe persen",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

function toWibInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

function fromWibInput(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json, "Permintaan gagal"));
  return json as T;
}

export function VoucherDialog({
  voucher,
  template,
  onClose,
  onSaved,
}: {
  voucher: VoucherDTO | null;
  template?: VoucherDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(voucher);
  const source = voucher ?? template ?? null;
  const locked = Boolean(voucher && voucher.usedCount > 0);
  const now = React.useMemo(() => new Date(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: voucher?.code ?? generateVoucherCode(),
      description: source?.description ?? "",
      type: source?.type ?? "PERCENT",
      value: source?.value ?? 10,
      maxDiscount: source?.maxDiscount ?? 10_000,
      minSpend: source?.minSpend ?? 0,
      quota: source?.quota ?? undefined,
      startsAt: toWibInput(voucher?.startsAt ?? now.toISOString()),
      endsAt: toWibInput(
        voucher?.endsAt ??
          new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      ),
      isActive: voucher?.isActive ?? true,
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const value = useWatch({ control: form.control, name: "value" });
  const maxDiscount = useWatch({ control: form.control, name: "maxDiscount" });
  const isActive = useWatch({ control: form.control, name: "isActive" });

  const preview = computeVoucherDiscount(
    {
      type,
      value: Number(value) || 0,
      maxDiscount:
        type === "PERCENT" && maxDiscount ? Number(maxDiscount) : null,
    },
    50_000
  );

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        code: values.code,
        description: values.description || null,
        type: values.type,
        value: values.value,
        maxDiscount: values.type === "PERCENT" ? values.maxDiscount : null,
        minSpend: values.minSpend,
        quota: values.quota ?? null,
        startsAt: fromWibInput(values.startsAt),
        endsAt: fromWibInput(values.endsAt),
        isActive: values.isActive,
      };
      return api(
        isEdit ? `/api/admin/vouchers/${voucher!.id}` : "/api/admin/vouchers",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: () => {
      toast.success(isEdit ? "Voucher diperbarui" : "Voucher ditambahkan");
      onSaved();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(form.getValues("code"));
      toast.success("Kode voucher disalin");
    } catch {
      toast.error("Gagal menyalin kode");
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Voucher" : "Tambah Voucher"}
          </DialogTitle>
          <DialogDescription>
            Customer wajib mengetik kode ini saat checkout. Kode harus unik.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="voucher-code" className="text-xs font-semibold">
              Kode Voucher
            </Label>
            <div className="flex gap-2">
              <Input
                id="voucher-code"
                {...form.register("code")}
                disabled={locked}
                className="rounded-xl h-10 font-mono uppercase tracking-wider"
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-xl shrink-0"
                disabled={locked}
                onClick={() =>
                  form.setValue("code", generateVoucherCode(), {
                    shouldValidate: true,
                  })
                }
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Generate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                aria-label="Salin kode voucher"
                onClick={copyCode}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-text-muted">
              Bisa isi sendiri atau generate 8 karakter acak. Setelah voucher
              dipakai, kode tidak dapat diubah.
            </p>
            {form.formState.errors.code && (
              <p className="text-xs text-destructive">
                {form.formState.errors.code.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voucher-description" className="text-xs font-semibold">
              Deskripsi Internal
            </Label>
            <Textarea
              id="voucher-description"
              rows={2}
              {...form.register("description")}
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tipe Diskon</Label>
              <div className="flex rounded-xl border border-border p-1">
                {(["PERCENT", "FIXED"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      form.setValue("type", option, { shouldValidate: true })
                    }
                    className={
                      "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
                      (type === option
                        ? "bg-primary-600 text-white"
                        : "text-text-muted hover:bg-surface-muted")
                    }
                  >
                    {option === "PERCENT" ? "Persen (%)" : "Nominal (Rp)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="voucher-value" className="text-xs font-semibold">
                {type === "PERCENT" ? "Persentase" : "Nominal"}
              </Label>
              <Input
                id="voucher-value"
                type="number"
                min={1}
                disabled={locked}
                {...form.register("value", { valueAsNumber: true })}
                className="rounded-xl h-10"
              />
              {form.formState.errors.value && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.value.message}
                </p>
              )}
            </div>
          </div>

          {type === "PERCENT" && (
            <div className="space-y-1.5">
              <Label htmlFor="voucher-max" className="text-xs font-semibold">
                Maks. Diskon (Rp)
              </Label>
              <Input
                id="voucher-max"
                type="number"
                min={1}
                disabled={locked}
                {...form.register("maxDiscount", {
                  setValueAs: (raw) =>
                    raw === "" || raw == null ? undefined : Number(raw),
                })}
                className="rounded-xl h-10"
              />
              {form.formState.errors.maxDiscount && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.maxDiscount.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="voucher-min" className="text-xs font-semibold">
                Min. Belanja (Rp)
              </Label>
              <Input
                id="voucher-min"
                type="number"
                min={0}
                disabled={locked}
                {...form.register("minSpend", { valueAsNumber: true })}
                className="rounded-xl h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="voucher-quota" className="text-xs font-semibold">
                Kuota (kosong = tanpa batas)
              </Label>
              <Input
                id="voucher-quota"
                type="number"
                min={1}
                {...form.register("quota", {
                  setValueAs: (raw) =>
                    raw === "" || raw == null ? undefined : Number(raw),
                })}
                className="rounded-xl h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="voucher-start" className="text-xs font-semibold">
                Mulai (WIB)
              </Label>
              <Input
                id="voucher-start"
                type="datetime-local"
                disabled={locked}
                {...form.register("startsAt")}
                className="rounded-xl h-10"
              />
              {form.formState.errors.startsAt && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.startsAt.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="voucher-end" className="text-xs font-semibold">
                Berakhir (WIB)
              </Label>
              <Input
                id="voucher-end"
                type="datetime-local"
                {...form.register("endsAt")}
                className="rounded-xl h-10"
              />
              {form.formState.errors.endsAt && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.endsAt.message}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-muted/60 p-3 text-xs text-text-muted">
            Contoh belanja <strong className="text-text-strong">Rp 50.000</strong>{" "}
            → diskon{" "}
            <strong className="text-primary-700">{formatRupiah(preview)}</strong> →
            total{" "}
            <strong className="text-text-strong">
              {formatRupiah(Math.max(0, 50_000 - preview))}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              aria-label="Voucher aktif"
              checked={isActive}
              onCheckedChange={(checked) =>
                form.setValue("isActive", checked, { shouldValidate: true })
              }
              className="h-5 w-11 rounded-xl"
            />
            <span className="text-[11px] text-text-muted">
              Aktif dan dapat dipakai customer
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={onClose}
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
              Simpan Voucher
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
