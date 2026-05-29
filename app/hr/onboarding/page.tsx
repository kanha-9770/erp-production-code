"use client";

/**
 * Onboarding Dashboard — HR's view of all in-flight new-hire checklists.
 * Each checklist is created automatically when an AppointmentLetter is
 * SIGNED, or manually from this page (Start onboarding action).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  UserPlus, ChevronRight, CheckCircle2, Clock, ListChecks, Plus,
  AlertCircle, Loader2, Search,
} from "lucide-react";
import {
  useGetOnboardingChecklistsQuery,
  useCreateOnboardingChecklistMutation,
  type OnboardingChecklistItem,
  type OnboardingChecklistStatus,
} from "@/lib/api/onboarding";
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

const STATUS_LABEL: Record<OnboardingChecklistStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<OnboardingChecklistStatus, string> = {
  PENDING: "bg-slate-100 text-slate-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default function OnboardingDashboardPage() {
  const { toast } = useToast();
  const { data, isLoading } = useGetOnboardingChecklistsQuery();
  const [createChecklist, { isLoading: creating }] =
    useCreateOnboardingChecklistMutation();
  const { data: empData } = useGetEmployeeListQuery();
  const employees = empData?.employees ?? [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const checklists: OnboardingChecklistItem[] = data?.items ?? [];

  const counts = useMemo(() => {
    const total = checklists.length;
    const pending = checklists.filter((c) => c.status === "PENDING").length;
    const inProgress = checklists.filter((c) => c.status === "IN_PROGRESS").length;
    const completed = checklists.filter((c) => c.status === "COMPLETED").length;
    return { total, pending, inProgress, completed };
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
      const result = await createChecklist({ employeeId: selectedEmployeeId }).unwrap();
      toast({
        title: result.alreadyExisted
          ? "Onboarding already exists"
          : "Onboarding started",
        description: `${result.item.tasks.length} tasks queued.`,
      });
      setStartDialogOpen(false);
      setSelectedEmployeeId("");
    } catch (err: any) {
      toast({
        title: "Could not start onboarding",
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
            <div className="flex items-center gap-2 text-primary font-bold tracking-tight uppercase text-xs">
              <UserPlus className="h-4 w-4" /> HR — Onboarding
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              New-hire onboarding
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Checklists are auto-created when an Appointment Letter is signed.
              Start one manually for any existing employee who needs it.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/hr/onboarding/templates">
                <ListChecks className="h-4 w-4 mr-2" />
                Templates
              </Link>
            </Button>
            <Button onClick={() => setStartDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Start onboarding
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total" value={counts.total} tone="slate" />
          <StatCard label="Pending" value={counts.pending} tone="slate" />
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
                  {(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as OnboardingChecklistStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading checklists…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-center text-muted-foreground gap-2">
                <UserPlus className="h-8 w-8 text-slate-300" />
                <div className="text-sm font-medium">No onboarding checklists yet</div>
                <div className="text-xs">Sign an Appointment Letter or start one manually above.</div>
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
            <DialogTitle>Start onboarding</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Employee</label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick the employee to onboard…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {employees.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    No employees in this organization.
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
            <p className="text-xs text-muted-foreground">
              The org's default template will be used. Tasks become due
              starting today.
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

function ChecklistRow({ checklist }: { checklist: OnboardingChecklistItem }) {
  const empName = checklist.employee?.employeeName ?? "Unnamed employee";
  const dept = checklist.employee?.department;
  const designation = checklist.employee?.designation;
  return (
    <Link
      href={`/hr/onboarding/${checklist.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600">
        {empName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{empName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {[designation, dept].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
      <div className="hidden sm:block min-w-[140px]">
        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">
          {checklist.tasks.filter((t) => t.status === "COMPLETED" || t.status === "SKIPPED").length}
          /{checklist.tasks.length} done
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full"
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
