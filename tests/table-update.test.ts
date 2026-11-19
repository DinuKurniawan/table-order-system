import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { tableUpdateSchema } from "../src/lib/validators/table";
import { updateTable } from "../src/server/services/tables";

const prisma = new PrismaClient();

test("S-01: update meja parsial tidak mengaktifkan ulang meja", async (t) => {
  const stamp = Date.now();
  const admin = await prisma.user.create({
    data: {
      name: `Admin Meja ${stamp}`,
      username: `admin-meja-${stamp}`,
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  const table = await prisma.table.create({
    data: {
      name: `Meja Nonaktif ${stamp}`,
      token: `meja-nonaktif-${stamp}`,
      isActive: false,
    },
  });

  t.after(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: table.id } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  assert.deepEqual(tableUpdateSchema.parse({ name: "Baru" }), {
    name: "Baru",
  });

  const updated = await updateTable(
    table.id,
    { name: `Meja Baru ${stamp}` },
    admin.id
  );
  assert.equal(updated.isActive, false, "isActive tidak boleh ikut berubah");
});
