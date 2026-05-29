"use client";

/**
 * Offboarding Dashboard — HR's view of all in-flight exit checklists.
 * Each checklist is created automatically when an Employee's resignation
 * date is set, or manually here.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  UserMinus, ChevronRight, Loader2, Plus, Search,
} from "lucide-react";
import {
  useGetExitChecklistsQuery,
  useCreateExitChecklistMutation,
  type ExitChecklistItem,
  type ExitChecklistStatus,
} from "@/lib/api/offboarding";
import { useGetEmployeeListQuery } from "@/lib/api/employees";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_LABEL: Record<ExitChecklistStatus, string> = {
  INITIATED: "Initiated",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<ExitChecklistStatus, string> = {
  INITIATED: "bg-slate-100 text-slate-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default function OffboardingDashboardPage() {
  const { toast } = useToast();
  const { data, isLoading } = useGetExitChecklistsQuery();
  const [createChecklist, { isLoading: creating }] =
    useCreateExitChecklistMutation();
  const { data: empData } = useGetEmployeeListQuery();
  const employees = (empData?.employees ?? []).filter(
    (e) => e.status !== "INACTIVE" && e.status !== "TERMINATED",
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState("");

  const checklists: ExitChecklistItem[] = data?.items ?? [];

  const counts = useMemo(() => {
    const total = checklists.length;
    const initiated = checklists.filter((c) => c.status === "INITIATED").length;
    const inProgress = checklists.filter((c) => c.status === "IN_PROGRESS").length;
    const completed = checklists.filter((c) => c.status === "COMPLETED").length;
    return { total, initiated, inProgress, completed };
  }, [checklists]);

  const filtered = useMemo(() => {
    let result = checklists;
    if (statusFilter) result = result.filter((c) => c.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.employee?.employeeName ?? "").toLowerCase().includes(q) ||
          (c.employee?.department ?? "").toLowerCase().includes(q) ||
          (c.employee?.designation ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [checklists, search, statusFilter]);

  const handleStart = async () => {
    if (!selectedEmployeeId) return;
    try {
      const result = await createChecklist({
        employeeId: selectedEmployeeId,
        lastWorkingDate: lastWorkingDate || null,
        reason: reason || null,
      }).unwrap();
      toast({
        title: result.alreadyExisted ? "Exit already exists" : "Offboarding started",
        description: `${result.item.tasks.length} exit tasks queued.`,
      });
      setStartDialogOpen(false);
      setSelectedEmployeeId("");
      setLastWorkingDate("");
      setReason("");
    } catch (err: any) {
      toast({
        title: "Could not start offboarding",
        description: err?.data?.error ?? err?.message ?? "Server error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-rose-600 font-bold tracking-tight uppercase text-xs">
              <UserMinus className="h-4 w-4" /> HR — Offboarding
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Employee exits
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Exit checklists are auto-created when an employee's resignation
              date is set. Start one manually to begin the process early.
            </p>
          </div>
          <Button onClick={() => setStartDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Start offboarding
          </Button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total" value={counts.total} tone="slate" />
          <StatCard label="Initiated" value={counts.initiated} tone="slate" />
          <StatCard label="In progress" value={counts.inProgress} tone="amber" />
          <StatCard label="Completed" value={counts.completed} tone="emerald" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, department…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {(["INITIATED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as ExitChecklistStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-center text-muted-foreground gap-2">
                <UserMinus className="h-8 w-8 text-slate-300" />
                <div className="text-sm font-medium">No exit checklists yet</div>
                <div className="text-xs">Set an employee's resignation date or start one manually above.</div>
              </div>
            ) : (
              <div className="divide-y border rounded-md overflow-hidden">
                {filtered.map((c) => (
                  <ChecklistRow key={c.id} checklist={c} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start offboarding</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Employee</label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick the employee to offboard…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {employees.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      No active employees.
                    </div>
                  ) : (
                    employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.employeeName}{e.department ? ` · ${e.department}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Last working date (optional)</label>
              <Input type="date" value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Personal reasons, better opportunity…" />
            </div>
            <p className="text-xs text-muted-foreground">
              A default set of exit tasks will be created. Employee status only flips to INACTIVE when every task is complete.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={!selectedEmployeeId || creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "slate" | "amber" | "emerald" }) {
  const colors = {
    slate: "bg-white text-slate-900",
    amber: "bg-amber-50 text-amber-900",
    emerald: "bg-emerald-50 text-emerald-900",
  } as const;
  return (
    <Card className={`border-0 shadow-sm ${colors[tone]}`}>
      <CardContent className="p-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</div>
        <div className="text-3xl font-black tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function ChecklistRow({ checklist }: { checklist: ExitChecklistItem }) {
  const empName = checklist.employee?.employeeName ?? "Unnamed employee";
  const dept = checklist.employee?.department;
  const designation = checklist.employee?.designation;
  const done = checklist.tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "SKIPPED",
  ).length;
  return (
    <Link
      href={`/hr/offboarding/${checklist.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center text-sm font-bold text-rose-700">
        {empName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{empName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {[designation, dept].filter(Boolean).join(" · ") || "—"}
          {checklist.lastWorkingDate && (
            <> · LWD {new Date(checklist.lastWorkingDate).toLocaleDateString()}</>
          )}
        </div>
      </div>
      <div className="hidden sm:block min-w-[140px]">
        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">
          {done}/{checklist.tasks.length} done
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-rose-500 rounded-full"
            style={{ width: `${checklist.completionPercent}%` }}
          />
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] font-bold uppercase ${STATUS_COLOR[checklist.status]}`}>
        {STATUS_LABEL[checklist.status]}
      </Badge>
      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
    </Link>
  );
}
