"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeEvent, RealTimeEvent } from "@/lib/pusher-client";
import { emitToChannel } from "@/lib/pusher-server";
import { SectionCard } from "@/components/admin/section-card";

type LogEntry = {
  event: RealTimeEvent;
  payload: unknown;
  timestamp: string;
};

export default function RealTimeTestPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const queryClient = useQueryClient();

  // Hook level atas (aturan hooks): berlangganan event user.deactivated.
  useRealtimeEvent("private-admin", "user.deactivated", (payload) => {
    const timestamp = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setLogs((prev) => [
      { event: "user.deactivated", payload, timestamp },
      ...prev.slice(0, 49),
    ]);
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    void fetch("/api/auth/logout", { method: "POST" });
  });

  // ============================================================
  // Kirim event uji
  // ============================================================
  const sendTestEvent = (event: RealTimeEvent) => {
    emitToChannel("private-admin", event, {
      test: true,
      timestamp: new Date().toISOString(),
    });
  };

  // ============================================================
  // Reset logs
  // ============================================================
  const resetLogs = () => setLogs([]);

  return (
    <SectionCard title="Realtime Test - Diagnostik">
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Button
            onClick={() => sendTestEvent("order.created")}
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            Kirim order.created
          </Button>
          <Button
            onClick={() => sendTestEvent("payment.uploaded")}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Kirim payment.uploaded
          </Button>
          <Button
            onClick={() => sendTestEvent("order.status_changed")}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            Kirim order.status_changed
          </Button>
          <Button
            onClick={() => sendTestEvent("user.deactivated")}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Kirim user.deactivated
          </Button>
        </div>

        <div className="mt-3">
          <Button onClick={resetLogs} className="text-sm text-gray-500 hover:underline">
            Reset log
          </Button>
        </div>
      </div>

      <div className="h-96 border rounded overflow-auto">
        <div className="p-3 text-sm text-text-muted">
          {logs.length === 0 && (
            <p className="text-center text-text-muted">
              Belum ada event terkirim. Kirim event uji di atas.
            </p>
          )}
          {logs.map((log, idx) => (
            <div
              key={idx}
              className="flex gap-2 border-b last:border-0 py-2"
            >
              <span
                className="px-2 rounded text-[0.75em] font-medium"
                style={{
                  background:
                    log.event === "user.deactivated"
                      ? "bg-red-100"
                      : log.event === "order.created"
                        ? "bg-primary-100"
                        : "#fff",
                  color:
                    log.event === "user.deactivated"
                      ? "red"
                      : log.event === "order.created"
                        ? "primary"
                        : "inherit",
                }}
              >
                {log.event}
              </span>
              <span className="flex-1 truncate">
                {JSON.stringify(log.payload).substring(0, 80)}...
              </span>
              <span className="text-[0.65em] text-text-muted">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}