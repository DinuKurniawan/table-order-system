"use client";

import { useSyncExternalStore } from "react";
import { parseStoredCart, type CartItems } from "@/lib/cart";

const carts = new Map<string, CartItems>();
const hydrated = new Set<string>();
const listeners = new Set<() => void>();
const EMPTY: CartItems = {};
// Menu pertama yang dimuat dalam dokumen ini mereset keranjang; navigasi
// klien berikutnya (cart -> menu) tidak menghapus pilihan yang sedang aktif.
let menuBooted = false;

function storageKey(token: string): string {
  return `cart-${token}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function readCart(token: string): CartItems {
  return carts.get(token) ?? EMPTY;
}

export function writeCart(token: string, items: CartItems): void {
  if (carts.get(token) === items) return;
  carts.set(token, items);
  try {
    sessionStorage.setItem(storageKey(token), JSON.stringify({ items }));
  } catch {
    // Mode privat / kuota penuh: keranjang tetap jalan di memori.
  }
  notify();
}

export function hydrateCart(token: string): void {
  if (hydrated.has(token)) return;
  hydrated.add(token);
  try {
    const saved = parseStoredCart(sessionStorage.getItem(storageKey(token)));
    if (Object.keys(saved).length > 0) carts.set(token, saved);
  } catch {
    // Storage diblokir: mulai dengan keranjang kosong.
  }
  notify();
}

export function resetCartOnMenu(token: string): void {
  if (menuBooted) return;
  menuBooted = true;
  hydrated.add(token);
  carts.delete(token);
  try {
    sessionStorage.removeItem(storageKey(token));
  } catch {
    // Storage diblokir: tidak ada yang perlu dihapus.
  }
  notify();
}

export function clearCart(token: string): void {
  writeCart(token, {});
}

/**
 * Keranjang reaktif: halaman yang sudah ter-mount (atau di cache router)
 * langsung ikut berubah saat item ditambah, tanpa menunggu mount ulang.
 */
export function useCart(token: string) {
  const items = useSyncExternalStore(
    subscribe,
    () => readCart(token),
    () => EMPTY
  );

  const setItems = (value: CartItems | ((prev: CartItems) => CartItems)) => {
    const next = typeof value === "function" ? value(readCart(token)) : value;
    writeCart(token, next);
  };

  return [items, setItems] as const;
}

/** False sampai hydrateCart dijalankan; dipakai untuk menahan render awal. */
export function useCartHydrated(token: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated.has(token),
    () => false
  );
}
