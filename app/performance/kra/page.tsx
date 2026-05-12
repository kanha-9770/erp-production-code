"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Target,
  Plus,
  Search,
  Pencil,
  Trash2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

type KraStatus = "DRAFT" | "ACTIVE" | "ACHIEVED" | "AT_RISK" | "MISSED";
type Period = "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL";

interface Kra {
  id: string;
  employee: string;
  objective: string;
  weight: number; // percentage 0-100
  target: string;
  actual: string;
  progress: number; // 0-100
  period: Period;
  year: number;
  status: KraStatus;
  notes: string;
}

const STORAGE_KEY = "performance-kra:v1";

const STATUS_LABEL: Record<KraStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ACHIEVED: "Achieved",
  AT_RISK: "At Risk",
  MISSED: "Missed",
};

const STATUS_VARIANT: Record<KraStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  ACHIEVED: "default",
  AT_RISK: "outline",
  MISSED: "destructive",
};

const PERIOD_LABEL: Record<Period, string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  ANNUAL: "Annual",
};

const SEED: Kra[] = [
  {
    id: "KRA-0001",
    employee: "Riya Sharma",
    objective: "Reduce average ticket resolution time by 25%",
    weight: 30,
    target: "≤ 4 hours",
    actual: "4.6 hours",
    progress: 78,
    period: "Q1",
    year: new Date().getFullYear(),
    status: "ACTIVE",
    notes: "Tracked via Zendesk export",
  },
  {
    id: "KRA-0002",
    employee: "Arjun Mehta",
    objective: "Close 8 enterprise deals worth ₹50L+ each",
    weight: 40,
    target: "8 deals",
    actual: "8 deals",
    progress: 100,
    period: "Q1",
    year: new Date().getFullYear(),
    status: "ACHIEVED",
    notes: "Closed last deal on 28 Mar",
  },
  {
    id: "KRA-0003",
    employee: "Priya Kapoor",
    objective: "Ship the new payroll module to GA",
    weight: 35,
    target: "GA by 31 Mar",
    actual: "Beta only",
    progress: 55,
    period: "Q1",
    year: new Date().getFullYear(),
    status: "AT_RISK",
    notes: "Tax compliance review pending",
  },
];

function loadKras(): Kra[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Kra[]) : SEED;
  } catch {
    return SEED;
  }
}

