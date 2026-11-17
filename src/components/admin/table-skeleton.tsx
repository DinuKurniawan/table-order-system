import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className="flex items-center gap-4 border-b border-border pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`header-${i}`}
            className="h-4 flex-1 rounded-md bg-surface-muted"
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={`row-${r}`}
          className="flex items-center gap-4 py-3 border-b border-border/40"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={`cell-${r}-${c}`}
              className={cn(
                "h-5 flex-1 rounded-md bg-surface-muted",
                c === 0 && "w-1/3 flex-none"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
