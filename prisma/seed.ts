import { PrismaClient, CategoryType, DrinkSubtype, Role, StockMoveType } from "@prisma/client";
import * as argon2 from "argon2";
import { nanoid } from "nanoid";
import { passwordPolicyError } from "../src/lib/password-policy";

const prisma = new PrismaClient();

/**
 * SEC-01: tidak ada kredensial fallback. Seed wajib diberi kredensial eksplisit
 * dan menolak password contoh/lemah.
 */
function requireSeedCredentials(): { username: string; password: string } {
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "SEED_ADMIN_USERNAME dan SEED_ADMIN_PASSWORD wajib diisi. Tidak ada lagi kredensial default; lihat README bagian Akun Awal."
    );
  }

  const policyError = passwordPolicyError(password, {
    username,
    production: process.env.NODE_ENV === "production",
  });
  if (policyError) {
    throw new Error(`SEED_ADMIN_PASSWORD ditolak: ${policyError}`);
  }

  return { username, password };
}

async function main() {
  console.log("🌱 Memulai proses seeding database...");

  // 1. Super Admin
  const { username: adminUsername, password: adminPassword } =
    requireSeedCredentials();
  const passwordHash = await argon2.hash(adminPassword);

  const superAdmin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      role: Role.SUPER_ADMIN,
      isActive: true,
      name: "Super Admin",
    },
    create: {
      name: "Super Admin",
      username: adminUsername,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      // Hanya akun baru wajib ganti sandi; seed ulang tidak mengunci admin aktif.
      mustChangePassword: true,
    },
  });
  console.log(`✅ Super Admin siap: ${superAdmin.username}`);

  // 2. Kategori Menu
  const categoriesData = [
    {
      name: "Makanan",
      type: CategoryType.FOOD,
      subtype: null,
      sortOrder: 1,
    },
    {
      name: "Kopi",
      type: CategoryType.DRINK,
      subtype: DrinkSubtype.COFFEE,
      sortOrder: 2,
    },
    {
      name: "Non Kopi",
      type: CategoryType.DRINK,
      subtype: DrinkSubtype.NON_COFFEE,
      sortOrder: 3,
    },
  ];

  const categoriesMap: Record<string, string> = {};

  for (const cat of categoriesData) {
    const createdCat = await prisma.category.upsert({
      where: {
        name_type: {
          name: cat.name,
          type: cat.type,
        },
      },
      update: {
        subtype: cat.subtype,
        sortOrder: cat.sortOrder,
      },
      create: cat,
    });
    categoriesMap[cat.name] = createdCat.id;
  }
  console.log("✅ 3 Kategori siap (Makanan, Kopi, Non Kopi)");

  // 3. 12 Produk Contoh
  const productsData = [
    // Kopi (5 item)
    {
      name: "Espresso",
      categoryName: "Kopi",
      description: "Single shot espresso arabika dengan crema tebal dan aroma kuat.",
      price: 18000,
      stock: 50,
      lowStockThreshold: 10,
    },
    {
      name: "Americano",
      categoryName: "Kopi",
      description: "Espresso arabika disajikan dengan tambahan air panas segar.",
      price: 22000,
      stock: 50,
      lowStockThreshold: 10,
    },
    {
      name: "Kopi Susu Gula Aren",
      categoryName: "Kopi",
      description: "Espresso pilihan berpadu dengan susu murni segar dan sirup gula aren alami.",
      price: 25000,
      stock: 45,
      lowStockThreshold: 10,
    },
    {
      name: "Caffe Latte",
      categoryName: "Kopi",
      description: "Paduan espresso halus dengan susu kukus dan lapisan microfoam lembut.",
      price: 28000,
      stock: 35,
      lowStockThreshold: 5,
    },
    {
      name: "Cappuccino",
      categoryName: "Kopi",
      description: "Kombinasi klasik seimbang antara espresso, susu hangat, dan busa susu tebal.",
      price: 28000,
      stock: 35,
      lowStockThreshold: 5,
    },

    // Non Kopi (4 item)
    {
      name: "Matcha Latte",
      categoryName: "Non Kopi",
      description: "Teh hijau matcha murni dari Uji, Jepang berpadu dengan susu segar creamy.",
      price: 30000,
      stock: 30,
      lowStockThreshold: 5,
    },
    {
      name: "Chocolate Hazelnut",
      categoryName: "Non Kopi",
      description: "Cokelat Belgia pekat dengan sentuhan aroma hazelnut gurih dan manis pas.",
      price: 28000,
      stock: 30,
      lowStockThreshold: 5,
    },
    {
      name: "Earl Grey Milk Tea",
      categoryName: "Non Kopi",
      description: "Seduhan teh hitam Earl Grey dengan aroma bergamot khas dan susu creamy.",
      price: 26000,
      stock: 40,
      lowStockThreshold: 8,
    },
    {
      name: "Lychee Iced Tea",
      categoryName: "Non Kopi",
      description: "Teh melati dingin segar dengan sirup leci manis dan buah leci utuh.",
      price: 22000,
      stock: 45,
      lowStockThreshold: 10,
    },

    // Makanan (3 item)
    {
      name: "Croissant Butter",
      categoryName: "Makanan",
      description: "Pastry mentega renyah berlapis khas Prancis, dipanggang hangat setiap hari.",
      price: 24000,
      stock: 20,
      lowStockThreshold: 5,
    },
    {
      name: "Nasi Goreng Spesial",
      categoryName: "Makanan",
      description: "Nasi goreng bumbu Nusantara disajikan dengan telur mata sapi dan ayam suwir.",
      price: 35000,
      stock: 25,
      lowStockThreshold: 5,
    },
    {
      name: "French Fries Original",
      categoryName: "Makanan",
      description: "Kentang goreng renyah bumbu gurih disajikan dengan saus sambal dan tomat.",
      price: 20000,
      stock: 40,
      lowStockThreshold: 10,
    },
  ];

  for (const prod of productsData) {
    const categoryId = categoriesMap[prod.categoryName];
    if (!categoryId) continue;

    const existingProduct = await prisma.product.findFirst({
      where: {
        name: prod.name,
        categoryId,
      },
    });

    if (existingProduct) {
      await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          description: prod.description,
          price: prod.price,
          lowStockThreshold: prod.lowStockThreshold,
          isActive: true,
          trackStock: true,
        },
      });
    } else {
      const created = await prisma.product.create({
        data: {
          name: prod.name,
          categoryId,
          description: prod.description,
          price: prod.price,
          stock: prod.stock,
          lowStockThreshold: prod.lowStockThreshold,
          isActive: true,
          trackStock: true,
        },
      });

      // Catat pergerakan stok awal
      await prisma.stockMovement.create({
        data: {
          productId: created.id,
          type: StockMoveType.PURCHASE,
          quantity: prod.stock,
          balance: prod.stock,
          note: "Stok awal seeder",
        },
      });
    }
  }
  console.log("✅ 12 Produk contoh beserta stok awal siap");

  // 4. 10 Meja
  for (let i = 1; i <= 10; i++) {
    const tableName = `Meja ${i}`;
    const area = i <= 6 ? "Indoor AC" : "Outdoor Terrace";

    const existingTable = await prisma.table.findUnique({
      where: { name: tableName },
    });

    if (existingTable) {
      await prisma.table.update({
        where: { id: existingTable.id },
        data: {
          area,
          isActive: true,
        },
      });
    } else {
      await prisma.table.create({
        data: {
          name: tableName,
          area,
          token: nanoid(16),
          isActive: true,
        },
      });
    }
  }
  console.log("✅ 10 Meja siap (Meja 1 s.d. Meja 10)");

  // 5. Pengaturan Default
  const defaultSettings = [
    { key: "namaKafe", value: "Kedai Kopi Selaras" },
    { key: "timeoutBayarMenit", value: 15 },
    { key: "maksUploadUlang", value: 3 },
    {
      key: "footerStruk",
      value: "Terima kasih atas kunjungan Anda!\nSilakan datang kembali.",
    },
    { key: "isOrderingOpen", value: true },
  ];

  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: {
        key: s.key,
        value: s.value,
      },
    });
  }
  console.log("✅ Pengaturan default siap");

  // 6. Metode Pembayaran Placeholder
  const paymentMethods = [
    {
      kind: "QRIS",
      label: "QRIS Selaras (Semua e-Wallet & Bank)",
      accountNo: null,
      accountName: "Kedai Kopi Selaras",
      isActive: true,
      sortOrder: 1,
    },
    {
      kind: "BANK",
      label: "Transfer Bank BCA",
      accountNo: "8830192831",
      accountName: "PT Kopi Selaras Indonesia",
      isActive: true,
      sortOrder: 2,
    },
  ];

  for (const pm of paymentMethods) {
    const existing = await prisma.paymentMethod.findFirst({
      where: { label: pm.label },
    });

    if (existing) {
      await prisma.paymentMethod.update({
        where: { id: existing.id },
        data: pm,
      });
    } else {
      await prisma.paymentMethod.create({
        data: pm,
      });
    }
  }
  console.log("✅ Metode pembayaran QRIS & BANK placeholder siap");

  console.log("🎉 Seeding database selesai tanpa kendala!");
}

main()
  .catch((e) => {
    console.error("❌ Terjadi kesalahan saat seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
