"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  MessageSquare,
  ShieldCheck,
  Inbox,
} from "lucide-react";
import { getStatusMeta } from "@/lib/constants/engagement";

// Locale-stable date formatters. `toLocaleDateString()` reads the runtime
// locale, so the server (often en-US in Node) and the client (browser
// locale, often en-GB or en-IN in this app's market) produce different
// strings — which triggers React's hydration mismatch. Pinning the locale
// fixes that and also matches the company's spreadsheet format
// (e.g. "06-Feb-2023 17:45:50").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${fmtDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Award shape returned by GET /api/engagement/awards. The page fetches
// only the submissions belonging to this employee via `?submissionIds=`.
type ReviewStatus = "pending" | "approved" | "rejected" | "needs-info";
type ReviewEntry = {
  status: ReviewStatus;
  reviewer: string;
  reviewedAt: string;
  notes?: string;
};

type AwardRow = {
  submissionId: string;
  points: number | null;
  reviewStatus: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  notes: string | null;
};

const REVIEW_META: Record<
  ReviewStatus,
  {
    label: string;
    icon: React.ElementType;
    badge: "default" | "secondary" | "destructive" | "outline";
    rowTint: string;
  }
> = {
  approved: { label: "Approved", icon: CheckCircle2, badge: "default", rowTint: "bg-emerald-50/40" },
  rejected: { label: "Rejected", icon: XCircle, badge: "destructive", rowTint: "bg-rose-50/40" },
  "needs-info": { label: "Needs Info", icon: HelpCircle, badge: "outline", rowTint: "bg-blue-50/40" },
  pending: { label: "Pending", icon: Clock, badge: "secondary", rowTint: "" },
};

export type EmployeeSubmission = {
  id: string;
  type: "Kaizen" | "Suggestion" | "Problem" | "Initiative" | "Target";
  title: string;
  category: string;
  status: string;
  createdAt: string;
};

