"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/admin/section-card";
import { formatRupiah } from "@/lib/utils";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

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
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-8 text-center text-text-muted">
          Memuat keranjang...
        </div>
      }
    >
      <CartContent />
    </Suspense>
  );
}

function CartContent() {
  const { token } = useParams() as { token: string };
  const router = useRouter();

  // ============================================================
  // Cart state persisted to localStorage
  // ============================================================
  const CART_KEY = `cart-${token || "default"}`;

  const [items, setItems] = useState<CartItems>({});
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    try {
      const data = window.localStorage.getItem(CART_KEY);
      setItems(data ? (JSON.parse(data).items as CartItems) : {});
    } catch {
      setItems({});
    }
    setCartReady(true);
  }, [CART_KEY]);

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
  const [customerName, setCustomerName] = useState("");
  const [generalNote, setGeneralNote] = useState("");
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const cartSignature = JSON.stringify(items);

  // Kunci idempotensi berubah saat isi keranjang berubah, sehingga klik ganda
  // pada checkout yang sama tidak membuat pesanan/ reservasi stok ganda.
  useEffect(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [cartSignature]);

  // ============================================================
  // Simpan keranjang ke localStorage
  // ============================================================
  useEffect(() => {
    if (!cartReady) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ items }));
    } catch {
      // Kuota/privacy mode: keranjang tetap jalan di memori.
    }
  }, [items, cartReady, CART_KEY]);

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
          "Idempotency-Key":
            idempotencyKeyRef.current || crypto.randomUUID(),
        },
        body: JSON.stringify({
          tableToken: token,
          customerName: customerName || undefined,
          note: generalNote || undefined,
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
            <label
              htmlFor="customer-name"
              className="mb-2 block text-sm font-medium"
            >
              Nama Pelanggan (opsional)
            </label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama pelanggan"
              className="h-11 w-full rounded-xl"
            />
          </div>

          <div>
            <label
              htmlFor="general-note"
              className="mb-2 block text-sm font-medium"
            >
              Catatan umum
            </label>
            <Input
              id="general-note"
              value={generalNote}
              onChange={(e) => setGeneralNote(e.target.value)}
              placeholder="Contoh: tambahan es sedikit"
              maxLength={300}
              className="h-11 w-full rounded-xl"
            />
          </div>
        </div>

        {/* Daftar item keranjang */}
        <div className="mt-6 space-y-3">
          {itemEntries.map((item) => (
            <div key={item.productId} className="flex items-center justify-between gap-3 rounded border p-3">
              <span className="font-medium">
                {item.name ?? item.productName}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Kurangi ${item.name ?? item.productName}`}
                  onClick={() => setItems((prev) => {
                    const newItems = { ...prev };
                    if (newItems[item.productId].quantity > 1) {
                      newItems[item.productId].quantity -= 1;
                    }
                    return newItems;
                  })}
                  disabled={item.quantity <= 1}
                  className="size-11 rounded-xl"
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-7 text-center text-sm font-medium tabular-nums">
                  {item.quantity}
                </span>
                <Button
                  type="button"
                  size="icon"
                  aria-label={`Tambah ${item.name ?? item.productName}`}
                  onClick={() => setItems((prev) => {
                    const newItems = { ...prev };
                    newItems[item.productId] = {
                      ...newItems[item.productId],
                      quantity: newItems[item.productId].quantity + 1,
                    };
                    return newItems;
                  })}
                  className="size-11 rounded-xl"
                >
                  <Plus className="size-4" />
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