"use client";

import { apiErrorMessage } from "@/lib/api-error";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Coffee,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Utensils,
} from "lucide-react";
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
import { SectionCard } from "@/components/admin/section-card";
import { PillBadge, PillVariant } from "@/components/admin/pill-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { ImageUploader } from "@/components/image-uploader";
import { formatRupiah, cn } from "@/lib/utils";
import {
  productFormSchema,
  ProductFormValues,
} from "@/lib/validators/product";

type TabKey = "all" | "food" | "coffee" | "non_coffee";

interface CategoryDTO {
  id: string;
  name: string;
  type: "FOOD" | "DRINK";
  subtype: "COFFEE" | "NON_COFFEE" | null;
  sortOrder: number;
  productCount: number;
}

interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageKey: string | null;
  thumbKey: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  category: {
    id: string;
    name: string;
    type: "FOOD" | "DRINK";
    subtype: "COFFEE" | "NON_COFFEE" | null;
  };
  isActive: boolean;
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number;
}

interface ProductListResponse {
  items: ProductDTO[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "food", label: "Makanan" },
  { key: "coffee", label: "Kopi" },
  { key: "non_coffee", label: "Non Kopi" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "name_asc", label: "Nama A–Z" },
  { value: "price_asc", label: "Harga termurah" },
  { value: "price_desc", label: "Harga termahal" },
  { value: "stock_asc", label: "Stok terendah" },
];

