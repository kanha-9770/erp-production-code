"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Plus,
  Search,
  Pencil,
  Trash2,
  Star,
  StarHalf,
  CheckCircle2,
  Clock,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import PageBackLink from "@/components/shared/page-back-link";

type AppraisalStatus = "PENDING" | "IN_REVIEW" | "COMPLETED" | "ACKNOWLEDGED";
type Cycle = "Q1" | "Q2" | "Q3" | "Q4" | "MID_YEAR" | "ANNUAL";

interface Appraisal {
  id: string;
  employee: string;
  reviewer: string;
  cycle: Cycle;
  year: number;
  rating: number; // 0-5, allow halves
  strengths: string;
  improvements: string;
  comments: string;
  status: AppraisalStatus;
  submittedAt: string;
}

const STORAGE_KEY = "performance-appraisal:v1";

const STATUS_LABEL: Record<AppraisalStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In Review",
  COMPLETED: "Completed",
  ACKNOWLEDGED: "Acknowledged",
};

const STATUS_VARIANT: Record<AppraisalStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  IN_REVIEW: "outline",
  COMPLETED: "default",
  ACKNOWLEDGED: "default",
};

const STATUS_ICON: Record<AppraisalStatus, React.ComponentType<{ className?: string }>> = {
  PENDING: Clock,
  IN_REVIEW: Eye,
  COMPLETED: CheckCircle2,
  ACKNOWLEDGED: CheckCircle2,
};

const CYCLE_LABEL: Record<Cycle, string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  MID_YEAR: "Mid-year",
  ANNUAL: "Annual",
};

const SEED: Appraisal[] = [
  {
    id: "APR-0001",
    employee: "Riya Sharma",
    reviewer: "Sanjay Pillai",
    cycle: "ANNUAL",
    year: new Date().getFullYear() - 1,
    rating: 4.5,
    strengths:
      "Owned the ticket-resolution initiative end-to-end. Strong stakeholder communication.",
    improvements: "Delegate more to L1 — currently a bottleneck on escalations.",
    comments: "Promotion candidate for next cycle.",
    status: "COMPLETED",
    submittedAt: "2025-01-12",
  },
  {
    id: "APR-0002",
    employee: "Arjun Mehta",
    reviewer: "Sanjay Pillai",
    cycle: "ANNUAL",
    year: new Date().getFullYear() - 1,
    rating: 5,
    strengths: "Exceeded sales target by 38%. Mentored 3 new joiners successfully.",
    improvements: "Documentation discipline on closed deals.",
    comments: "Top performer — flagged for retention.",
    status: "ACKNOWLEDGED",
    submittedAt: "2025-01-14",
  },
  {
    id: "APR-0003",
    employee: "Priya Kapoor",
    reviewer: "Anita Rao",
    cycle: "MID_YEAR",
    year: new Date().getFullYear(),
    rating: 0,
    strengths: "",
    improvements: "",
    comments: "",
    status: "PENDING",
    submittedAt: "",
  },
];

function loadAppraisals(): Appraisal[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Appraisal[]) : SEED;
  } catch {
    return SEED;
  }
}

