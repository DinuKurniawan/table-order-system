import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon, PackageOpen } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-[18px] border border-dashed border-border bg-surface-muted/50",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 mb-3.5">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-text-strong">{title}</h3>
      {description && (
        <p className="text-xs text-text-muted max-w-sm mt-1.5 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
