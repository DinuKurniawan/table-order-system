import { z } from "zod";

// Zod 4 compiles object validators with `new Function` (JIT). CSP kita
// melarang eval, jadi matikan JIT khusus browser; server tetap memakai JIT.
if (typeof window !== "undefined") {
  z.config({ jitless: true });
}

export { z };
