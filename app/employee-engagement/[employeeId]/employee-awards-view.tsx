"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  MessageSquare,
  ShieldCheck,
  Inbox,
  Eye,
  ImageOff,
  Save,
  Lock,
} from "lucide-react";
import { getStatusMeta } from "@/lib/constants/engagement";
import SubmissionPaperView, {
  type SubmissionPaperData,
} from "@/app/employee-engagement/components/SubmissionPaperView";

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
  bonusPoints: number | null;
  bonusReason: string | null;
  remark: string | null;
  isBestKaizen: boolean | null;
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
    className: string;
  }
> = {
  approved: { label: "Approved", icon: CheckCircle2, badge: "default", rowTint: "bg-emerald-50/40", className: "text-emerald-700" },
  rejected: { label: "Rejected", icon: XCircle, badge: "destructive", rowTint: "bg-rose-50/40", className: "text-rose-700" },
  "needs-info": { label: "Needs Info", icon: HelpCircle, badge: "outline", rowTint: "bg-blue-50/40", className: "text-blue-700" },
  pending: { label: "Pending", icon: Clock, badge: "secondary", rowTint: "", className: "text-amber-700" },
};

const POINTS_MIN = 1;
const POINTS_MAX = 12;
const BONUS_MIN = 0;
const BONUS_MAX = 100;

// Per-module detail payload. Each engagement table stores a different set
// of long-form fields, so the dialog renders only the keys present.
export type SubmissionDetails = {
  description?: string;
  currentState?: string;     // Kaizen
  proposedState?: string;    // Kaizen
  benefits?: string;         // Kaizen
  votes?: number;            // Kaizen
  suggestion?: string;       // Suggestion
  feedback?: string | null;  // Suggestion
  severity?: string;         // Problem
  proposedSolution?: string; // Problem
  startDate?: string;        // Initiative
  endDate?: string;          // Initiative
  targetDate?: string;       // Target
  progress?: number;         // Target
};

export type EmployeeSubmission = {
  id: string;
  // Per-module sequential identifier (e.g. "NK-001"). Falls back to a
  // cuid prefix for rows that pre-date the displayId column.
  displayId: string;
  endDate?: string | null;
  type: "Kaizen" | "Suggestion" | "Problem" | "Initiative" | "Target";
  title: string;
  category: string;
  status: string;
  createdAt: string;
  // `referenceImage` is the single legacy media slot used by every
  // engagement table. Kaizen additionally has `beforeMedia`/`afterMedia`
  // to mirror the form (Problem & Analysis → Before / After).
  referenceImage?: string | null;
  beforeMedia?: string | null;
  afterMedia?: string | null;
  details?: SubmissionDetails;
};

// `referenceImage` may be a real URL, a data URL, or just a stored
// filename (older submissions). Render an <img> only when it looks like
// something the browser can resolve.
function isRenderableImage(src: string | null | undefined): src is string {
  if (!src) return false;
  if (src.startsWith("data:image/")) return true;
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")) return true;
  return false;
}