function saveAppraisals(items: Appraisal[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function nextAppraisalId(items: Appraisal[]): string {
  const nums = items
    .map((a) => Number(a.id.replace(/[^0-9]/g, "")))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `APR-${String(next).padStart(4, "0")}`;
}

const EMPTY: Appraisal = {
  id: "",
  employee: "",
  reviewer: "",
  cycle: "ANNUAL",
  year: new Date().getFullYear(),
  rating: 0,
  strengths: "",
  improvements: "",
  comments: "",
  status: "PENDING",
  submittedAt: "",
};

function StarRow({ rating }: { rating: number }) {
  // Show a 5-star row with full / half / empty states. Decoupled from the
  // editing dialog so the table cell can render compactly.
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push(<Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />);
    } else if (rating >= i - 0.5) {
      stars.push(<StarHalf key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />);
    } else {
      stars.push(<Star key={i} className="h-3.5 w-3.5 text-gray-300" />);
    }
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export default function PerformanceAppraisalPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Appraisal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AppraisalStatus>("");
  const [cycleFilter, setCycleFilter] = useState<"" | Cycle>("");
  const [editing, setEditing] = useState<Appraisal | null>(null);
  const [deleting, setDeleting] = useState<Appraisal | null>(null);

  useEffect(() => {
    setItems(loadAppraisals());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveAppraisals(items);
  }, [items, loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (cycleFilter && a.cycle !== cycleFilter) return false;
      if (!q) return true;
      return (
        a.employee.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.reviewer.toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter, cycleFilter]);

  const stats = useMemo(() => {
    const completed = items.filter(
      (a) => a.status === "COMPLETED" || a.status === "ACKNOWLEDGED",
    );
    const avg =
      completed.length === 0
        ? 0
        : completed.reduce((s, a) => s + a.rating, 0) / completed.length;
    return {
      total: items.length,
      pending: items.filter((a) => a.status === "PENDING").length,
      inReview: items.filter((a) => a.status === "IN_REVIEW").length,
      completed: completed.length,
      avgRating: Number(avg.toFixed(2)),
    };
  }, [items]);

  const onSave = (draft: Appraisal) => {
    if (!draft.employee.trim()) {
      toast({ title: "Employee is required", variant: "destructive" });
      return;
    }
    if (!draft.reviewer.trim()) {
      toast({ title: "Reviewer is required", variant: "destructive" });
      return;
    }
    const existing = items.find((a) => a.id === draft.id);
    const finalAppraisal: Appraisal =
      existing != null ? draft : { ...draft, id: draft.id || nextAppraisalId(items) };
    setItems((prev) =>
      existing != null
        ? prev.map((a) => (a.id === finalAppraisal.id ? finalAppraisal : a))
        : [finalAppraisal, ...prev],
    );
    setEditing(null);
    toast({
      title: existing ? "Appraisal updated" : "Appraisal added",
      description: `${finalAppraisal.id} · ${finalAppraisal.employee}`,
    });
  };

  const onDelete = (appraisal: Appraisal) => {
    setItems((prev) => prev.filter((a) => a.id !== appraisal.id));
    setDeleting(null);
    toast({
      title: "Appraisal deleted",
      description: `${appraisal.id} · ${appraisal.employee}`,
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <PageBackLink href="/admin/modules" label="Modules" />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gray-500" /> Performance Appraisal
          </h1>
          <p className="mt-1 text-sm text-gray-600 max-w-2xl">
            Periodic reviews with reviewer, rating, strengths, and growth areas.
            Each appraisal closes a cycle and feeds into compensation,
            promotion, and L&amp;D decisions.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="h-4 w-4 mr-1.5" /> Start appraisal
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total reviews" value={stats.total.toString()} />
        <KpiCard label="Pending" value={stats.pending.toString()} tone="warning" />
        <KpiCard label="In review" value={stats.inReview.toString()} tone="primary" />
        <KpiCard
          label="Avg rating"
          value={stats.avgRating ? `${stats.avgRating} / 5` : "—"}
          tone="success"
        />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employee, ID, reviewer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select
            value={statusFilter || "ALL"}
            onValueChange={(v) =>
              setStatusFilter(v === "ALL" ? "" : (v as AppraisalStatus))
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as AppraisalStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={cycleFilter || "ALL"}
            onValueChange={(v) =>
              setCycleFilter(v === "ALL" ? "" : (v as Cycle))
            }
          >
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="All cycles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All cycles</SelectItem>
              {(Object.keys(CYCLE_LABEL) as Cycle[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CYCLE_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Appraisal ID</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Reviewer</TableHead>
              <TableHead className="w-[130px]">Cycle</TableHead>
              <TableHead className="w-[130px]">Rating</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[110px]">Submitted</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  {items.length === 0
                    ? "No appraisals yet. Click \"Start appraisal\" to begin the first review."
                    : "No appraisals match these filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const Icon = STATUS_ICON[a.status];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.id}</TableCell>
                    <TableCell className="font-medium">{a.employee}</TableCell>
                    <TableCell className="text-sm">{a.reviewer || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {CYCLE_LABEL[a.cycle]} {a.year}
                    </TableCell>
                    <TableCell>
                      {a.rating > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <StarRow rating={a.rating} />
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {a.rating.toFixed(1)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge variant={STATUS_VARIANT[a.status]} className="text-[10px]">
                          {STATUS_LABEL[a.status]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.submittedAt || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditing(a)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AppraisalDialog
        open={editing != null}
        draft={editing}
        onCancel={() => setEditing(null)}
        onSave={onSave}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete appraisal?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  This will permanently remove <strong>{deleting.id}</strong> ·{" "}
                  {deleting.employee} from the register. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && onDelete(deleting)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "success" | "warning";
}) {
  const toneClass: Record<typeof tone, string> = {
    neutral: "text-gray-900",
    primary: "text-blue-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
  } as const;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass[tone]}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function AppraisalDialog({
  open,
  draft,
  onCancel,
  onSave,
}: {
  open: boolean;
  draft: Appraisal | null;
  onCancel: () => void;
  onSave: (a: Appraisal) => void;
}) {
  const [form, setForm] = useState<Appraisal>(EMPTY);
  useEffect(() => {
    if (draft) setForm(draft);
  }, [draft]);

  const isEdit = !!draft?.id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit appraisal" : "Start appraisal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update details for ${form.id}.`
              : "Create a new performance review. ID is generated automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Employee</Label>
            <Input
              value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}
              placeholder="Employee name"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Reviewer</Label>
            <Input
              value={form.reviewer}
              onChange={(e) => setForm({ ...form, reviewer: e.target.value })}
              placeholder="Manager / reviewer name"
            />
          </div>
          <div>
            <Label className="text-xs">Cycle</Label>
            <Select
              value={form.cycle}
              onValueChange={(v) => setForm({ ...form, cycle: v as Cycle })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CYCLE_LABEL) as Cycle[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CYCLE_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input
              type="number"
              value={form.year}
              onChange={(e) =>
                setForm({ ...form, year: Number(e.target.value) || new Date().getFullYear() })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Rating (0-5)</Label>
            <Input
              type="number"
              min={0}
              max={5}
              step={0.5}
              value={form.rating || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  rating: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                })
              }
              placeholder="e.g. 4.5"
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as AppraisalStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as AppraisalStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Strengths</Label>
            <Textarea
              value={form.strengths}
              onChange={(e) => setForm({ ...form, strengths: e.target.value })}
              placeholder="What did the employee do well this cycle?"
              rows={2}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Areas of improvement</Label>
            <Textarea
              value={form.improvements}
              onChange={(e) => setForm({ ...form, improvements: e.target.value })}
              placeholder="Where should the employee focus next cycle?"
              rows={2}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Reviewer comments</Label>
            <Textarea
              value={form.comments}
              onChange={(e) => setForm({ ...form, comments: e.target.value })}
              placeholder="Promotion / retention / L&D notes"
              rows={2}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Submitted on</Label>
            <Input
              type="date"
              value={form.submittedAt}
              onChange={(e) => setForm({ ...form, submittedAt: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)}>
            {isEdit ? "Save changes" : "Create appraisal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