export default function EmployeeAwardsView({
  submissions,
}: {
  submissions: EmployeeSubmission[];
}) {
  const [myPoints, setMyPoints] = React.useState<Record<string, number>>({});
  const [myReviews, setMyReviews] = React.useState<Record<string, ReviewEntry>>({});
  const [hydrated, setHydrated] = React.useState(false);

  // Fetch only the awards for THIS employee's submissions. The API
  // already scopes by organization so passing the id list is enough
  // to filter — no extra auth round-trip needed.
  React.useEffect(() => {
    let cancelled = false;
    const ids = submissions.map((s) => s.id);
    if (ids.length === 0) {
      setHydrated(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/engagement/awards?submissionIds=${encodeURIComponent(ids.join(","))}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setHydrated(true);
          return;
        }
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const ptsNext: Record<string, number> = {};
        const revNext: Record<string, ReviewEntry> = {};
        for (const a of data.awards as AwardRow[]) {
          if (typeof a.points === "number") ptsNext[a.submissionId] = a.points;
          if (a.reviewStatus && a.reviewedAt) {
            revNext[a.submissionId] = {
              status: a.reviewStatus as ReviewStatus,
              reviewer: a.reviewerName ?? "Reviewer",
              reviewedAt: a.reviewedAt,
              notes: a.notes ?? undefined,
            };
          }
        }
        setMyPoints(ptsNext);
        setMyReviews(revNext);
      } catch {
        /* ignore — show empty state */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissions]);

  const totalPoints = React.useMemo(
    () => Object.values(myPoints).reduce((s, v) => s + v, 0),
    [myPoints]
  );
  const reviewedCount = Object.keys(myReviews).length;
  const approvedCount = Object.values(myReviews).filter((r) => r.status === "approved").length;
  const rejectedCount = Object.values(myReviews).filter((r) => r.status === "rejected").length;
  const needsInfoCount = Object.values(myReviews).filter((r) => r.status === "needs-info").length;

  // Sort newest-first by createdAt
  const sorted = React.useMemo(
    () =>
      [...submissions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [submissions]
  );

  const reviewedSubs = React.useMemo(
    () => sorted.filter((s) => myReviews[s.id]?.notes),
    [sorted, myReviews]
  );

  return (
    <div className="space-y-6 mt-6">
      {/* ── Admin awards summary ─────────────────────────────────────────── */}
      <Card className="shadow-sm border-primary/30">
        <CardHeader className="pb-4 border-b bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Awards from Admin / HR
          </CardTitle>
          <CardDescription>
            Points and review decisions recorded by your reviewer for the
            submissions below.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryStat label="Total Points" value={totalPoints} icon={Award} tone="primary" />
            <SummaryStat label="Reviewed" value={reviewedCount} icon={ShieldCheck} />
            <SummaryStat label="Approved" value={approvedCount} icon={CheckCircle2} tone="emerald" />
            <SummaryStat label="Rejected" value={rejectedCount} icon={XCircle} tone="rose" />
            <SummaryStat label="Needs Info" value={needsInfoCount} icon={HelpCircle} tone="blue" />
          </div>
          {hydrated && reviewedCount === 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-md border border-dashed">
              <Inbox className="h-4 w-4" />
              No reviews recorded yet. Your reviewer will update this section
              as they go through your submissions.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Full Submission History — decorated with points + review ───── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4 border-b">
          <CardTitle className="text-lg font-semibold">Full Submission History</CardTitle>
          <CardDescription>
            Every submission you&apos;ve made, with points awarded and review
            decision from Admin / HR.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-emerald-100/60 text-emerald-900 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-center">SR No</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Date</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Submission Type</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Submission ID</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Remark</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Status</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right">Points Allotted</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((sub, idx) => {
                  const review = myReviews[sub.id];
                  const meta = review ? REVIEW_META[review.status] : null;
                  const RIcon = meta?.icon;
                  const pts = myPoints[sub.id];
                  return (
                    <tr
                      key={sub.id}
                      className={`hover:bg-muted/30 transition-colors ${meta?.rowTint ?? ""}`}
                    >
                      <td className="px-4 py-3 text-center text-sm text-muted-foreground tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fmtDateTime(sub.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium uppercase">
                        {sub.type}
                        <div className="text-[10px] text-muted-foreground normal-case truncate max-w-[200px]" title={sub.title}>
                          {sub.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {sub.id.substring(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 text-sm max-w-[260px]">
                        {review?.notes ? (
                          <span className="italic text-muted-foreground" title={review.notes}>
                            “{review.notes.length > 60 ? review.notes.slice(0, 60) + "…" : review.notes}”
                          </span>
                        ) : meta && RIcon ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <RIcon className="h-3 w-3" />
                            {meta.label} by {review?.reviewer ?? "Reviewer"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">awaiting review</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const sm = getStatusMeta(sub.status);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${sm.className}`}>
                              {sm.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {typeof pts === "number" ? (
                          <span className="inline-flex items-center gap-1 font-bold text-primary tabular-nums">
                            <Award className="h-3.5 w-3.5" />
                            {pts}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No submissions found for this employee.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Reviewer feedback notes (only if reviewer left a comment) ──── */}
      {reviewedSubs.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              Reviewer Feedback
            </CardTitle>
            <CardDescription>
              Comments left by your reviewer on individual submissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {reviewedSubs.map((sub) => {
              const r = myReviews[sub.id]!;
              const meta = REVIEW_META[r.status];
              const RIcon = meta.icon;
              return (
                <div
                  key={sub.id}
                  className="border rounded-md p-4 space-y-2 bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {sub.type}
                        </Badge>
                        <span className="text-sm font-semibold">{sub.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Submitted {fmtDate(sub.createdAt)} ·
                        Reviewed by <b>{r.reviewer}</b> on{" "}
                        {fmtDateTime(r.reviewedAt)}
                      </p>
                    </div>
                    <Badge variant={meta.badge} className="gap-1">
                      <RIcon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  <blockquote className="text-sm border-l-2 border-primary/40 pl-3 py-1 text-muted-foreground italic">
                    “{r.notes}”
                  </blockquote>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: "default" | "emerald" | "rose" | "blue" | "primary";
}) {
  const tones: Record<string, string> = {
    default: "border-border bg-background",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    primary: "border-primary/30 bg-primary/5 text-primary",
  };
  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold opacity-70">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
