"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageBackLinkProps {
  href: string;
  label: string;
  className?: string;
}

export default function PageBackLink({
  href,
  label,
  className,
}: PageBackLinkProps) {
  return (
    <Link
      href={href}
      aria-label={`Back to ${label}`}
      className={cn(
        "group inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      <span>Back</span>
    </Link>
  );
}
