"use client";

/**
 * Shared "Admin / HR review decision" UI for the engagement module pages
 * (Kaizen, Suggestion, Problem, Initiative, Target). Each page fetches its
 * own review map via `useEngagementReviews(moduleType)` and renders:
 *   - <ReviewCell>   in the list table (compact badge)
 *   - <ReviewBanner> in the detail preview (full-width status banner)
 *
 * The data comes from GET /api/engagement/awards (org-scoped, read-only
 * for employees). `reviewStatus` is the admin/HR decision; "rejected" is
 * surfaced to employees as "Not Approved".
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, HelpCircle, Clock, Info } from "lucide-react";

export type EngagementReview = {
  status: string;
  reviewer: string | null;
  points: number | null;
};
export type ReviewMap = Record<string, EngagementReview>;

export function useEngagementReviews(moduleType: string, depKey?: unknown): ReviewMap {
  const [map, setMap] = React.useState<ReviewMap>({});
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/engagement/awards", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const next: ReviewMap = {};
        for (const a of data.awards as Array<{
          submissionId: string;
          moduleType: string;
          reviewStatus: string | null;
          reviewerName: string | null;
          points: number | null;
        }>) {
          if (a.moduleType === moduleType && a.reviewStatus) {
            next[a.submissionId] = {
              status: a.reviewStatus,
              reviewer: a.reviewerName ?? null,
              points: a.points ?? null,
            };
          }
        }
        setMap(next);
      } catch {
        /* ignore — badge just won't show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleType, depKey]);
  return map;
}

const META: Record<
  string,
  { label: string; badge: string; banner: string; icon: React.ElementType }
> = {
  approved: {
    label: "Approved",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    banner: "bg-emerald-50 border-emerald-200 text-emerald-800",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Not Approved",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    banner: "bg-rose-50 border-rose-200 text-rose-800",
    icon: XCircle,
  },
  "needs-info": {
    label: "Needs Info",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    banner: "bg-blue-50 border-blue-200 text-blue-800",
    icon: HelpCircle,
  },
  pending: {
    label: "Pending",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    banner: "bg-amber-50 border-amber-200 text-amber-800",
    icon: Clock,
  },
};

export function ReviewCell({ review }: { review?: EngagementReview }) {
  if (!review) return <span className="text-[10px] text-muted-foreground italic">Awaiting</span>;
  const m = META[review.status];
  if (!m) return <span className="text-[10px] text-muted-foreground italic">—</span>;
  return (
    <Badge variant="outline" className={`text-[10px] uppercase border ${m.badge}`}>
      {m.label}
    </Badge>
  );
}

export function ReviewBanner({ review }: { review?: EngagementReview }) {
  const m = review ? META[review.status] : undefined;
  if (!m) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4" /> Awaiting review by Admin / HR.
      </div>
    );
  }
  const RIcon = m.icon;
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border p-3 ${m.banner}`}>
      <span className="flex items-center gap-2 text-sm font-semibold">
        <RIcon className="h-4 w-4" /> {m.label}
        {review?.reviewer && <span className="font-normal opacity-80">· by {review.reviewer}</span>}
      </span>
      {typeof review?.points === "number" && (
        <span className="text-sm font-bold">{review.points} pts</span>
      )}
    </div>
  );
}
