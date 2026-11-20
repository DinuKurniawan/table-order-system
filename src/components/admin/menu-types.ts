import type { SizePrices } from "@/lib/size-pricing";

export interface CategoryDTO {
  id: string;
  name: string;
  type: "FOOD" | "DRINK";
  subtype: "COFFEE" | "NON_COFFEE" | null;
  sortOrder: number;
  productCount: number;
}

export interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sizePrices: SizePrices | null;
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
