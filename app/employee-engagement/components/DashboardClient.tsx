"use client";

import React, { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { format, subMonths, isAfter, startOfMonth, startOfQuarter, startOfYear, startOfDay, startOfWeek, subDays, endOfDay } from "date-fns";
import { Target, Lightbulb, AlertCircle, TrendingUp, MessageSquare, Filter, Search, Calendar as CalendarIcon, Clock, Award, Save, RotateCcw, ShieldCheck, CheckCircle2, XCircle, HelpCircle, FileText, Printer, Download, Lock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getStatusMeta } from "@/lib/constants/engagement";
import SubmissionPaperView, { downloadPaperView, type SubmissionPaperData } from "./SubmissionPaperView";

const POINTS_MIN = 1;
const POINTS_MAX = 12;

type ReviewStatus = "pending" | "approved" | "rejected" | "needs-info";
type ReviewEntry = {
  status: ReviewStatus;
  reviewer: string;
  reviewedAt: string; // ISO
  notes?: string;
};

const REVIEW_META: Record<
  ReviewStatus,
  { label: string; icon: React.ElementType; badge: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  pending: { label: "Pending", icon: HelpCircle, badge: "secondary", className: "text-amber-700" },
  approved: { label: "Approved", icon: CheckCircle2, badge: "default", className: "text-emerald-700" },
  rejected: { label: "Rejected", icon: XCircle, badge: "destructive", className: "text-rose-700" },
  "needs-info": { label: "Needs Info", icon: HelpCircle, badge: "outline", className: "text-blue-700" },
};

function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "rose" | "blue" | "amber" | "primary";
}) {
  const tones: Record<string, string> = {
    default: "border-border bg-background",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    primary: "border-primary/30 bg-primary/5 text-primary",
  };
  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

type EngagementItem = {
  id: string;
  displayId: string;
  moduleType: "Kaizen" | "Suggestion" | "Problem" | "Initiative" | "Target";
  title: string;
  category: string;
  status: string;
  createdAt: string;
  employeeId: string;
  employeeName: string;
  department: string;
  avatar: string;
  // Optional long-form fields, populated by the parent server page so the
  // paper-form View dialog can render without a follow-up fetch. Each
  // field is module-specific — `undefined` means "not applicable here".
  description?: string;
  currentState?: string;
  proposedState?: string;
  benefits?: string;
  suggestion?: string;
  feedback?: string | null;
  severity?: string;
  proposedSolution?: string;
  startDate?: string;
  endDate?: string | null;
  targetDate?: string;
  progress?: number;
  votes?: number;
  beforeMedia?: string | null;
  afterMedia?: string | null;
  referenceImage?: string | null;
};

const MODULE_ICONS: Record<string, React.ElementType> = {
  Kaizen: TrendingUp,
  Suggestion: MessageSquare,
  Problem: AlertCircle,
  Initiative: Lightbulb,
  Target: Target,
};

const MODULE_COLORS: Record<string, string> = {
  Kaizen: "hsl(var(--chart-1))",
  Suggestion: "hsl(var(--chart-2))",
  Problem: "hsl(var(--chart-3))",
  Initiative: "hsl(var(--chart-4))",
  Target: "hsl(var(--chart-5))",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "open": "destructive",
  "in-review": "secondary",
  "resolved": "default",
  "closed": "outline",
  "idea": "secondary",
  "approved": "default",
  "in-implementation": "outline",
  "implemented": "default",
  "submitted": "secondary",
  "accepted": "default",
  "rejected": "destructive",
  "planning": "secondary",
  "in-progress": "outline",
  "completed": "default",
  "on-hold": "secondary",
  "not-started": "secondary",
};

export default function DashboardClient({
  initialData,
  canReview = false,
  currentUserName = "Reviewer",
}: {
  initialData: EngagementItem[];
  canReview?: boolean;
  currentUserName?: string;
}) {
  // Time-duration presets + an explicit custom range. The Award Points
  // table, Employee Points Summary and Review chips below all read from
  // `filteredData`, so changing this filter cascades to every section.
  type TimeFilter =
    | "all"
    | "today"
    | "week"
    | "last7"
    | "last30"
    | "last90"
    | "monthly"
    | "quarterly"
    | "annually"
    | "custom";
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("monthly");
  // YYYY-MM-DD strings for the <input type="date"> controls. Only used
  // when `timeFilter === "custom"`. Empty string = unbounded on that side.
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [moduleFilter, setModuleFilter] = useState<"All" | "Kaizen" | "Suggestion" | "Problem" | "Initiative" | "Target">("All");
  const [searchTerm, setSearchTerm] = useState("");

  // Card-local controls for the Award Points table. These let the
  // reviewer pinpoint who submitted first when several submissions share
  // a date — without disturbing the page-level Time / Module filters.
  type AwardSortBy = "earliest" | "latest" | "employee" | "module";
  const [awardSortBy, setAwardSortBy] = useState<AwardSortBy>("earliest");
  const [awardDate, setAwardDate] = useState<string>("");       // YYYY-MM-DD or ""
  const [awardTimeFrom, setAwardTimeFrom] = useState<string>(""); // HH:MM or ""
  const [awardTimeTo, setAwardTimeTo] = useState<string>("");     // HH:MM or ""
  // Paginate the Award Points table so reviewers see at most 8 rows at a
  // time — large dashboards become unscrollable otherwise.
  const AWARD_PAGE_SIZE = 8;
  const [awardPage, setAwardPage] = useState(0);

  // Admin/HR-entered points per submission. Keyed by submission id.
  // Persisted across reloads via localStorage. The aggregated total per
  // employee is what flows into the Employee table summary card below.
  const [pointsBySubmission, setPointsBySubmission] = useState<Record<string, number>>({});
  // Discretionary bonus points layered on top of `points`. Same key
  // space, different scale (0..100). Reason is optional and stored on
  // the same EngagementAward row.
  const [bonusBySubmission, setBonusBySubmission] = useState<Record<string, { points: number; reason: string | null }>>({});
  // Inline reviewer remark per submission. Separate from review notes
  // which are tied to the formal review-decision dialog.
  const [remarkBySubmission, setRemarkBySubmission] = useState<Record<string, string>>({});
  // Spotlight flag for Kaizen submissions (only set on Kaizen rows).
  const [bestKaizenBySubmission, setBestKaizenBySubmission] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Admin/HR review log per submission. Same persistence approach as
  // points — once the API is wired up these maps become server-backed.
  const [reviewBySubmission, setReviewBySubmission] = useState<Record<string, ReviewEntry>>({});
  const [reviewDialogFor, setReviewDialogFor] = useState<EngagementItem | null>(null);
  const [reviewDialogStatus, setReviewDialogStatus] = useState<ReviewStatus>("approved");
  const [reviewDialogNotes, setReviewDialogNotes] = useState("");

  // Paper-form view dialog (read-only) opened from the "View" button on
  // each row of the Award Points table. Shows the submission rendered
  // like the printed Nessco form.
  const [viewDialogFor, setViewDialogFor] = useState<EngagementItem | null>(null);
  // Captures the rendered paper-form node for the "Download" full-page export.
  const paperRef = useRef<HTMLDivElement>(null);

  // Report generator — independent of the page-level Time filter so admin
  // can review the current month while generating last quarter's report.
  const now = new Date();
  const [reportPeriod, setReportPeriod] = useState<"monthly" | "quarterly">("monthly");
  const [reportYear, setReportYear] = useState<number>(now.getFullYear());
  const [reportMonth, setReportMonth] = useState<number>(now.getMonth()); // 0–11
  const [reportQuarter, setReportQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1); // 1–4

  // Hydrate from the awards API on mount. Every award row may carry
  // points and/or a review — we split them into the two client-side maps
  // the UI already uses.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/engagement/awards", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const ptsNext: Record<string, number> = {};
        const bonusNext: Record<string, { points: number; reason: string | null }> = {};
        const remarkNext: Record<string, string> = {};
        const bestNext: Record<string, boolean> = {};
        const revNext: Record<string, ReviewEntry> = {};
        for (const a of data.awards as Array<{
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
        }>) {
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
        setPointsBySubmission(ptsNext);
        setBonusBySubmission(bonusNext);
        setRemarkBySubmission(remarkNext);
        setBestKaizenBySubmission(bestNext);
        setReviewBySubmission(revNext);
      } catch {
        /* ignore — UI just shows no awards */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const moduleTypeOf = (id: string): string | null => {
    const item = initialData.find((d) => d.id === id);
    return item?.moduleType ?? null;
  };

  const postAward = async (
    submissionId: string,
    body: {
      points?: number | null;
      bonusPoints?: number | null;
      bonusReason?: string | null;
      remark?: string | null;
      isBestKaizen?: boolean | null;
      reviewStatus?: ReviewStatus | null;
      notes?: string | null;
    },
  ) => {
    const moduleType = moduleTypeOf(submissionId);
    if (!moduleType) return false;
    try {
      const res = await fetch("/api/engagement/awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, moduleType, ...body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Failed to save. Please try again.");
        return false;
      }
      return true;
    } catch {
      alert("Network error saving award.");
      return false;
    }
  };

  const persistReviews = (next: Record<string, ReviewEntry>) => {
    setReviewBySubmission(next);
  };

  const openReviewDialog = (item: EngagementItem) => {
    if (!canReview) return;
    const existing = reviewBySubmission[item.id];
    setReviewDialogFor(item);
    setReviewDialogStatus(existing?.status ?? "approved");
    setReviewDialogNotes(existing?.notes ?? "");
  };

  const saveReview = async () => {
    if (!reviewDialogFor || !canReview) return;
    const entry: ReviewEntry = {
      status: reviewDialogStatus,
      reviewer: currentUserName,
      reviewedAt: new Date().toISOString(),
      notes: reviewDialogNotes.trim() || undefined,
    };
    const prev = reviewBySubmission;
    persistReviews({ ...prev, [reviewDialogFor.id]: entry });
    setReviewDialogFor(null);
    setReviewDialogNotes("");
    const ok = await postAward(reviewDialogFor.id, {
      reviewStatus: reviewDialogStatus,
      notes: reviewDialogNotes.trim() ? reviewDialogNotes.trim() : null,
    });
    if (!ok) persistReviews(prev);
  };

  const clearReview = async () => {
    if (!reviewDialogFor || !canReview) return;
    const prev = reviewBySubmission;
    const target = reviewDialogFor;
    const next = { ...prev };
    delete next[target.id];
    persistReviews(next);
    setReviewDialogFor(null);
    setReviewDialogNotes("");
    const ok = await postAward(target.id, { reviewStatus: null, notes: null });
    if (!ok) persistReviews(prev);
  };

  const persistPoints = (next: Record<string, number>) => {
    setPointsBySubmission(next);
  };

  const setPoints = async (submissionId: string, raw: string) => {
    // Clamp to [1, 12]; empty input clears the entry.
    if (raw === "") {
      const next = { ...pointsBySubmission };
      delete next[submissionId];
      persistPoints(next);
      void postAward(submissionId, { points: null });
      return;
    }
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(POINTS_MIN, Math.min(POINTS_MAX, n));
    // Optimistic update — revert on API failure.
    const prev = pointsBySubmission;
    persistPoints({ ...prev, [submissionId]: clamped });
    setSavedFlash(submissionId);
    setTimeout(() => setSavedFlash((s) => (s === submissionId ? null : s)), 800);
    const ok = await postAward(submissionId, { points: clamped });
    if (!ok) persistPoints(prev);
  };

  // Bonus points — separate scale (0..100). Empty input clears the bonus.
  const BONUS_MIN = 0;
  const BONUS_MAX = 100;
  const setBonus = async (submissionId: string, raw: string) => {
    if (raw === "") {
      const prev = bonusBySubmission;
      const next = { ...prev };
      delete next[submissionId];
      setBonusBySubmission(next);
      const ok = await postAward(submissionId, { bonusPoints: null });
      if (!ok) setBonusBySubmission(prev);
      return;
    }
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(BONUS_MIN, Math.min(BONUS_MAX, n));
    const prev = bonusBySubmission;
    const existingReason = prev[submissionId]?.reason ?? null;
    if (clamped === 0) {
      const next = { ...prev };
      delete next[submissionId];
      setBonusBySubmission(next);
      const ok = await postAward(submissionId, { bonusPoints: null });
      if (!ok) setBonusBySubmission(prev);
      return;
    }
    setBonusBySubmission({ ...prev, [submissionId]: { points: clamped, reason: existingReason } });
    setSavedFlash(submissionId);
    setTimeout(() => setSavedFlash((s) => (s === submissionId ? null : s)), 800);
    const ok = await postAward(submissionId, { bonusPoints: clamped });
    if (!ok) setBonusBySubmission(prev);
  };

  // Inline remark editor — debounced via blur so we don't post on every
  // keystroke. The local map updates immediately for responsiveness.
  const onRemarkChange = (submissionId: string, raw: string) => {
    setRemarkBySubmission((prev) => {
      const next = { ...prev };
      if (raw.trim() === "") delete next[submissionId];
      else next[submissionId] = raw;
      return next;
    });
  };
  const flushRemark = async (submissionId: string) => {
    const value = remarkBySubmission[submissionId] ?? "";
    const prev = remarkBySubmission;
    setSavedFlash(submissionId);
    setTimeout(() => setSavedFlash((s) => (s === submissionId ? null : s)), 800);
    const ok = await postAward(submissionId, { remark: value.trim() || null });
    if (!ok) setRemarkBySubmission(prev);
  };

  // Best-Kaizen toggle. Only meaningful for Kaizen rows — UI hides the
  // control elsewhere, but the API also nulls it out defensively.
  const toggleBestKaizen = async (submissionId: string, next: boolean) => {
    const prev = bestKaizenBySubmission;
    setBestKaizenBySubmission((p) => {
      const out = { ...p };
      if (next) out[submissionId] = true;
      else delete out[submissionId];
      return out;
    });
    const ok = await postAward(submissionId, { isBestKaizen: next });
    if (!ok) setBestKaizenBySubmission(prev);
  };

  const filteredData = useMemo(() => {
    let data = [...initialData];

    // Filter by Time. Each branch resolves to a [from, to) window; we
    // then keep submissions whose createdAt sits inside it. "all" skips
    // the window altogether.
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (timeFilter === "today") {
      from = startOfDay(now);
      to = endOfDay(now);
    } else if (timeFilter === "week") {
      from = startOfWeek(now, { weekStartsOn: 1 });
    } else if (timeFilter === "last7") {
      from = startOfDay(subDays(now, 6)); // include today + previous 6 days
    } else if (timeFilter === "last30") {
      from = startOfDay(subDays(now, 29));
    } else if (timeFilter === "last90") {
      from = startOfDay(subDays(now, 89));
    } else if (timeFilter === "monthly") {
      from = startOfMonth(now);
    } else if (timeFilter === "quarterly") {
      from = startOfQuarter(now);
    } else if (timeFilter === "annually") {
      from = startOfYear(now);
    } else if (timeFilter === "custom") {
      // Parse the YYYY-MM-DD inputs as local midnight. End date is
      // inclusive — we extend it to the end of that day so users don't
      // have to pick "tomorrow" to include today.
      if (customFrom) {
        const f = new Date(customFrom);
        if (!isNaN(f.getTime())) from = startOfDay(f);
      }
      if (customTo) {
        const t = new Date(customTo);
        if (!isNaN(t.getTime())) to = endOfDay(t);
      }
    }
    if (from || to) {
      const fromMs = from ? from.getTime() : -Infinity;
      const toMs = to ? to.getTime() : Infinity;
      data = data.filter((d) => {
        const t = new Date(d.createdAt).getTime();
        return t >= fromMs && t <= toMs;
      });
    }

    // Filter by Module
    if (moduleFilter !== "All") {
      data = data.filter(d => d.moduleType === moduleFilter);
    }

    // Filter by Search (Employee ID, Name, Title)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(
        d => d.employeeName.toLowerCase().includes(term) ||
             d.employeeId.toLowerCase().includes(term) ||
             d.title.toLowerCase().includes(term) ||
             d.id.toLowerCase().includes(term)
      );
    }

    return data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [initialData, timeFilter, customFrom, customTo, moduleFilter, searchTerm]);

  const moduleCounts = useMemo(() => {
    return filteredData.reduce((acc, item) => {
      acc[item.moduleType] = (acc[item.moduleType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [filteredData]);

  // Rows shown specifically inside the Award Points card. Applies the
  // card-local date / time-of-day / sort controls on top of the page
  // filter so admin can answer "who submitted first?" quickly.
  const awardTableData = useMemo(() => {
    let rows = [...filteredData];

    // Same-day filter — match calendar date of createdAt against the
    // YYYY-MM-DD picker value (local time).
    if (awardDate) {
      rows = rows.filter((d) => {
        const dt = new Date(d.createdAt);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const day = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}` === awardDate;
      });
    }

    // Time-of-day window — minutes since midnight. Both ends inclusive.
    // Either bound can be omitted to leave that side open.
    const toMinutes = (hhmm: string): number | null => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
      if (!m) return null;
      const h = Number(m[1]);
      const mm = Number(m[2]);
      if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
      return h * 60 + mm;
    };
    const fromMin = toMinutes(awardTimeFrom);
    const toMin = toMinutes(awardTimeTo);
    if (fromMin !== null || toMin !== null) {
      rows = rows.filter((d) => {
        const dt = new Date(d.createdAt);
        const tod = dt.getHours() * 60 + dt.getMinutes();
        if (fromMin !== null && tod < fromMin) return false;
        if (toMin !== null && tod > toMin) return false;
        return true;
      });
    }

    rows.sort((a, b) => {
      if (awardSortBy === "earliest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (awardSortBy === "latest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (awardSortBy === "employee") {
        return a.employeeName.localeCompare(b.employeeName) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      // module
      return a.moduleType.localeCompare(b.moduleType) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return rows;
  }, [filteredData, awardDate, awardTimeFrom, awardTimeTo, awardSortBy]);

  // Reset to the first page whenever the underlying filter / sort
  // changes, so reviewers don't get stranded on an empty page.
  React.useEffect(() => {
    setAwardPage(0);
  }, [awardDate, awardTimeFrom, awardTimeTo, awardSortBy, moduleFilter, timeFilter, customFrom, customTo, searchTerm]);

  const awardPageCount = Math.max(1, Math.ceil(awardTableData.length / AWARD_PAGE_SIZE));
  const awardPageSafe = Math.min(awardPage, awardPageCount - 1);
  const awardPageStart = awardPageSafe * AWARD_PAGE_SIZE;
  const awardPageEnd = Math.min(awardPageStart + AWARD_PAGE_SIZE, awardTableData.length);
  const awardPageData = awardTableData.slice(awardPageStart, awardPageEnd);

  // Per-employee point totals, derived from the filtered submissions and
  // the admin-awarded points map. This is the value that "reflects in the
  // employee table" — shown in the Employee Points Summary card and
  // intended for the user-side employee profile.
  const employeePoints = useMemo(() => {
    const map = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        department: string;
        avatar: string;
        submissions: number;
        scoredSubmissions: number;
        totalPoints: number;
        bonusPoints: number;
      }
    >();
    for (const item of filteredData) {
      let entry = map.get(item.employeeId);
      if (!entry) {
        entry = {
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          department: item.department,
          avatar: item.avatar,
          submissions: 0,
          scoredSubmissions: 0,
          totalPoints: 0,
          bonusPoints: 0,
        };
        map.set(item.employeeId, entry);
      }
      entry.submissions += 1;
      const pts = pointsBySubmission[item.id];
      if (typeof pts === "number") {
        entry.scoredSubmissions += 1;
        entry.totalPoints += pts;
      }
      const b = bonusBySubmission[item.id];
      if (b && b.points > 0) {
        entry.bonusPoints += b.points;
      }
    }
    // Rank by combined total (regular + bonus) so spotlight bonuses are
    // reflected in the leaderboard.
    return Array.from(map.values()).sort(
      (a, b) => (b.totalPoints + b.bonusPoints) - (a.totalPoints + a.bonusPoints),
    );
  }, [filteredData, pointsBySubmission, bonusBySubmission]);

  const scoredCount = Object.keys(pointsBySubmission).length;
  const pendingScoreCount = filteredData.filter((d) => !(d.id in pointsBySubmission)).length;

  // ── Review stats over the currently-filtered view ─────────────────────
  const reviewStats = useMemo(() => {
    const out = { approved: 0, rejected: 0, needsInfo: 0, pending: 0 };
    for (const d of filteredData) {
      const r = reviewBySubmission[d.id];
      if (!r) out.pending += 1;
      else if (r.status === "approved") out.approved += 1;
      else if (r.status === "rejected") out.rejected += 1;
      else if (r.status === "needs-info") out.needsInfo += 1;
      else out.pending += 1;
    }
    return out;
  }, [filteredData, reviewBySubmission]);

  // ── Period definition for the Report Generator ────────────────────────
  const reportRange = useMemo(() => {
    if (reportPeriod === "monthly") {
      const from = new Date(reportYear, reportMonth, 1, 0, 0, 0);
      const to = new Date(reportYear, reportMonth + 1, 1, 0, 0, 0); // exclusive
      const label = `${from.toLocaleString("en-US", { month: "long" })} ${reportYear}`;
      return { from, to, label };
    }
    const qStartMonth = (reportQuarter - 1) * 3;
    const from = new Date(reportYear, qStartMonth, 1, 0, 0, 0);
    const to = new Date(reportYear, qStartMonth + 3, 1, 0, 0, 0);
    const label = `Q${reportQuarter} ${reportYear}`;
    return { from, to, label };
  }, [reportPeriod, reportYear, reportMonth, reportQuarter]);

  // Submissions that fall in the report range (independent of page filters).
  const reportItems = useMemo(() => {
    const fromMs = reportRange.from.getTime();
    const toMs = reportRange.to.getTime();
    return initialData.filter((d) => {
      const t = new Date(d.createdAt).getTime();
      return t >= fromMs && t < toMs;
    });
  }, [initialData, reportRange]);

  const reportSummary = useMemo(() => {
    const moduleCount: Record<string, number> = {};
    const byEmp = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        department: string;
        avatar: string;
        submissions: number;
        points: number;
        approved: number;
        rejected: number;
      }
    >();
    let approved = 0;
    let rejected = 0;
    let needsInfo = 0;
    let pending = 0;
    let totalPoints = 0;

    for (const item of reportItems) {
      moduleCount[item.moduleType] = (moduleCount[item.moduleType] || 0) + 1;
      let entry = byEmp.get(item.employeeId);
      if (!entry) {
        entry = {
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          department: item.department,
          avatar: item.avatar,
          submissions: 0,
          points: 0,
          approved: 0,
          rejected: 0,
        };
        byEmp.set(item.employeeId, entry);
      }
      entry.submissions += 1;
      const pts = pointsBySubmission[item.id];
      if (typeof pts === "number") {
        entry.points += pts;
        totalPoints += pts;
      }
      const r = reviewBySubmission[item.id];
      if (r?.status === "approved") {
        approved += 1;
        entry.approved += 1;
      } else if (r?.status === "rejected") {
        rejected += 1;
        entry.rejected += 1;
      } else if (r?.status === "needs-info") {
        needsInfo += 1;
      } else pending += 1;
    }
    const topContributors = Array.from(byEmp.values()).sort(
      (a, b) => b.points - a.points || b.submissions - a.submissions
    );
    return {
      total: reportItems.length,
      moduleCount,
      approved,
      rejected,
      needsInfo,
      pending,
      totalPoints,
      topContributors,
    };
  }, [reportItems, pointsBySubmission, reviewBySubmission]);

  const exportReportCSV = () => {
    const lines: string[] = [];
    lines.push(`Engagement Report,${reportRange.label}`);
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Submissions,${reportSummary.total}`);
    lines.push(`Approved,${reportSummary.approved}`);
    lines.push(`Rejected,${reportSummary.rejected}`);
    lines.push(`Needs Info,${reportSummary.needsInfo}`);
    lines.push(`Pending Review,${reportSummary.pending}`);
    lines.push(`Total Points Awarded,${reportSummary.totalPoints}`);
    lines.push("");
    lines.push("Module Breakdown");
    for (const m of ["Kaizen", "Suggestion", "Problem", "Initiative", "Target"]) {
      lines.push(`${m},${reportSummary.moduleCount[m] || 0}`);
    }
    lines.push("");
    lines.push("Top Contributors");
    lines.push("Rank,Employee ID,Employee Name,Department,Submissions,Approved,Rejected,Total Points");
    reportSummary.topContributors.forEach((c, i) => {
      const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      lines.push(
        [i + 1, cell(c.employeeId), cell(c.employeeName), cell(c.department), c.submissions, c.approved, c.rejected, c.points].join(",")
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `engagement-report-${reportRange.label.replace(/\s+/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };



  const totalSubmissions = filteredData.length;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6">
      {/* ── Workspace-style header bar (matches the module pages) ──────── */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                Engagement Analytics Hub
              </h1>
              <div className="text-xs text-muted-foreground truncate">
                {totalSubmissions} submission{totalSubmissions === 1 ? "" : "s"} in current view
              </div>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search SubID, Emp, Title..."
                className="pl-8 h-8 w-64 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Select value={moduleFilter} onValueChange={(v: any) => setModuleFilter(v)}>
              <SelectTrigger className="h-8 w-[150px] text-sm">
                <Filter className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Modules</SelectItem>
                <SelectItem value="Kaizen">Kaizen</SelectItem>
                <SelectItem value="Suggestion">Suggestions</SelectItem>
                <SelectItem value="Problem">Problem Reg.</SelectItem>
                <SelectItem value="Initiative">Self Initiative</SelectItem>
                <SelectItem value="Target">Self Target</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeFilter} onValueChange={(v: any) => setTimeFilter(v)}>
              <SelectTrigger className="h-8 w-[170px] text-sm">
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="last90">Last 90 Days</SelectItem>
                <SelectItem value="monthly">This Month</SelectItem>
                <SelectItem value="quarterly">This Quarter</SelectItem>
                <SelectItem value="annually">This Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range…</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {timeFilter === "custom" && (
          <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground">Custom range:</span>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-[150px] text-xs"
              aria-label="From date"
              max={customTo || undefined}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-[150px] text-xs"
              aria-label="To date"
              min={customFrom || undefined}
            />
            {(customFrom || customTo) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Clear date range"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Reviewer role banner ──────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 p-3 rounded-md border ${
          canReview
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-amber-50 border-amber-200 text-amber-900"
        }`}
      >
        {canReview ? (
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
        ) : (
          <Lock className="h-4 w-4 flex-shrink-0" />
        )}
        <div className="text-sm">
          {canReview ? (
            <>
              <span className="font-semibold">Reviewer access enabled.</span>{" "}
              You can approve / reject submissions and award points. Reviews
              are saved as <i>{currentUserName}</i>.
            </>
          ) : (
            <>
              <span className="font-semibold">View-only access.</span>{" "}
              Reviews and points are restricted to Admin / HR. The controls
              below are disabled for your account.
            </>
          )}
        </div>
      </div>

      {/* ── Review summary chips for the current view ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          Current view:
        </span>
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> {reviewStats.approved} Approved
        </Badge>
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> {reviewStats.rejected} Rejected
        </Badge>
        <Badge variant="outline" className="gap-1">
          <HelpCircle className="h-3 w-3" /> {reviewStats.needsInfo} Needs Info
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> {reviewStats.pending} Pending
        </Badge>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card className="col-span-1 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{totalSubmissions}</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Total Submissions</p>
          </CardContent>
        </Card>

        {["Kaizen", "Suggestion", "Problem", "Initiative", "Target"].map((mod) => {
          const Icon = MODULE_ICONS[mod];
          const count = moduleCounts[mod] || 0;
          return (
            <Card key={mod} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{mod}</CardTitle>
                <Icon className="h-4 w-4" style={{ color: MODULE_COLORS[mod] }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>



      {/* ── Admin / HR: Award Points (1–12) per submission ─────────────── */}
      <Card className="shadow-sm border-primary/30">
        <CardHeader className="pb-4 border-b bg-primary/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Award Points to Submissions
              </CardTitle>
              <CardDescription>
                Admin / HR enters <b>1–12</b> points per submission based on
                contribution. Totals roll up per employee and reflect in the
                Employee Points table below (visible on the employee&apos;s side).
              </CardDescription>
            </div>
            <div className="flex flex-col items-end text-right">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                Scored / Pending
              </span>
              <span className="text-sm font-bold">
                <span className="text-primary">{scoredCount}</span>
                <span className="text-muted-foreground"> / {pendingScoreCount}</span>
              </span>
            </div>
          </div>

          {/* Card-local filters — independent of the page-level Time filter.
              Sort defaults to "Earliest First" so the reviewer can see at a
              glance which employee submitted first when several land on the
              same day. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select value={awardSortBy} onValueChange={(v: AwardSortBy) => setAwardSortBy(v)}>
              <SelectTrigger className="h-9 w-[200px]">
                <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="earliest">Earliest First (Who submitted first)</SelectItem>
                <SelectItem value="latest">Latest First</SelectItem>
                <SelectItem value="employee">Employee Name (A → Z)</SelectItem>
                <SelectItem value="module">Module Type</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="date"
                value={awardDate}
                onChange={(e) => setAwardDate(e.target.value)}
                className="h-7 w-[140px] border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
                aria-label="Filter by submission date"
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="time"
                value={awardTimeFrom}
                onChange={(e) => setAwardTimeFrom(e.target.value)}
                className="h-7 w-[90px] border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
                aria-label="From time of day"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="time"
                value={awardTimeTo}
                onChange={(e) => setAwardTimeTo(e.target.value)}
                className="h-7 w-[90px] border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
                aria-label="To time of day"
              />
            </div>

            {(awardDate || awardTimeFrom || awardTimeTo || awardSortBy !== "earliest") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setAwardDate("");
                  setAwardTimeFrom("");
                  setAwardTimeTo("");
                  setAwardSortBy("earliest");
                }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Showing{" "}
                <b className="text-foreground tabular-nums">
                  {awardTableData.length === 0 ? 0 : awardPageStart + 1}
                  {awardTableData.length > 0 && awardPageEnd > awardPageStart + 1 ? `–${awardPageEnd}` : ""}
                </b>{" "}
                of <b className="text-foreground tabular-nums">{awardTableData.length}</b>
                {filteredData.length !== awardTableData.length && (
                  <> (filtered from {filteredData.length})</>
                )}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setAwardPage((p) => Math.max(0, p - 1))}
                  disabled={awardPageSafe <= 0}
                  aria-label="Previous page"
                >
                  ‹
                </Button>
                <span className="tabular-nums px-1">
                  Page {awardPageSafe + 1} / {awardPageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setAwardPage((p) => Math.min(awardPageCount - 1, p + 1))}
                  disabled={awardPageSafe >= awardPageCount - 1}
                  aria-label="Next page"
                >
                  ›
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[120px]">Submission ID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Title &amp; Category</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center w-[170px]">
                    <div className="flex items-center justify-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Review
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[150px]">
                    <div className="flex items-center justify-center gap-1">
                      <Award className="h-3.5 w-3.5 text-primary" />
                      Points (1–12)
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-[150px]">
                    <div className="flex items-center justify-center gap-1">
                      <Award className="h-3.5 w-3.5 text-amber-600" />
                      Bonus (0–{BONUS_MAX})
                    </div>
                  </TableHead>
                  <TableHead className="w-[220px]">Remark</TableHead>
                  <TableHead className="text-center w-[110px]">Best Kaizen</TableHead>
                  <TableHead className="text-center w-[90px]">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {awardPageData.map((item) => {
                  const Icon = MODULE_ICONS[item.moduleType] || Target;
                  const awarded = pointsBySubmission[item.id];
                  const isScored = typeof awarded === "number";
                  const justSaved = savedFlash === item.id;
                  const review = reviewBySubmission[item.id];
                  const rMeta = review ? REVIEW_META[review.status] : null;
                  const RIcon = rMeta?.icon;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.displayId || item.id.substring(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{format(new Date(item.createdAt), "MMM dd, yyyy")}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "hh:mm a")}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/employee-engagement/${item.employeeId}`} className="flex items-center gap-3 group">
                          <Avatar className="h-8 w-8 transition-transform group-hover:scale-105 border group-hover:border-primary/50">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">{item.avatar}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors">{item.employeeName}</span>
                            <span className="text-xs text-muted-foreground">{item.employeeId}</span>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md" style={{ backgroundColor: `${MODULE_COLORS[item.moduleType]}15` }}>
                            <Icon className="w-4 h-4" style={{ color: MODULE_COLORS[item.moduleType] }} />
                          </div>
                          <span className="text-sm font-medium">{item.moduleType}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col max-w-[300px]">
                          <span className="text-sm font-medium truncate" title={item.title}>{item.title}</span>
                          <span className="text-xs text-muted-foreground truncate">{item.category}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const sm = getStatusMeta(item.status);
                          return (
                            <Badge variant="outline" className={`text-[10px] uppercase ${sm.className}`}>
                              {sm.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {review && rMeta && RIcon ? (
                          <button
                            type="button"
                            disabled={!canReview}
                            onClick={() => openReviewDialog(item)}
                            className={`inline-flex flex-col items-start gap-0.5 text-left ${
                              canReview ? "hover:opacity-80 cursor-pointer" : "cursor-not-allowed"
                            }`}
                            title={canReview ? "Edit review" : "Admin / HR only"}
                          >
                            <Badge variant={rMeta.badge} className="gap-1">
                              <RIcon className="h-3 w-3" />
                              {rMeta.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              by {review.reviewer.split(" ")[0]}
                            </span>
                          </button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canReview}
                            onClick={() => openReviewDialog(item)}
                            className="h-7 text-xs"
                            title={canReview ? "Review submission" : "Admin / HR only"}
                          >
                            {canReview ? (
                              <>
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Review
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3 mr-1" />
                                Locked
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Input
                            type="number"
                            min={POINTS_MIN}
                            max={POINTS_MAX}
                            step={1}
                            value={isScored ? awarded : ""}
                            disabled={!canReview}
                            onChange={(e) => setPoints(item.id, e.target.value)}
                            placeholder={canReview ? "—" : "🔒"}
                            className={`h-8 w-16 text-center text-sm font-semibold tabular-nums ${
                              isScored ? "border-primary/50 bg-primary/5" : ""
                            }`}
                            aria-label={`Award points for submission ${item.id}`}
                            title={canReview ? "" : "Admin / HR only"}
                          />
                          {justSaved ? (
                            <Save className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground w-3.5">
                              /{POINTS_MAX}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const bonus = bonusBySubmission[item.id];
                          const hasBonus = !!bonus && bonus.points > 0;
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <Input
                                type="number"
                                min={BONUS_MIN}
                                max={BONUS_MAX}
                                step={1}
                                value={hasBonus ? bonus.points : ""}
                                disabled={!canReview}
                                onChange={(e) => setBonus(item.id, e.target.value)}
                                placeholder={canReview ? "—" : "🔒"}
                                className={`h-8 w-16 text-center text-sm font-semibold tabular-nums ${
                                  hasBonus ? "border-amber-300 bg-amber-50" : ""
                                }`}
                                aria-label={`Bonus points for submission ${item.id}`}
                                title={canReview ? (bonus?.reason ?? "Bonus points (0–100)") : "Admin / HR only"}
                              />
                              <span className="text-[10px] text-muted-foreground w-3.5">
                                /{BONUS_MAX}
                              </span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          value={remarkBySubmission[item.id] ?? ""}
                          onChange={(e) => onRemarkChange(item.id, e.target.value)}
                          onBlur={() => flushRemark(item.id)}
                          disabled={!canReview}
                          placeholder={canReview ? "Add remark…" : "🔒"}
                          className="h-8 text-xs"
                          aria-label={`Remark for submission ${item.id}`}
                          title={canReview ? "" : "Admin / HR only"}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {item.moduleType === "Kaizen" ? (
                          <Select
                            value={bestKaizenBySubmission[item.id] ? "yes" : "no"}
                            onValueChange={(v) => toggleBestKaizen(item.id, v === "yes")}
                            disabled={!canReview}
                          >
                            <SelectTrigger
                              className={`h-8 w-[90px] text-xs ${
                                bestKaizenBySubmission[item.id]
                                  ? "border-amber-300 bg-amber-50 text-amber-800 font-semibold"
                                  : ""
                              }`}
                              title={canReview ? "Mark this Kaizen as the best" : "Admin / HR only"}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="no">No</SelectItem>
                              <SelectItem value="yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground" title="Best Kaizen flag applies only to Kaizen submissions">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setViewDialogFor(item)}
                          title="View full submission in paper-form layout"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {awardTableData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                      No submissions found matching your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Employee Points Summary (reflects in Employee table) ────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-muted-foreground" />
                Employee Points Table
              </CardTitle>
              <CardDescription>
                Aggregated totals derived from the points awarded above. This
                is the value shown on each employee&apos;s profile / table row.
              </CardDescription>
            </div>
            <Badge variant="secondary">{employeePoints.length} employees</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[60px] text-center">Rank</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Submissions</TableHead>
                <TableHead className="text-center">Scored</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
                <TableHead className="text-right pr-6">Grand Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeePoints.map((e, i) => (
                <TableRow key={e.employeeId} className="hover:bg-muted/50 transition-colors group">
                  <TableCell className="text-center text-sm text-muted-foreground font-medium">
                    #{i + 1}
                  </TableCell>
                  <TableCell>
                    <Link href={`/employee-engagement/${e.employeeId}`} className="flex items-center gap-3 group">
                      <Avatar className="h-8 w-8 border">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{e.avatar}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">{e.employeeName}</span>
                        <span className="text-xs text-muted-foreground">{e.employeeId}</span>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.department}</TableCell>
                  <TableCell className="text-center text-sm">{e.submissions}</TableCell>
                  <TableCell className="text-center text-sm">
                    <span className="text-muted-foreground">
                      {e.scoredSubmissions} / {e.submissions}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1 font-semibold text-primary tabular-nums">
                      {e.totalPoints}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {e.bonusPoints > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700 tabular-nums">
                        +{e.bonusPoints}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <span className="inline-flex items-center gap-1 font-bold text-primary tabular-nums">
                      <Award className="h-3.5 w-3.5" />
                      {e.totalPoints + e.bonusPoints}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {employeePoints.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No employees in the current view.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Monthly / Quarterly Report Generator ──────────────────────── */}
      <Card className="shadow-sm print:shadow-none" id="engagement-report">
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Contribution Report
              </CardTitle>
              <CardDescription>
                Generate a monthly or quarterly contribution report covering
                submissions, reviews and points awarded across all 5 modules.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Select value={reportPeriod} onValueChange={(v: any) => setReportPeriod(v)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
              {reportPeriod === "monthly" ? (
                <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(Number(v))}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {new Date(2000, i, 1).toLocaleString("en-US", { month: "long" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={String(reportQuarter)} onValueChange={(v) => setReportQuarter(Number(v))}>
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1 (Jan–Mar)</SelectItem>
                    <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
                    <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
                    <SelectItem value="4">Q4 (Oct–Dec)</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={String(reportYear)} onValueChange={(v) => setReportYear(Number(v))}>
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([
                    now.getFullYear() - 1,
                    now.getFullYear(),
                    ...initialData.map((d) => new Date(d.createdAt).getFullYear()),
                  ]))
                    .sort((a, b) => b - a)
                    .map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9">
                <Printer className="h-3.5 w-3.5 mr-1" />
                Print
              </Button>
              <Button size="sm" onClick={exportReportCSV} className="h-9">
                <Download className="h-3.5 w-3.5 mr-1" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Report header (visible on print too) */}
          <div className="border-b pb-4">
            <h3 className="text-xl font-bold">Engagement Contribution Report</h3>
            <p className="text-sm text-muted-foreground">
              Period: <b>{reportRange.label}</b> ·{" "}
              {reportRange.from.toLocaleDateString()} —{" "}
              {new Date(reportRange.to.getTime() - 1).toLocaleDateString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Generated {new Date().toLocaleString()} · {reportSummary.total} total submissions
            </p>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <SummaryStat label="Submissions" value={reportSummary.total} />
            <SummaryStat label="Approved" value={reportSummary.approved} tone="emerald" />
            <SummaryStat label="Rejected" value={reportSummary.rejected} tone="rose" />
            <SummaryStat label="Needs Info" value={reportSummary.needsInfo} tone="blue" />
            <SummaryStat label="Pending" value={reportSummary.pending} tone="amber" />
            <SummaryStat label="Points Awarded" value={reportSummary.totalPoints} tone="primary" />
          </div>

          {/* Module breakdown */}
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
              Module Breakdown
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {["Kaizen", "Suggestion", "Problem", "Initiative", "Target"].map((m) => {
                const Icon = MODULE_ICONS[m] || Target;
                const count = reportSummary.moduleCount[m] || 0;
                return (
                  <div key={m} className="rounded-md border p-3 flex items-center gap-3">
                    <div
                      className="p-2 rounded-md"
                      style={{ backgroundColor: `${MODULE_COLORS[m]}15` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: MODULE_COLORS[m] }} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{m}</span>
                      <span className="text-lg font-bold tabular-nums">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top contributors table */}
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
              Top Contributors
            </h4>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[60px] text-center">Rank</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Submissions</TableHead>
                  <TableHead className="text-center">Approved</TableHead>
                  <TableHead className="text-center">Rejected</TableHead>
                  <TableHead className="text-right pr-6">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportSummary.topContributors.slice(0, 15).map((c, i) => (
                  <TableRow key={c.employeeId}>
                    <TableCell className="text-center text-sm text-muted-foreground">#{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7 border">
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                            {c.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{c.employeeName}</span>
                          <span className="text-[11px] text-muted-foreground">{c.employeeId}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.department}</TableCell>
                    <TableCell className="text-center text-sm">{c.submissions}</TableCell>
                    <TableCell className="text-center text-sm text-emerald-700">{c.approved}</TableCell>
                    <TableCell className="text-center text-sm text-rose-700">{c.rejected}</TableCell>
                    <TableCell className="text-right pr-6 font-bold text-primary tabular-nums">{c.points}</TableCell>
                  </TableRow>
                ))}
                {reportSummary.topContributors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No contributions recorded in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Review Dialog (admin / HR only) ───────────────────────────── */}
      <Dialog
        open={!!reviewDialogFor}
        onOpenChange={(o) => {
          if (!o) {
            setReviewDialogFor(null);
            setReviewDialogNotes("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Review Submission
            </DialogTitle>
            <DialogDescription>
              {reviewDialogFor ? (
                <>
                  <span className="font-mono text-xs">{reviewDialogFor.displayId || reviewDialogFor.id.substring(0, 8).toUpperCase()}</span>
                  {" · "}
                  {reviewDialogFor.moduleType} — {reviewDialogFor.title}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Decision
              </label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(Object.keys(REVIEW_META) as ReviewStatus[]).map((s) => {
                  const meta = REVIEW_META[s];
                  const Icon = meta.icon;
                  const isOn = reviewDialogStatus === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReviewDialogStatus(s)}
                      className={`flex items-center gap-2 rounded-md border p-2.5 text-left transition-all ${
                        isOn ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${meta.className}`} />
                      <span className="text-sm font-medium">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Reviewer Notes (optional)
              </label>
              <Textarea
                value={reviewDialogNotes}
                onChange={(e) => setReviewDialogNotes(e.target.value)}
                placeholder="Add comments visible to the employee…"
                className="mt-2 min-h-[80px]"
              />
            </div>
            {reviewDialogFor && reviewBySubmission[reviewDialogFor.id] && (
              <p className="text-xs text-muted-foreground">
                Last reviewed by{" "}
                <b>{reviewBySubmission[reviewDialogFor.id].reviewer}</b> on{" "}
                {new Date(reviewBySubmission[reviewDialogFor.id].reviewedAt).toLocaleString()}.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearReview}
              disabled={!reviewDialogFor || !reviewBySubmission[reviewDialogFor.id]}
            >
              Clear Review
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setReviewDialogFor(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveReview}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save Review
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Paper-form View dialog ────────────────────────────────────── */}
      <Dialog
        open={!!viewDialogFor}
        onOpenChange={(o) => { if (!o) setViewDialogFor(null); }}
      >
        <DialogContent className="!max-w-[min(1400px,96vw)] w-[96vw] max-h-[92vh] overflow-y-auto p-0">
          {viewDialogFor && (() => {
            const it = viewDialogFor;
            const award = reviewBySubmission[it.id];
            const pts = pointsBySubmission[it.id];
            const bonus = bonusBySubmission[it.id];
            const data: SubmissionPaperData = {
              module: it.moduleType,
              displayId: it.displayId || it.id.substring(0, 8).toUpperCase(),
              title: it.title,
              status: it.status,
              category: it.category,
              createdAt: it.createdAt,
              endDate: it.endDate ?? null,
              employee: {
                employeeId: it.employeeId,
                name: it.employeeName,
                department: it.department,
                teamName: null,
              },
              description: it.description,
              currentState: it.currentState,
              proposedState: it.proposedState,
              benefits: it.benefits,
              suggestion: it.suggestion,
              feedback: it.feedback ?? null,
              severity: it.severity,
              proposedSolution: it.proposedSolution,
              startDate: it.startDate,
              targetDate: it.targetDate,
              progress: it.progress,
              votes: it.votes,
              beforeMedia: it.beforeMedia ?? null,
              afterMedia: it.afterMedia ?? null,
              referenceImage: it.referenceImage ?? null,
              points: typeof pts === "number" ? pts : null,
              bonusPoints: bonus?.points ?? null,
              bonusReason: bonus?.reason ?? null,
              remark: remarkBySubmission[it.id] ?? null,
              isBestKaizen: !!bestKaizenBySubmission[it.id],
              reviewStatus: award?.status ?? null,
              reviewerName: award?.reviewer ?? null,
            };
            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-3 border-b">
                  <DialogTitle className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Submission View — {data.displayId}
                  </DialogTitle>
                  <DialogDescription>
                    Read-only paper-form rendering of {it.moduleType.toLowerCase()} submission for {it.employeeName}.
                  </DialogDescription>
                </DialogHeader>
                <div className="p-6" ref={paperRef}>
                  <SubmissionPaperView data={data} />
                </div>

                {/* Editable Admin / HR remark — typing here updates the
                    "Remark" cell in the paper form above live, so it is
                    included when you Print / Download. */}
                <div className="px-6 pb-2">
                  <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Remark (by Admin / HR)
                  </label>
                  <Textarea
                    value={remarkBySubmission[it.id] ?? ""}
                    onChange={(e) => onRemarkChange(it.id, e.target.value)}
                    onBlur={() => flushRemark(it.id)}
                    disabled={!canReview}
                    placeholder={canReview ? "Write a remark — appears on the printed / downloaded form…" : "Admin / HR only"}
                    className="mt-1 min-h-[70px]"
                  />
                  {canReview && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Saved automatically when you click away. It shows in the form above and in the downloaded page.
                    </p>
                  )}
                </div>

                <DialogFooter className="px-6 py-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPaperView(paperRef.current, `${data.displayId}-${it.moduleType}`)}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1" />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPaperView(paperRef.current, `${data.displayId}-${it.moduleType}`)}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download
                  </Button>
                  <Button size="sm" onClick={() => setViewDialogFor(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
