import type { CSSProperties } from "react";

export type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "xl" | "2xl" | "pill";
  style?: CSSProperties;
};

const ROUNDED = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  pill: "rounded-pill"
} as const;

// Generic skeleton block. Compose to build skeleton screens for any layout.
// Animation is a subtle opacity pulse — less distracting than the classic shimmer.
export function Skeleton({ className = "", width, height, rounded = "md", style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        "block animate-pulse-soft bg-surface-container dark:bg-dark-surfaceContainer",
        ROUNDED[rounded],
        className
      ].join(" ")}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style
      }}
    />
  );
}

// Pre-baked variant for product grids — image well + two text lines + button stub.
export function SkeletonProductCard() {
  return (
    <div className="tactile-pop overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-bright dark:bg-dark-surface dark:border-dark-outline">
      <Skeleton height={200} rounded="md" className="!rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton height={14} width="40%" />
        <Skeleton height={22} width="80%" />
        <Skeleton height={14} width="60%" />
        <div className="flex items-center justify-between pt-3">
          <Skeleton height={28} width={90} rounded="pill" />
          <Skeleton height={36} width={120} rounded="pill" />
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
