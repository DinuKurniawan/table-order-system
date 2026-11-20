import { describe, expect, it } from "vitest";
import { parseSizePrices, priceForSize } from "@/lib/size-pricing";

describe("harga per size cup", () => {
  it("memakai data admin dengan fallback harga dasar", () => {
    const prices = parseSizePrices({ LARGE: 34000, JUMBO: 40000 });

    expect(priceForSize(28000, prices, "REGULER")).toBe(28000);
    expect(priceForSize(28000, prices, "LARGE")).toBe(34000);
    expect(priceForSize(28000, prices, "JUMBO")).toBe(40000);
    expect(priceForSize(28000, null, "LARGE")).toBe(28000);
    expect(priceForSize(28000, { LARGE: 30000 }, "JUMBO")).toBe(28000);
  });

  it("mengabaikan sizePrices tidak valid", () => {
    expect(parseSizePrices({ LARGE: -1 })).toBeNull();
    expect(parseSizePrices({})).toBeNull();
    expect(parseSizePrices("bukan objek")).toBeNull();
  });
});
