import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { describeAudit } from "@/lib/audit";

function isWibDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00+07:00`);
  return !Number.isNaN(parsed.getTime());
}

const wibDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine(isWibDate, "Tanggal tidak valid");

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  userId: z.string().trim().max(64).optional(),
  action: z.string().trim().max(100).optional(),
  from: wibDate.optional(),
  to: wibDate.optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditItem {
  id: string;
  action: string;
  text: string;
  entity: string;
  entityId: string;
  meta: unknown;
  actor: { id: string; name: string; username: string } | null;
  createdAt: string;
}

export interface AuditFilterOption {
  value: string;
  label: string;
}

export interface AuditPage {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: {
    actions: AuditFilterOption[];
    users: AuditFilterOption[];
  };
}

function startOfWibDay(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`);
}

function endOfWibDay(day: string): Date {
  return new Date(`${day}T23:59:59.999+07:00`);
}

/**
 * Daftar AuditLog dengan filter pengguna/aksi/rentang tanggal (WIB).
 * Filter tanggal inklusif pada kedua ujung.
 */
export async function listAuditLogs(input: unknown): Promise<AuditPage> {
  const query = auditQuerySchema.parse(input);

  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) createdAt.gte = startOfWibDay(query.from);
  if (query.to) createdAt.lte = endOfWibDay(query.to);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to ? { createdAt } : {}),
  };

  const [rows, total, actionRows, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      text: describeAudit(row.action, row.entity, row.meta),
      entity: row.entity,
      entityId: row.entityId,
      meta: row.meta,
      actor: row.user,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    filters: {
      actions: actionRows.map((row) => ({
        value: row.action,
        label: row.action,
      })),
      users: users.map((user) => ({
        value: user.id,
        label: `${user.name} (${user.username})`,
      })),
    },
  };
}
