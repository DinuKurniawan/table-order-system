"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api } from "./menu-api";
import type { CategoryDTO } from "./menu-types";

export function CategoryDialog({
  categories,
  onClose,
  onChanged,
}: {
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
    <Dialog open onOpenChange={(next) => !next && onClose()}>
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
