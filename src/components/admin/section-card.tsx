import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
  ...props
}: SectionCardProps) {
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-surface p-6 shadow-card transition-shadow duration-200",
        className
      )}
      {...props}
    >
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-5 border-b border-border/60">
          <div>
            {title && (
              <h2 className="text-base font-bold text-text-strong tracking-tight sm:text-lg">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
