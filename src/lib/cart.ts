import type { CupSize } from "@/lib/size-pricing";

export type { CupSize };

/**
 * Bentuk keranjang yang boleh dibaca dari localStorage (audit R-04).
 * `name` dipakai halaman menu, `productName` dipakai halaman keranjang;
 * keduanya opsional agar data lama tetap terbaca.
 *
 * Parser ditulis manual (tanpa Zod) agar halaman menu customer tidak
 * mengunduh validator ~100 KB hanya untuk membaca localStorage.
 */
export type SugarLevel = "NO_SUGAR" | "SEDIKIT" | "REGULER";
export type IceLevel = "SEDIKIT" | "REGULER";
export type Temperature = "ICE" | "HOT";

export interface CartItem {
  productId: string;
  name?: string;
  productName?: string;
  productImage?: string;
  drink?: boolean;
  sugar?: SugarLevel;
  ice?: IceLevel;
  temperature?: Temperature;
  size?: CupSize;
  price: number;
  quantity: number;
  note?: string;
}

export type CartItems = Record<string, CartItem>;

const SUGAR_LEVELS: readonly SugarLevel[] = ["NO_SUGAR", "SEDIKIT", "REGULER"];
const ICE_LEVELS: readonly IceLevel[] = ["SEDIKIT", "REGULER"];
const TEMPERATURES: readonly Temperature[] = ["ICE", "HOT"];
const CUP_SIZES: readonly CupSize[] = ["REGULER", "LARGE", "JUMBO"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function toCartItem(value: unknown): CartItem | null {
  if (!isRecord(value)) return null;

  const { productId, price, quantity } = value;
  if (typeof productId !== "string" || productId.length === 0) return null;
  if (!Number.isInteger(price) || (price as number) < 0) return null;
  if (!Number.isInteger(quantity) || (quantity as number) <= 0) return null;

  const item: CartItem = {
    productId,
    price: price as number,
    quantity: quantity as number,
  };

  if (typeof value.name === "string" && value.name.length > 0) item.name = value.name;
  if (typeof value.productName === "string" && value.productName.length > 0) {
    item.productName = value.productName;
  }
  if (typeof value.productImage === "string") item.productImage = value.productImage;
  if (typeof value.drink === "boolean") item.drink = value.drink;

  const sugar = oneOf(value.sugar, SUGAR_LEVELS);
  if (sugar) item.sugar = sugar;
  const ice = oneOf(value.ice, ICE_LEVELS);
  if (ice) item.ice = ice;
  const temperature = oneOf(value.temperature, TEMPERATURES);
  if (temperature) item.temperature = temperature;
  const size = oneOf(value.size, CUP_SIZES);
  if (size) item.size = size;

  if (typeof value.note === "string") item.note = value.note;

  return item;
}

/** Parse isi localStorage; data rusak/tidak valid dianggap keranjang kosong. */
export function parseStoredCart(raw: string | null): CartItems {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const items = isRecord(parsed) ? parsed.items : null;
    if (!isRecord(items)) return {};

    const result: CartItems = {};
    for (const [key, value] of Object.entries(items)) {
      const item = toCartItem(value);
      if (item) result[key] = item;
    }
    return result;
  } catch {
    return {};
  }
}
