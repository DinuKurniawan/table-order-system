"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import { ImageUploader } from "@/components/image-uploader";
import {
  productFormSchema,
  ProductFormValues,
} from "@/lib/validators/product";
import { api } from "./menu-api";
import type { CategoryDTO, ProductDTO } from "./menu-types";

export function ProductDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: ProductDTO | null;
  categories: CategoryDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(product);
  const [imageUrl, setImageUrl] = React.useState<string | null>(product?.imageUrl ?? null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: product?.price ?? 0,
      priceLarge: product?.sizePrices?.LARGE,
      priceJumbo: product?.sizePrices?.JUMBO,
      categoryId: product?.category.id ?? "",
      imageKey: product?.imageKey ?? null,
      thumbKey: product?.thumbKey ?? null,
      isActive: product?.isActive ?? true,
      trackStock: product?.trackStock ?? true,
      stock: product?.stock ?? 0,
      lowStockThreshold: product?.lowStockThreshold ?? 5,
    },
  });

  const trackStock = useWatch({ control: form.control, name: "trackStock" });
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isDrink = selectedCategory?.type === "DRINK";

  const saveMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      // Stok hanya lewat modul stok; jangan pernah dikirim saat edit produk (K-01).
      const { stock, priceLarge, priceJumbo, ...withoutStock } = values;
      const sizePrices = isDrink
        ? {
            ...(priceLarge !== undefined ? { LARGE: priceLarge } : {}),
            ...(priceJumbo !== undefined ? { JUMBO: priceJumbo } : {}),
          }
        : null;
      const payload = {
        ...withoutStock,
        ...(isEdit ? {} : { stock }),
        sizePrices:
          sizePrices && Object.keys(sizePrices).length > 0 ? sizePrices : null,
        description: values.description || null,
        imageKey: values.imageKey || null,
        thumbKey: values.thumbKey || null,
      };
      return api(isEdit ? `/api/admin/products/${product!.id}` : "/api/admin/products", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Produk diperbarui" : "Produk ditambahkan");
      onSaved();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="space-y-4"
        >
          <ImageUploader
            label="Gambar Produk"
            preset="product"
            value={imageUrl}
            onChange={(url, key, thumbKey) => {
              setImageUrl(url || null);
              form.setValue("imageKey", key || null);
              form.setValue("thumbKey", thumbKey || null);
            }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="product-name" className="text-xs font-semibold">
              Nama Produk
            </Label>
            <Input
              id="product-name"
              {...form.register("name")}
              className="rounded-xl h-10"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-desc" className="text-xs font-semibold">
              Deskripsi
            </Label>
            <Textarea
              id="product-desc"
              rows={2}
              {...form.register("description")}
              className="rounded-xl"
            />
          </div>

          <div className={isDrink ? "space-y-1.5" : "grid grid-cols-2 gap-3"}>
            {!isDrink && (
              <div className="space-y-1.5">
                <Label htmlFor="product-price" className="text-xs font-semibold">
                  Harga (Rp)
                </Label>
                <Input
                  id="product-price"
                  type="number"
                  min={0}
                  {...form.register("price", { valueAsNumber: true })}
                  className="rounded-xl h-10"
                />
                {form.formState.errors.price && (
                  <p className="text-xs text-destructive">{form.formState.errors.price.message}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Kategori</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => form.setValue("categoryId", v ?? "", { shouldValidate: true })}
              >
                <SelectTrigger className="rounded-xl h-10 w-full">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.categoryId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.categoryId.message}
                </p>
              )}
            </div>
          </div>

          {isDrink && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="text-[11px] text-text-muted">
                Harga per size cup untuk minuman ini. Kosongkan Large/Jumbo bila
                sama dengan harga Reguler.
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="product-price" className="text-xs font-semibold">
                    Harga Reguler (Rp)
                  </Label>
                  <Input
                    id="product-price"
                    type="number"
                    min={0}
                    {...form.register("price", { valueAsNumber: true })}
                    className="rounded-xl h-10"
                  />
                  {form.formState.errors.price && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.price.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-price-large" className="text-xs font-semibold">
                    Harga Large (Rp)
                  </Label>
                  <Input
                    id="product-price-large"
                    type="number"
                    min={0}
                    placeholder="Sama dengan Reguler"
                    {...form.register("priceLarge", {
                      setValueAs: (value) =>
                        value === "" || value === null ? undefined : Number(value),
                    })}
                    className="rounded-xl h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-price-jumbo" className="text-xs font-semibold">
                    Harga Jumbo (Rp)
                  </Label>
                  <Input
                    id="product-price-jumbo"
                    type="number"
                    min={0}
                    placeholder="Sama dengan Reguler"
                    {...form.register("priceJumbo", {
                      setValueAs: (value) =>
                        value === "" || value === null ? undefined : Number(value),
                    })}
                    className="rounded-xl h-10"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <Label htmlFor="product-track" className="text-xs font-semibold">
              Lacak stok
            </Label>
            <Switch
              id="product-track"
              checked={trackStock}
              onCheckedChange={(checked) => form.setValue("trackStock", checked)}
            />
          </div>

          {trackStock && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-stock" className="text-xs font-semibold">
                  Stok
                </Label>
                <Input
                  id="product-stock"
                  type="number"
                  min={0}
                  disabled={isEdit}
                  {...form.register("stock", { valueAsNumber: true })}
                  className="rounded-xl h-10"
                />
                {isEdit && (
                  <p className="text-[11px] text-text-muted">
                    Stok diubah lewat halaman Stok, bukan di sini.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-low" className="text-xs font-semibold">
                  Ambang stok menipis
                </Label>
                <Input
                  id="product-low"
                  type="number"
                  min={0}
                  {...form.register("lowStockThreshold", { valueAsNumber: true })}
                  className="rounded-xl h-10"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <Label htmlFor="product-active" className="text-xs font-semibold">
              Produk aktif
            </Label>
            <Switch
              id="product-active"
              checked={isActive}
              onCheckedChange={(checked) => form.setValue("isActive", checked)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
            >
              {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Simpan Perubahan" : "Tambah Produk"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
