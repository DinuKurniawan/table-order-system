"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/admin/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/utils";
import { toast } from "sonner";
import { Minus, Plus, Search } from "lucide-react";

type CartItem = {
  productId: string;
  productName: string;
  name?: string;
  productImage?: string;
  price: number;
  quantity: number;
  note?: string;
};

type CartItems = {
  [productId: string]: CartItem;
};

export default function CartPage() {
  const { token } = useParams() as { token: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  // ============================================================
  // Cart state persisted to localStorage
  // ============================================================
  const CART_KEY = `cart-${token || "default"}`;

  const [items, setItems] = useState<CartItems>(() => {
    try {
      const data = localStorage.getItem(CART_KEY);
      return data ? JSON.parse(data).items : {};
    } catch (e) {
      return {};
    }
  });

  // ============================================================
  // Fetch order summary - items from cart
  // ============================================================
  const itemEntries = Object.values(items) || [];

  // Calculate totals from items directly
  const totalItems = itemEntries.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = itemEntries.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // ============================================================
  // Form: ubah qty, catatan, nama customer
  // ============================================================
  const [isSaving, setIsSaving] = useState(false);
  const [customerName, setCustomerName] = useState<string | "">("");

  // ============================================================
  // Simpan keranjang ke localStorage
  // ============================================================
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ items }));
    } catch (e) {
      console.error("Gagal menyimpan keranjang", e);
    }
  }, [items]);

  // ============================================================
  // Submit order (POST /api/public/orders)
  // ============================================================
  const handleSubmit = async () => {
    setIsSaving(true);

    const itemsForOrder = itemEntries.map(
      (item) => ({
        productId: item.productId,
        quantity: item.quantity,
        note: item.note,
      })
    );

    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableToken: token,
          customerName: customerName || undefined,
          note: Object.values(items)[0]?.note || undefined,
          items: itemsForOrder,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Success: redirect ke halaman order
        router.push(`/order/${data.code}`);
      } else {
        toast.error(data.error || "Gagal memesan");
      }
    } catch (err) {
      toast.error("Gagal terhubung ke server");
    } finally {
      setIsSaving(false);
    }
  };

  if (totalItems === 0) {
    return (
      <div className="min-h-screen p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Keranjang Kosong</h1>
        <p className="text-text-muted mb-6">
          Belum ada item di keranjang. Scan QR meja dan mulai memilih menu.
        </p>
        <Button
          onClick={() => router.push("/m/" + token)}
          className="bg-primary-600 hover:bg-primary-700 text-white"
        >
          Lihat Menu
        </Button>
      </div>
    );
  }

  return (
    <SectionCard title="Ringkasan Keranjang">
      <div className="p-4">
        {/* Form ubah qty dan catatan */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Nama Pelanggan (opsional)
            </label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama pelanggan"
              className="rounded-xl h-10 w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Catatan umum
            </label>
            <Input
              placeholder="Contoh: Untuk kamar kerja, tambahan es rimas..."
              className="rounded-xl h-10 w-full"
            />
          </div>
        </div>

        {/* Daftar item keranjang */}
        <div className="mt-6 space-y-3">
          {itemEntries.map((item) => (
            <div key={item.productId} className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((prev) => {
                    const newItems = { ...prev };
                    if (newItems[item.productId].quantity > 1) {
                      newItems[item.productId].quantity -= 1;
                    }
                    return newItems;
                  })}
                  disabled={item.quantity <= 1}
                  className="rounded-lg p-1"
                >
                  <Minus className="size-3" />
                </Button>
                <span className="text-sm font-medium">
                  {item.quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((prev) => {
                    const newItems = { ...prev };
                    newItems[item.productId] = {
                      ...newItems[item.productId],
                      quantity: newItems[item.productId].quantity + 1,
                    };
                    return newItems;
                  })}
                  className="rounded-lg p-1"
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Ringkasan harga */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Total item</span>
            <span>{totalItems}</span>
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span>Total harga</span>
            <span className="text-primary">{formatRupiah(totalPrice)}</span>
          </div>
        </div>

        {/* Tombol Pesan & Bayar */}
        <Button
          disabled={isSaving}
          onClick={handleSubmit}
          className="w-full rounded-xl bg-primary-600 hover:bg-primary-700 text-white py-3 text-lg font-medium shadow-lg mt-4"
        >
          {isSaving && <span className="mr-2 size-4 animate-spin" />}
          Pesan & Bayar
        </Button>
      </div>
    </SectionCard>
  );
}