"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Check, Trash2, Eye, EyeOff, Plus, Loader2, RefreshCw, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/admin/section-card";
import { formatRupiah } from "@/lib/utils";
import { formatWIB, relativeTime } from "@/lib/utils";
import { appSettingsSchema, getSettings, updateSettings } from "@/server/services/settings";
import { toast } from "sonner";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Permintaan gagal");
  return json as T;
}

export function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = React.useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [dialogValues, setDialogValues] = React.useState<{
    namaKafe?: string;
    timeoutBayarMenit?: number;
    maksUploadUlang?: number;
    footerStruk?: string;
    isOrderingOpen?: boolean;
  }>({});

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ data: any }>("/api/admin/settings"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["settings"] });

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SectionCard title="Pengaturan Kafe & Sistem">
          <div className="flex items-center gap-3">
            <Loader2 className="size-4 animate-spin" />
            <span>Memuat...</span>
          </div>
        </SectionCard>
      </div>
    );
  }

  const settings = settingsQuery.data?.data ?? {};

  const openDialog = (initial?: any) => {
    setDialogValues(
      initial ?? {
        namaKafe: settings.namaKafe,
        timeoutBayarMenit: settings.timeoutBayarMenit,
        maksUploadUlang: settings.maksUploadUlang,
        footerStruk: settings.footerStruk,
        isOrderingOpen: settings.isOrderingOpen !== false,
      }
    );
    setSettingsDialogOpen(true);
  };

  const closeDialog = () => setSettingsDialogOpen(false);

  const submitDialog = () => {
    if (!settingsDialogOpen) return;
    setSettingsDialogOpen(false);
    const payload = {
      namaKafe: dialogValues.namaKafe,
      timeoutBayarMenit: dialogValues.timeoutBayarMenit,
      maksUploadUlang: dialogValues.maksUploadUlang,
      footerStruk: dialogValues.footerStruk,
      isOrderingOpen: dialogValues.isOrderingOpen,
    };
    setIsLoading(true);
    api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(payload) })
      .then(() => {
        toast.success("Pengaturan diperbarui");
        refresh();
      })
      .catch(() => toast.error("Gagal menyimpan"))
      .finally(() => setIsLoading(false));
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Pengaturan Kafe & Sistem">
        <div className="p-4 space-y-4">
          <div>
            <Label className="block text-xs font-semibold mb-1">Nama Kafe</Label>
            <Input
              defaultValue={settings.namaKafe || ""}
              onChange={(e) => setDialogValues({ ...dialogValues, namaKafe: e.target.value })}
              className="rounded-xl h-10 w-full"
            />
          </div>
          <div>
            <Label className="block text-xs font-semibold mb-1">Timeout Bayar (menit)</Label>
            <Input
              type="number"
              min={1}
              max={120}
              defaultValue={settings.timeoutBayarMenit ?? 15}
              onChange={(e) =>
                setDialogValues({
                  ...dialogValues,
                  timeoutBayarMenit: Number(e.target.value),
                })
              }
              className="rounded-xl h-10 w-full"
            />
          </div>
          <div>
            <Label className="block text-xs font-semibold mb-1">Maks Upload Ulang</Label>
            <Input
              type="number"
              min={1}
              max={10}
              defaultValue={settings.maksUploadUlang ?? 3}
              onChange={(e) =>
                setDialogValues({
                  ...dialogValues,
                  maksUploadUlang: Number(e.target.value),
                })
              }
              className="rounded-xl h-10 w-full"
            />
          </div>
          <div>
            <Label className="block text-xs font-semibold mb-1">Footer Struk</Label>
            <Input
              defaultValue={settings.footerStruk || ""}
              onChange={(e) => setDialogValues({ ...dialogValues, footerStruk: e.target.value })}
              className="rounded-xl h-10 w-full resize-none"
            />
          </div>
          <div>
            <Label className="block text-xs font-semibold mb-1">Status Pemesanan</Label>
            <Switch
              checked={settings.isOrderingOpen !== false}
              onCheckedChange={(checked) =>
                setDialogValues({ ...dialogValues, isOrderingOpen: checked })
              }
              className="rounded-xl h-5 w-11"
            />
            <span className="ml-2 text-[10px] text-text-muted">
              {settings.isOrderingOpen ? "Pemesanan Buka" : "Pemesanan Tutup"}
            </span>
          </div>
        </div>
      </SectionCard>

      <Dialog open={settingsDialogOpen} onOpenChange={(open) => setSettingsDialogOpen(open)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pengaturan Umum</DialogTitle>
            <DialogDescription>
              Perbarui konfigurasi kafe dan sistem.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitDialog();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="general-nama-kafe" className="text-xs font-semibold">
                Nama Kafe
              </Label>
              <Input
                id="general-nama-kafe"
                value={dialogValues.namaKafe ?? ""}
                onChange={(e) =>
                  setDialogValues({ ...dialogValues, namaKafe: e.target.value })
                }
                className="rounded-xl h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="general-timeout-bayar" className="text-xs font-semibold">
                Timeout Bayar (menit)
              </Label>
              <Input
                id="general-timeout-bayar"
                type="number"
                min={1}
                max={120}
                value={dialogValues.timeoutBayarMenit ?? 15}
                onChange={(e) =>
                  setDialogValues({
                    ...dialogValues,
                    timeoutBayarMenit: Number(e.target.value),
                  })
                }
                className="rounded-xl h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="general-maks-upload" className="text-xs font-semibold">
                Maks Upload Ulang
              </Label>
              <Input
                id="general-maks-upload"
                type="number"
                min={1}
                max={10}
                value={dialogValues.maksUploadUlang ?? 3}
                onChange={(e) =>
                  setDialogValues({
                    ...dialogValues,
                    maksUploadUlang: Number(e.target.value),
                  })
                }
                className="rounded-xl h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="general-footer-struk" className="text-xs font-semibold">
                Footer Struk
              </Label>
              <Input
                id="general-footer-struk"
                value={dialogValues.footerStruk ?? ""}
                onChange={(e) =>
                  setDialogValues({ ...dialogValues, footerStruk: e.target.value })
                }
                className="rounded-xl h-10 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="general-is-ordering" className="text-xs font-semibold">
                Status Pemesanan
              </Label>
              <Switch
                checked={dialogValues.isOrderingOpen !== false}
                onCheckedChange={(checked) =>
                  setDialogValues({ ...dialogValues, isOrderingOpen: checked })
                }
                className="rounded-xl h-5 w-11"
              />
              <span className="ml-2 text-[10px] text-text-muted">
                {dialogValues.isOrderingOpen ? "Pemesanan Buka" : "Pemesanan Tutup"}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
              >
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Simpan Perubahan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}