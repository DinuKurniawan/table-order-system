import * as React from "react";
import { cn } from "@/lib/utils";

export type PillVariant =
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral";

interface PillBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
  children: React.ReactNode;
}

const pillVariantStyles: Record<PillVariant, string> = {
  primary: "bg-primary-50 text-primary-800 border-primary-200/50",
  success: "bg-[#E3F8F1] text-[#0E8F66] border-[#0E8F66]/20",
  info: "bg-[#E4F2FE] text-[#1E7BD0] border-[#1E7BD0]/20",
  warning: "bg-[#FEF1DF] text-[#B26A0C] border-[#B26A0C]/20",
  danger: "bg-[#FDE8E9] text-[#C22F35] border-[#C22F35]/20",
  neutral: "bg-[#EDEDF3] text-[#5B5B73] border-[#5B5B73]/20",
};

export function PillBadge({
  variant = "neutral",
  className,
  children,
  ...props
}: PillBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        pillVariantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