export default function EmployeeAwardsView({
  submissions,
  canReview = false,
  currentUserName = "Reviewer",
  employee,
}: {
  submissions: EmployeeSubmission[];
  canReview?: boolean;
  currentUserName?: string;
  // Identity strip rendered in the paper-form View dialog. Optional —
  // when omitted, the cells render an em-dash.
  employee?: {
    employeeId: string;
    name: string;
    department: string;
    teamName?: string | null;
  };
}) {
  const [myPoints, setMyPoints] = React.useState<Record<string, number>>({});
  const [myBonus, setMyBonus] = React.useState<Record<string, { points: number; reason: string | null }>>({});
  const [myRemarks, setMyRemarks] = React.useState<Record<string, string>>({});
  const [myBestKaizen, setMyBestKaizen] = React.useState<Record<string, boolean>>({});
  const [myReviews, setMyReviews] = React.useState<Record<string, ReviewEntry>>({});
  const [hydrated, setHydrated] = React.useState(false);

  // Detail dialog state. When non-null, the dialog renders the full form
  // payload for that submission. Admin/HR can also award points + record
  // a review from inside the dialog (one stop for scoring contributions).
  const [detailFor, setDetailFor] = React.useState<EmployeeSubmission | null>(null);
  const [detailStatus, setDetailStatus] = React.useState<ReviewStatus>("approved");
  const [detailNotes, setDetailNotes] = React.useState("");
  const [detailPoints, setDetailPoints] = React.useState<string>("");
  const [detailBonus, setDetailBonus] = React.useState<string>("");
  const [detailBonusReason, setDetailBonusReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

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
        const bonusNext: Record<string, { points: number; reason: string | null }> = {};
        const remarkNext: Record<string, string> = {};
        const bestNext: Record<string, boolean> = {};
        const revNext: Record<string, ReviewEntry> = {};
        for (const a of data.awards as AwardRow[]) {
          if (typeof a.points === "number") ptsNext[a.submissionId] = a.points;
          if (typeof a.bonusPoints === "number" && a.bonusPoints > 0) {
            bonusNext[a.submissionId] = { points: a.bonusPoints, reason: a.bonusReason ?? null };
          }
          if (typeof a.remark === "string" && a.remark.trim()) {
            remarkNext[a.submissionId] = a.remark;
          }
          if (a.isBestKaizen) bestNext[a.submissionId] = true;
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
        setMyBonus(bonusNext);
        setMyRemarks(remarkNext);
        setMyBestKaizen(bestNext);
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
  const totalBonusPoints = React.useMemo(
    () => Object.values(myBonus).reduce((s, v) => s + v.points, 0),
    [myBonus]
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

  const openDetail = (sub: EmployeeSubmission) => {
    setDetailFor(sub);
    const existingReview = myReviews[sub.id];
    setDetailStatus(existingReview?.status ?? "approved");
    setDetailNotes(existingReview?.notes ?? "");
    const existingPts = myPoints[sub.id];
    setDetailPoints(typeof existingPts === "number" ? String(existingPts) : "");
    const existingBonus = myBonus[sub.id];
    setDetailBonus(existingBonus ? String(existingBonus.points) : "");
    setDetailBonusReason(existingBonus?.reason ?? "");
  };

  const closeDetail = () => {
    if (saving) return;
    setDetailFor(null);
    setDetailNotes("");
    setDetailPoints("");
    setDetailBonus("");
    setDetailBonusReason("");
  };

  // Submit review + points from the detail dialog. Mirrors the
  // dashboard's award POST — server validates reviewer role.
  const submitReviewerDecision = async () => {
    if (!detailFor || !canReview) return;
    setSaving(true);

    const trimmedNotes = detailNotes.trim();
    const trimmedBonusReason = detailBonusReason.trim();
    let pointsValue: number | null | undefined = undefined;
    if (detailPoints === "") {
      pointsValue = null;
    } else {
      const n = Math.floor(Number(detailPoints));
      if (Number.isFinite(n)) {
        pointsValue = Math.max(POINTS_MIN, Math.min(POINTS_MAX, n));
      }
    }
    let bonusValue: number | null | undefined = undefined;
    if (detailBonus === "") {
      bonusValue = null;
    } else {
      const n = Math.floor(Number(detailBonus));
      if (Number.isFinite(n)) {
        bonusValue = Math.max(BONUS_MIN, Math.min(BONUS_MAX, n));
      }
    }

    try {
      const res = await fetch("/api/engagement/awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: detailFor.id,
          moduleType: detailFor.type,
          points: pointsValue,
          bonusPoints: bonusValue,
          bonusReason: trimmedBonusReason || null,
          reviewStatus: detailStatus,
          notes: trimmedNotes || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Failed to save. Please try again.");
        return;
      }
      // Optimistic local update so the table reflects the change.
      const nextReviews = {
        ...myReviews,
        [detailFor.id]: {
          status: detailStatus,
          reviewer: currentUserName,
          reviewedAt: new Date().toISOString(),
          notes: trimmedNotes || undefined,
        } satisfies ReviewEntry,
      };
      setMyReviews(nextReviews);
      const nextPoints = { ...myPoints };
      if (typeof pointsValue === "number") {
        nextPoints[detailFor.id] = pointsValue;
      } else if (pointsValue === null) {
        delete nextPoints[detailFor.id];
      }
      setMyPoints(nextPoints);
      const nextBonus = { ...myBonus };
      if (typeof bonusValue === "number" && bonusValue > 0) {
        nextBonus[detailFor.id] = { points: bonusValue, reason: trimmedBonusReason || null };
      } else if (bonusValue === null || bonusValue === 0) {
        delete nextBonus[detailFor.id];
      }
      setMyBonus(nextBonus);
      setDetailFor(null);
    } catch {
      alert("Network error saving award.");
    } finally {
      setSaving(false);
    }
  };

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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <SummaryStat label="Total Points" value={totalPoints} icon={Award} tone="primary" />
            <SummaryStat label="Bonus Points" value={totalBonusPoints} icon={Award} tone="amber" />
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
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg font-semibold">Full Submission History</CardTitle>
              <CardDescription>
                Every submission you&apos;ve made, with points awarded and review
                decision from Admin / HR. Click <b>View</b> to see the full
                form the employee filled, including reference images.
              </CardDescription>
            </div>
            {canReview ? (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Reviewer mode
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> View only
              </Badge>
            )}
          </div>
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
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-right">Bonus Points</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((sub, idx) => {
                  const review = myReviews[sub.id];
                  const meta = review ? REVIEW_META[review.status] : null;
                  const RIcon = meta?.icon;
                  const pts = myPoints[sub.id];
                  const hasImage = isRenderableImage(sub.referenceImage);
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
                        {sub.displayId || sub.id.substring(0, 8).toUpperCase()}
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
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const b = myBonus[sub.id];
                          if (!b) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <span
                              className="inline-flex items-center gap-1 font-bold text-amber-700 tabular-nums"
                              title={b.reason ?? "Bonus points awarded"}
                            >
                              <Award className="h-3.5 w-3.5" />
                              +{b.points}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => openDetail(sub)}
                          title="View full form details"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                          {sub.type === "Kaizen" && hasImage && (
                            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-purple-500" title="Has reference image" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
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

      {/* ── Submission detail dialog (full form + image + scoring) ─────── */}
      <Dialog open={!!detailFor} onOpenChange={(o) => { if (!o) closeDetail(); }}>
        <DialogContent className="!max-w-[min(1400px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto">
          {detailFor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {detailFor.type}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {detailFor.displayId || detailFor.id.substring(0, 8).toUpperCase()}
                  </span>
                </DialogTitle>
                <DialogDescription>{detailFor.title}</DialogDescription>
              </DialogHeader>

              {(() => {
                const d = detailFor.details ?? {};
                const paper: SubmissionPaperData = {
                  module: detailFor.type,
                  displayId: detailFor.displayId || detailFor.id.substring(0, 8).toUpperCase(),
                  title: detailFor.title,
                  status: detailFor.status,
                  category: detailFor.category,
                  createdAt: detailFor.createdAt,
                  endDate: detailFor.endDate ?? d.endDate ?? null,
                  employee: {
                    employeeId: employee?.employeeId ?? "—",
                    name: employee?.name ?? "—",
                    department: employee?.department ?? "—",
                    teamName: employee?.teamName ?? null,
                  },
                  description: d.description,
                  currentState: d.currentState,
                  proposedState: d.proposedState,
                  benefits: d.benefits,
                  suggestion: d.suggestion,
                  feedback: d.feedback ?? null,
                  severity: d.severity,
                  proposedSolution: d.proposedSolution,
                  startDate: d.startDate,
                  targetDate: d.targetDate,
                  progress: d.progress,
                  votes: d.votes,
                  beforeMedia: detailFor.beforeMedia ?? null,
                  afterMedia: detailFor.afterMedia ?? null,
                  referenceImage: detailFor.referenceImage ?? null,
                  points: typeof myPoints[detailFor.id] === "number" ? myPoints[detailFor.id] : null,
                  bonusPoints: myBonus[detailFor.id]?.points ?? null,
                  bonusReason: myBonus[detailFor.id]?.reason ?? null,
                  remark: myRemarks[detailFor.id] ?? null,
                  isBestKaizen: !!myBestKaizen[detailFor.id],
                  reviewStatus: myReviews[detailFor.id]?.status ?? null,
                  reviewerName: myReviews[detailFor.id]?.reviewer ?? null,
                };
                return <SubmissionPaperView data={paper} />;
              })()}

              {/* Reviewer scoring panel — visible only to Admin / HR */}
              <div className="mt-2 border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Admin / HR Review &amp; Points
                </h4>
                {!canReview && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-md border border-dashed">
                    <Lock className="h-3.5 w-3.5" />
                    Read-only view. Awarding points and reviewing is restricted
                    to Admin / HR.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(REVIEW_META) as ReviewStatus[]).map((s) => {
                    const meta = REVIEW_META[s];
                    const Icon = meta.icon;
                    const isOn = detailStatus === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!canReview || saving}
                        onClick={() => setDetailStatus(s)}
                        className={`flex items-center gap-2 rounded-md border p-2.5 text-left transition-all ${
                          isOn ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"
                        } ${!canReview ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <Icon className={`h-4 w-4 ${meta.className}`} />
                        <span className="text-sm font-medium">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      Reviewer Notes
                    </label>
                    <Textarea
                      value={detailNotes}
                      onChange={(e) => setDetailNotes(e.target.value)}
                      placeholder="Add a comment visible to the employee…"
                      className="mt-1 min-h-[70px]"
                      disabled={!canReview || saving}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      Points (1–12)
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={POINTS_MIN}
                        max={POINTS_MAX}
                        step={1}
                        value={detailPoints}
                        onChange={(e) => setDetailPoints(e.target.value)}
                        disabled={!canReview || saving}
                        placeholder="—"
                        className="text-center font-semibold tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">/ {POINTS_MAX}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Award 1–12 points based on contribution quality.
                    </p>
                  </div>
                </div>
                {myReviews[detailFor.id] && (
                  <p className="text-xs text-muted-foreground">
                    Last reviewed by <b>{myReviews[detailFor.id].reviewer}</b>{" "}
                    on {fmtDateTime(myReviews[detailFor.id].reviewedAt)}.
                  </p>
                )}
              </div>

              {/* ── Bonus Points (separate from the merit-based 1–12) ── */}
              <div className="mt-2 border-t pt-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-600" />
                    Bonus Points
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Optional discretionary bonus (0–{BONUS_MAX}) layered on top
                    of the regular Points above. Use to spotlight an
                    outstanding contribution — does not affect the review
                    decision.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div>
                    <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      Bonus (0–{BONUS_MAX})
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={BONUS_MIN}
                        max={BONUS_MAX}
                        step={1}
                        value={detailBonus}
                        onChange={(e) => setDetailBonus(e.target.value)}
                        disabled={!canReview || saving}
                        placeholder="—"
                        className="text-center font-semibold tabular-nums border-amber-200 bg-amber-50/40 focus-visible:ring-amber-300"
                      />
                      <span className="text-xs text-muted-foreground">/ {BONUS_MAX}</span>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      Bonus Reason (optional)
                    </label>
                    <Textarea
                      value={detailBonusReason}
                      onChange={(e) => setDetailBonusReason(e.target.value)}
                      placeholder="Why is this bonus being awarded? (visible to the employee)"
                      className="mt-1 min-h-[60px]"
                      disabled={!canReview || saving}
                    />
                  </div>
                </div>
                {myBonus[detailFor.id] && (
                  <p className="text-xs text-amber-700">
                    Current bonus: <b>+{myBonus[detailFor.id].points}</b>
                    {myBonus[detailFor.id].reason && (
                      <> — “{myBonus[detailFor.id].reason}”</>
                    )}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2 sm:justify-end">
                <Button variant="outline" size="sm" onClick={closeDetail} disabled={saving}>
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={submitReviewerDecision}
                  disabled={!canReview || saving}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {saving ? "Saving…" : "Save Decision & Points"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────

function SubmissionDetailBody({ submission }: { submission: EmployeeSubmission }) {
  const d = submission.details ?? {};

  // Build the media list in the same order the submission form
  // arranges them. For Kaizen that's Before Media → After Media (under
  // "Problem & Analysis"). Other modules currently have only one slot.
  const mediaSlots: { label: string; value: string | null | undefined }[] =
    submission.type === "Kaizen"
      ? [
          { label: "Before Media", value: submission.beforeMedia ?? submission.referenceImage },
          { label: "After Media", value: submission.afterMedia },
        ]
      : [{ label: "Reference Image", value: submission.referenceImage }];
  const hasAnyMedia = mediaSlots.some((m) => !!m.value);

  return (
    <div className="space-y-4">
      {/* Header meta row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <MetaCell label="Submission ID" value={submission.displayId || submission.id.substring(0, 8).toUpperCase()} />
        <MetaCell label="Submitted" value={fmtDateTime(submission.createdAt)} />
        <MetaCell label="Category" value={submission.category} />
        <MetaCell label="Status" value={getStatusMeta(submission.status).label} />
        {typeof d.votes === "number" && <MetaCell label="Votes" value={String(d.votes)} />}
        {d.severity && <MetaCell label="Severity" value={d.severity} />}
        {d.startDate && <MetaCell label="Start Date" value={d.startDate} />}
        {d.endDate && <MetaCell label="End Date (planned)" value={d.endDate} />}
        {submission.endDate && <MetaCell label="End Date" value={submission.endDate} />}
        {d.targetDate && <MetaCell label="Target Date" value={d.targetDate} />}
        {typeof d.progress === "number" && <MetaCell label="Progress" value={`${d.progress}%`} />}
      </div>

      {/* Form body — only render fields that exist on this module */}
      <div className="space-y-3">
        {d.description && (
          <DetailBlock label="Description" body={d.description} />
        )}
        {d.suggestion && (
          <DetailBlock label="Suggestion" body={d.suggestion} />
        )}
        {d.currentState && (
          <DetailBlock label="Current State" body={d.currentState} accent="amber" />
        )}
        {d.proposedState && (
          <DetailBlock label="Proposed State" body={d.proposedState} accent="emerald" />
        )}
        {d.benefits && (
          <DetailBlock label="Benefits" body={d.benefits} accent="primary" />
        )}
        {d.proposedSolution && (
          <DetailBlock label="Proposed Solution" body={d.proposedSolution} accent="emerald" />
        )}
        {d.feedback && (
          <DetailBlock label="Feedback / Notes" body={d.feedback} />
        )}
      </div>

      {/* Media — rendered in the same order as the submission form. Each
          slot renders an <img> when the stored value is a URL / data URL,
          falling back to the filename so the reviewer still knows an
          attachment exists. */}
      {hasAnyMedia && (
        <div className="rounded-md border bg-purple-50/40 p-3 space-y-3">
          <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">
            Submitted Media
          </div>
          <div className={`grid gap-3 ${mediaSlots.length > 1 ? "md:grid-cols-2" : ""}`}>
            {mediaSlots.map((m) => (
              <MediaSlot key={m.label} label={m.label} value={m.value ?? null} title={submission.title} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaSlot({ label, value, title }: { label: string; value: string | null; title: string }) {
  const renderable = isRenderableImage(value);
  return (
    <div className="rounded-md border bg-white p-2 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {!value ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-1 py-3">
          <ImageOff className="h-3.5 w-3.5" />
          Not provided
        </div>
      ) : renderable ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={`${label} for ${title}`}
          className="max-h-[320px] w-full rounded border bg-white object-contain"
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-purple-900">
          <ImageOff className="h-4 w-4 flex-shrink-0" />
          <span className="font-mono text-xs truncate" title={value}>{value}</span>
        </div>
      )}
    </div>
  );
}

function DetailBlock({
  label,
  body,
  accent = "default",
}: {
  label: string;
  body: string;
  accent?: "default" | "emerald" | "amber" | "primary";
}) {
  const accents: Record<string, string> = {
    default: "border-border bg-muted/20",
    emerald: "border-emerald-200 bg-emerald-50/40",
    amber: "border-amber-200 bg-amber-50/40",
    primary: "border-primary/30 bg-primary/5",
  };
  return (
    <div className={`rounded-md border p-3 ${accents[accent]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-sm font-medium truncate" title={value}>
        {value}
      </div>
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
  tone?: "default" | "emerald" | "rose" | "blue" | "primary" | "amber";
}) {
  const tones: Record<string, string> = {
    default: "border-border bg-background",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    primary: "border-primary/30 bg-primary/5 text-primary",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
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
