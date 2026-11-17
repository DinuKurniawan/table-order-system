"use client";

import { cn } from "@/lib/utils";

interface ConnectionIndicatorProps {
  status?: "connected" | "connecting" | "disconnected";
  className?: string;
  showLabel?: boolean;
}

export function ConnectionIndicator({
  status = "connected",
  className,
  showLabel = false,
}: ConnectionIndicatorProps) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  const colorClass = isConnected
    ? "bg-accent-green"
    : isConnecting
    ? "bg-accent-orange"
    : "bg-accent-red";

  const label = isConnected
    ? "Realtime Aktif"
    : isConnecting
    ? "Menghubungkan..."
    : "Terputus";

  return (
    <div
      className={cn("flex items-center gap-1.5 text-xs font-medium", className)}
      title={label}
    >
      <span className="relative flex size-2.5">
        {isConnected && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              colorClass
            )}
          />
        )}
        <span
          className={cn("relative inline-flex size-2.5 rounded-full", colorClass)}
        />
      </span>
      {showLabel && (
        <span
          className={cn(
            "text-[11px]",
            isConnected
              ? "text-accent-green font-medium"
              : isConnecting
              ? "text-accent-orange"
              : "text-accent-red"
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