function saveKras(items: Kra[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function nextKraId(items: Kra[]): string {
  const nums = items
    .map((k) => Number(k.id.replace(/[^0-9]/g, "")))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `KRA-${String(next).padStart(4, "0")}`;
}

const EMPTY: Kra = {
  id: "",
  employee: "",
  objective: "",
  weight: 0,
  target: "",
  actual: "",
  progress: 0,
  period: "Q1",
  year: new Date().getFullYear(),
  status: "DRAFT",
  notes: "",
};

export default function KraPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Kra[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | KraStatus>("");
  const [periodFilter, setPeriodFilter] = useState<"" | Period>("");
  const [editing, setEditing] = useState<Kra | null>(null);
  const [deleting, setDeleting] = useState<Kra | null>(null);

  useEffect(() => {
    setItems(loadKras());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveKras(items);
  }, [items, loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((k) => {
      if (statusFilter && k.status !== statusFilter) return false;
      if (periodFilter && k.period !== periodFilter) return false;
      if (!q) return true;
      return (
        k.employee.toLowerCase().includes(q) ||
        k.id.toLowerCase().includes(q) ||
        k.objective.toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter, periodFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((k) => k.status === "ACTIVE").length;
    const achieved = items.filter((k) => k.status === "ACHIEVED").length;
    const atRisk = items.filter((k) => k.status === "AT_RISK" || k.status === "MISSED").length;
    return { total, active, achieved, atRisk };
  }, [items]);

  const onSave = (draft: Kra) => {
    if (!draft.employee.trim()) {
      toast({ title: "Employee is required", variant: "destructive" });
      return;
    }
    if (!draft.objective.trim()) {
      toast({ title: "Objective is required", variant: "destructive" });
      return;
    }
    const existing = items.find((k) => k.id === draft.id);
    const finalKra: Kra =
      existing != null ? draft : { ...draft, id: draft.id || nextKraId(items) };
    setItems((prev) =>
      existing != null
        ? prev.map((k) => (k.id === finalKra.id ? finalKra : k))
        : [finalKra, ...prev],
    );
    setEditing(null);
    toast({
      title: existing ? "KRA updated" : "KRA added",
      description: `${finalKra.id} · ${finalKra.employee}`,
    });
  };

  const onDelete = (kra: Kra) => {
    setItems((prev) => prev.filter((k) => k.id !== kra.id));
    setDeleting(null);
    toast({ title: "KRA deleted", description: `${kra.id} · ${kra.employee}` });
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <PageBackLink href="/admin/modules" label="Modules" />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Target className="h-5 w-5 text-gray-500" /> Key Result Areas
          </h1>
          <p className="mt-1 text-sm text-gray-600 max-w-2xl">
            Define measurable objectives per employee, weight them by priority,
            and track quarterly progress. KRAs feed into the performance
            appraisal at period close.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="h-4 w-4 mr-1.5" /> Add KRA
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total KRAs" value={stats.total.toString()} />
        <KpiCard label="Active" value={stats.active.toString()} tone="primary" />
        <KpiCard label="Achieved" value={stats.achieved.toString()} tone="success" />
        <KpiCard label="At risk / missed" value={stats.atRisk.toString()} tone="warning" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employee, ID, objective…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select
            value={statusFilter || "ALL"}
            onValueChange={(v) =>
              setStatusFilter(v === "ALL" ? "" : (v as KraStatus))
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as KraStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={periodFilter || "ALL"}
            onValueChange={(v) =>
              setPeriodFilter(v === "ALL" ? "" : (v as Period))
            }
          >
            <SelectTrigger className="h-8 w-[130px] text-sm">
              <SelectValue placeholder="All periods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All periods</SelectItem>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
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
              <TableHead className="w-[110px]">KRA ID</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Objective</TableHead>
              <TableHead className="w-[80px] text-right">Weight</TableHead>
              <TableHead className="w-[160px]">Progress</TableHead>
              <TableHead className="w-[110px]">Period</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  {items.length === 0
                    ? "No KRAs yet. Click \"Add KRA\" to define the first objective."
                    : "No KRAs match these filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((k) => {
                const StatusIcon =
                  k.status === "ACHIEVED"
                    ? CheckCircle2
                    : k.status === "AT_RISK" || k.status === "MISSED"
                      ? AlertTriangle
                      : TrendingUp;
                return (
                  <TableRow key={k.id}>
                    <TableCell className="font-mono text-xs">{k.id}</TableCell>
                    <TableCell className="font-medium">{k.employee}</TableCell>
                    <TableCell>
                      <div className="text-sm">{k.objective}</div>
                      {k.target && (
                        <div className="text-[11px] text-muted-foreground">
                          Target: {k.target}
                          {k.actual ? ` · Actual: ${k.actual}` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {k.weight}%
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={k.progress} className="h-1.5" />
                        <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
                          {k.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {PERIOD_LABEL[k.period]} {k.year}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge variant={STATUS_VARIANT[k.status]} className="text-[10px]">
                          {STATUS_LABEL[k.status]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditing(k)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(k)}
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

      <KraDialog
        open={editing != null}
        draft={editing}
        onCancel={() => setEditing(null)}
        onSave={onSave}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete KRA?</AlertDialogTitle>
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

function KraDialog({
  open,
  draft,
  onCancel,
  onSave,
}: {
  open: boolean;
  draft: Kra | null;
  onCancel: () => void;
  onSave: (k: Kra) => void;
}) {
  const [form, setForm] = useState<Kra>(EMPTY);
  useEffect(() => {
    if (draft) setForm(draft);
  }, [draft]);

  const isEdit = !!draft?.id;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit KRA" : "Add KRA"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update details for ${form.id}.`
              : "Define a measurable objective for an employee. ID is generated automatically."}
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
            <Label className="text-xs">Objective</Label>
            <Textarea
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              placeholder="e.g. Reduce average ticket resolution time by 25%"
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs">Target</Label>
            <Input
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="e.g. ≤ 4 hours"
            />
          </div>
          <div>
            <Label className="text-xs">Actual</Label>
            <Input
              value={form.actual}
              onChange={(e) => setForm({ ...form, actual: e.target.value })}
              placeholder="Current value"
            />
          </div>
          <div>
            <Label className="text-xs">Weight (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.weight || ""}
              onChange={(e) =>
                setForm({ ...form, weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
              }
              placeholder="0-100"
            />
          </div>
          <div>
            <Label className="text-xs">Progress (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.progress || ""}
              onChange={(e) =>
                setForm({ ...form, progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
              }
              placeholder="0-100"
            />
          </div>
          <div>
            <Label className="text-xs">Period</Label>
            <Select
              value={form.period}
              onValueChange={(v) => setForm({ ...form, period: v as Period })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_LABEL[p]}
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
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) || new Date().getFullYear() })}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as KraStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as KraStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)}>
            {isEdit ? "Save changes" : "Add KRA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
