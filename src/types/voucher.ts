import type { VoucherType } from "@prisma/client";

export type VoucherStatus =
  | "AKTIF"
  | "TERJADWAL"
  | "BERAKHIR"
  | "HABIS"
  | "NONAKTIF";

export interface VoucherDTO {
  id: string;
  code: string;
  description: string | null;
  type: VoucherType;
  value: number;
  maxDiscount: number | null;
  minSpend: number;
  quota: number | null;
  usedCount: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  status: VoucherStatus;
  createdAt: string;
}

export interface VoucherStats {
  activeCount: number;
  monthRedemptions: number;
  monthDiscount: number;
  expiringSoon: number;
}

export interface VoucherListResult {
  items: VoucherDTO[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats: VoucherStats;
}

export interface VoucherRedemptionDTO {
  id: string;
  orderCode: string;
  tableName: string;
  customerName: string | null;
  orderStatus: string;
  discountAmount: number;
  releasedAt: string | null;
  createdAt: string;
}

export interface VoucherRedemptionResult {
  items: VoucherRedemptionDTO[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
