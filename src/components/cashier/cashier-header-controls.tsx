"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionIndicator } from "@/components/admin/connection-indicator";
import { usePusherChannel } from "@/lib/pusher-client";
import { setSoundEnabled, useSoundEnabled } from "@/lib/cashier-audio";

export function CashierHeaderControls() {
  const { connectionStatus } = usePusherChannel("private-cashier");
  const soundEnabled = useSoundEnabled();

  const status =
    connectionStatus === "connected"
      ? "connected"
      : connectionStatus === "connecting"
      ? "connecting"
      : "disconnected";

  return (
    <div className="flex items-center gap-3">
      <ConnectionIndicator status={status} showLabel />
      <Button
        type="button"
        variant={soundEnabled ? "secondary" : "outline"}
        size="sm"
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="h-8 gap-1.5 rounded-xl text-xs"
        title={soundEnabled ? "Matikan suara notifikasi" : "Aktifkan suara notifikasi"}
      >
        {soundEnabled ? (
          <Volume2 className="size-3.5" />
        ) : (
          <VolumeX className="size-3.5" />
        )}
        <span className="hidden md:inline">
          {soundEnabled ? "Suara Aktif" : "Aktifkan suara"}
        </span>
      </Button>
    </div>
  );
}
