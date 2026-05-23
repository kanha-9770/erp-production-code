"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

export function DetailShell({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  actions,
  children,
}: {
  backHref: string;
  backLabel?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {backLabel}
            </Link>
          </Button>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>

        <div className="rounded-xl border bg-background shadow-sm p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle ? (
                <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>
              ) : null}
            </div>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

export function DetailLoading() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailNotFound({
  backHref,
  message = "This record no longer exists or you don’t have access to view it.",
}: {
  backHref: string;
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto max-w-3xl p-6">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Link>
        </Button>
        <Card className="p-10 text-center">
          <h2 className="text-lg font-semibold">Record not found</h2>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </Card>
      </div>
    </div>
  );
}

export function DetailSection({
  title,
  icon,
  className,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
        {icon}
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </Card>
  );
}

export function DetailFact({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  const display =
    value == null || value === "" || value === "—" ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      value
    );
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>{display}</div>
    </div>
  );
}

export function fmtDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtMoney(value: string | number | null | undefined, currency = "₹") {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency}${n.toLocaleString()}`;
}

export function fmtBool(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}
