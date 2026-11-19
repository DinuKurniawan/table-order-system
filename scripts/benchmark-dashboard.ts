/**
 * Benchmark agregasi dashboard terhadap data demo.
 * Jalankan: npm run bench:dashboard
 */
import { getDashboard, type DashboardRange } from "../src/server/services/dashboard";
import { prisma } from "../src/lib/db";

const RANGES: DashboardRange[] = ["today", "week", "month", "year"];
const RUNS = 30;

const PROFILE = { name: "Benchmark", role: "SUPER_ADMIN" };

async function main() {
  for (const range of RANGES) {
    await getDashboard(range, PROFILE);
    const durations: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now();
      await getDashboard(range, PROFILE);
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.min(durations.length - 1, Math.ceil(0.95 * durations.length) - 1)];
    console.log(
      `${range.padEnd(6)} min=${durations[0].toFixed(1)}ms ` +
        `median=${durations[Math.floor(durations.length / 2)].toFixed(1)}ms ` +
        `p95=${p95.toFixed(1)}ms`
    );
  }
  const orders = await prisma.order.count();
  const payments = await prisma.payment.count();
  console.log(`rows: orders=${orders} payments=${payments}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
