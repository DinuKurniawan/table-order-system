"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintRunner({ orderId }: { orderId: string }) {
  const printed = React.useRef(false);

  const markPrinted = React.useCallback(() => {
    void fetch(`/api/cashier/orders/${orderId}/print`, { method: "POST" }).catch(
      () => undefined
    );
  }, [orderId]);

  React.useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => {
      markPrinted();
      window.print();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [markPrinted]);

  return (
    <Button
      className="gap-1.5 print:hidden"
      onClick={() => {
        markPrinted();
        window.print();
      }}
    >
      <Printer className="size-4" />
      Cetak
    </Button>
  );
}
