"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={
        "rounded-lg bg-ink px-4 py-2 font-medium text-cream transition disabled:cursor-not-allowed " +
        "disabled:opacity-50 hover:opacity-90 " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={"rounded-xl border border-ink/20 bg-cream/60 p-5 shadow-sm " + className}>{children}</div>
  );
}

export function StatusBadge({ kind, children }: { kind: "ok" | "warn" | "info"; children: ReactNode }) {
  const tone =
    kind === "ok"
      ? "bg-green-700 text-white"
      : kind === "warn"
        ? "bg-amber-600 text-white"
        : "bg-ink text-cream";
  return <span className={"inline-block rounded-full px-2.5 py-0.5 text-xs font-medium " + tone}>{children}</span>;
}
