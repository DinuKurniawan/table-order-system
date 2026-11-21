import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export type StatCardVariant = "indigo" | "blue" | "green" | "lemon";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: StatCardVariant;
  className?: string;
  subtext?: string;
}

const variantStyles: Record<
  StatCardVariant,
  {
    cardBg: string;
    iconBoxBg: string;
    iconColor: string;
    textColor: string;
    labelColor: string;
    shadow: string;
  }
> = {
  indigo: {
    cardBg: "bg-primary-600",
    iconBoxBg: "bg-white/15 border-white/25",
    iconColor: "text-white",
    textColor: "text-white",
    labelColor: "text-white",
    shadow: "shadow-[0_8px_20px_rgba(75,47,224,0.22)]",
  },
  blue: {
    cardBg: "bg-accent-blue",
    iconColor: "text-white",
    iconBoxBg: "bg-white/15 border-white/25",
    textColor: "text-white",
    labelColor: "text-white",
    shadow: "shadow-[0_8px_20px_rgba(69,165,245,0.22)]",
  },
  green: {
    cardBg: "bg-accent-green",
    iconColor: "text-white",
    iconBoxBg: "bg-white/15 border-white/25",
    textColor: "text-white",
    labelColor: "text-white",
    shadow: "shadow-[0_8px_20px_rgba(31,197,142,0.22)]",
  },
  lemon: {
    cardBg: "bg-accent-lime",
    iconColor: "text-white",
    iconBoxBg: "bg-white/20 border-white/30",
    textColor: "text-white font-extrabold",
    labelColor: "text-white font-medium drop-shadow-sm",
    shadow: "shadow-[0_8px_20px_rgba(141,198,63,0.22)]",
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  variant = "indigo",
  className,
  subtext,
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "relative flex items-center justify-between overflow-hidden rounded-[20px] p-6 text-white transition-all duration-200 hover:-translate-y-0.5",
        styles.cardBg,
        styles.shadow,
        className
      )}
    >
      <div className="flex items-center gap-4">
        {/* Outlined / Translucent square icon box on the left */}
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-xs",
            styles.iconBoxBg
          )}
        >
          <Icon className={cn("size-7", styles.iconColor)} strokeWidth={2.2} />
        </div>
      </div>

      {/* Label and bold number on the right */}
      <div className="text-right">
        <span className={cn("text-xs tracking-wide block mb-1 font-medium", styles.labelColor)}>
          {title}
        </span>
        <div className={cn("text-3xl font-extrabold tracking-tight sm:text-4xl tabular-nums", styles.textColor)}>
          {value}
        </div>
        {subtext && (
          <span className="text-[11px] text-white mt-1 block">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}