function categoryPill(category: ProductDTO["category"]): {
  variant: PillVariant;
  label: string;
} {
  if (category.type === "FOOD") return { variant: "warning", label: category.name };
  if (category.subtype === "COFFEE") return { variant: "primary", label: category.name };
  return { variant: "info", label: category.name };
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

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function MenuManager() {
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<TabKey>("all");
  const [status, setStatus] = React.useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = React.useState("newest");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [productDialog, setProductDialog] = React.useState<{
    open: boolean;
    product: ProductDTO | null;
  }>({ open: false, product: null });
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);

  const debouncedSearch = useDebounced(search);

  const resetPage = () => setPage(1);
  const changeTab = (next: TabKey) => {
    setTab(next);
    resetPage();
  };
  const changeStatus = (next: typeof status) => {
    setStatus(next);
    resetPage();
  };
  const changeSort = (next: string) => {
    setSort(next);
    resetPage();
  };
  const changeSearch = (next: string) => {
    setSearch(next);
    resetPage();
  };

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<{ data: CategoryDTO[] }>("/api/admin/categories"),
  });

  const params = new URLSearchParams({
    tab,
    status,
    sort,
    page: String(page),
    pageSize: "10",
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
  });

  const productsQuery = useQuery({
    queryKey: ["products", tab, status, sort, debouncedSearch, page],
    queryFn: () => api<ProductListResponse>(`/api/admin/products?${params.toString()}`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/api/admin/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      const previous = queryClient.getQueryData<ProductListResponse>([
        "products",
        tab,
        status,
        sort,
        debouncedSearch,
        page,
      ]);
      queryClient.setQueryData<ProductListResponse>(
        ["products", tab, status, sort, debouncedSearch, page],
        (old) =>
          old
            ? { ...old, items: old.items.map((p) => (p.id === id ? { ...p, isActive } : p)) }
            : old
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["products", tab, status, sort, debouncedSearch, page],
          context.previous
        );
      }
      toast.error(err.message);
    },
    onSuccess: () => toast.success("Status produk diperbarui"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Produk dihapus");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const categories = categoriesQuery.data?.data ?? [];
  const products = productsQuery.data?.items ?? [];
  const meta = productsQuery.data?.meta;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Katalog Menu"
        subtitle="Kelola produk, harga, stok, dan kategori kafe."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border text-xs gap-1.5"
              onClick={() => setCategoryDialogOpen(true)}
            >
              <FolderPlus className="size-3.5" />
              Kategori
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium gap-1.5 shadow-sm"
              onClick={() => setProductDialog({ open: true, product: null })}
            >
              <Plus className="size-4" />
              Tambah Produk
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Tab kategori */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => changeTab(t.key)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                  tab === t.key
                    ? "bg-primary-600 text-white"
                    : "bg-surface-muted text-text-muted hover:text-text-strong"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Cari nama produk..."
                className="pl-9 rounded-xl border-border bg-surface-muted text-xs h-9"
              />
            </div>

            <Select
              value={status}
              onValueChange={(v) => changeStatus(v as typeof status)}
            >
              <SelectTrigger className="rounded-xl h-9 text-xs w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => changeSort(v ?? "newest")}>
              <SelectTrigger className="rounded-xl h-9 text-xs w-full sm:w-44">
                <SelectValue placeholder="Urutkan" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabel */}
          {productsQuery.isLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : productsQuery.isError ? (
            <EmptyState
              title="Gagal memuat produk"
              description={(productsQuery.error as Error).message}
            />
          ) : products.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title="Belum ada produk"
              description="Tambahkan produk pertama atau ubah filter pencarian."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Produk</th>
                    <th className="px-4 py-3 font-medium">Kategori</th>
                    <th className="px-4 py-3 font-medium text-right">Harga</th>
                    <th className="px-4 py-3 font-medium text-right">Stok</th>
                    <th className="px-4 py-3 font-medium text-center">Aktif</th>
                    <th className="px-4 py-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const pill = categoryPill(product.category);
                    const thumb = product.thumbUrl ?? product.imageUrl;
                    return (
                      <tr key={product.id} className="border-t border-border/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-surface-muted border border-border">
                              {thumb ? (
                                /* eslint-disable-next-line @next/next/no-img-element -- aset AVIF sudah dioptimalkan di server */
                                <img
                                  src={thumb}
                                  alt={product.name}
                                  loading="lazy"
                                  className="size-full object-cover"
                                />
                              ) : (
                                <Coffee className="size-5 text-text-muted absolute inset-0 m-auto" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-text-strong truncate max-w-[220px]">
                                {product.name}
                              </div>
                              {product.description && (
                                <div className="text-[11px] text-text-muted truncate max-w-[220px]">
                                  {product.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <PillBadge variant={pill.variant}>{pill.label}</PillBadge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatRupiah(product.price)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {product.trackStock ? (
                            <span
                              className={cn(
                                "font-medium",
                                product.stock <= product.lowStockThreshold && "text-accent-red"
                              )}
                            >
                              {product.stock}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={product.isActive}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: product.id, isActive: checked })
                            }
                            aria-label={`Aktifkan ${product.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-lg"
                              aria-label={`Edit ${product.name}`}
                              onClick={() => setProductDialog({ open: true, product })}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="rounded-lg text-destructive hover:bg-destructive/10"
                              aria-label={`Hapus ${product.name}`}
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm(`Hapus produk "${product.name}"?`)) {
                                  deleteMutation.mutate(product.id);
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginasi */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-text-muted">
                {meta.total} produk · halaman {meta.page} dari {meta.totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-lg"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-lg"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {productDialog.open && (
        <ProductDialog
          key={productDialog.product?.id ?? "new-product"}
          product={productDialog.product}
          categories={categories}
          onClose={() => setProductDialog({ open: false, product: null })}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            queryClient.invalidateQueries({ queryKey: ["categories"] });
          }}
        />
      )}

      <CategoryDialog
        open={categoryDialogOpen}
        categories={categories}
        onClose={() => setCategoryDialogOpen(false)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["categories"] })}
      />
    </div>
  );
}

function ProductDialog({
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
      categoryId: product?.category.id ?? "",
      imageKey: product?.imageKey ?? null,
      thumbKey: product?.thumbKey ?? null,
      isActive: product?.isActive ?? true,
      trackStock: product?.trackStock ?? true,
      stock: product?.stock ?? 0,
      lowStockThreshold: product?.lowStockThreshold ?? 5,
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      // Stok hanya lewat modul stok; jangan pernah dikirim saat edit produk (K-01).
      const { stock, ...withoutStock } = values;
      const payload = {
        ...withoutStock,
        ...(isEdit ? {} : { stock }),
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

  const trackStock = useWatch({ control: form.control, name: "trackStock" });
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const isActive = useWatch({ control: form.control, name: "isActive" });

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

          <div className="grid grid-cols-2 gap-3">
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

function CategoryDialog({
  open,
  categories,
  onClose,
  onChanged,
}: {
  open: boolean;
  categories: CategoryDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"FOOD" | "COFFEE" | "NON_COFFEE">("FOOD");

  const createMutation = useMutation({
    mutationFn: () =>
      api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify(
          kind === "FOOD"
            ? { name, type: "FOOD" }
            : { name, type: "DRINK", subtype: kind }
        ),
      }),
    onSuccess: () => {
      toast.success("Kategori ditambahkan");
      setName("");
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Kategori dihapus");
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api("/api/admin/categories/reorder", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => onChanged(),
    onError: (err: Error) => toast.error(err.message),
  });

  const move = (index: number, direction: -1 | 1) => {
    const next = [...categories];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((c) => c.id));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Kelola Kategori</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {categories.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-strong truncate">
                    {category.name}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {category.type === "FOOD"
                      ? "Makanan"
                      : category.subtype === "COFFEE"
                        ? "Minuman · Kopi"
                        : "Minuman · Non Kopi"}{" "}
                    · {category.productCount} produk
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Naikkan urutan"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Turunkan urutan"
                    disabled={index === categories.length - 1 || reorderMutation.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive/10"
                    aria-label={`Hapus kategori ${category.name}`}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Hapus kategori "${category.name}"?`)) {
                        deleteMutation.mutate(category.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-xs font-semibold">Kategori baru</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama kategori"
              className="rounded-xl h-10"
            />
            <Select
              value={kind}
              onValueChange={(v) => setKind((v as typeof kind) ?? "FOOD")}
            >
              <SelectTrigger className="rounded-xl h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FOOD">Makanan</SelectItem>
                <SelectItem value="COFFEE">Minuman · Kopi</SelectItem>
                <SelectItem value="NON_COFFEE">Minuman · Non Kopi</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={!name.trim() || createMutation.isPending}
              className="w-full rounded-xl bg-primary-600 hover:bg-primary-700 text-white"
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Tambah Kategori
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
