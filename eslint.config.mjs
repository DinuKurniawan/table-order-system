import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Audit T-03: semua transaksi wajib lewat runInTransaction agar event
  // hanya dikirim setelah commit. `src/lib/tx.ts` adalah satu-satunya
  // tempat yang boleh memanggil prisma.$transaction.
  {
    files: ["src/server/services/**/*.ts", "src/app/api/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='$transaction']",
          message:
            "Jangan panggil prisma.$transaction langsung. Gunakan runInTransaction dari @/lib/tx dan daftarkan event lewat after() (audit T-03).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
