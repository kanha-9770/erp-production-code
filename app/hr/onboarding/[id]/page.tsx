"use client";

/**
 * Single onboarding checklist — task tracker.
 * Read-only summary header + task list with status toggles. Completing
 * the last task auto-completes the checklist (server-side) and flips the
 * Employee back to ACTIVE.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, Calendar, User, ListChecks,
  Briefcase, Mail, Clock,
} from "lucide-react";
import {
  useGetOnboardingChecklistQuery,
  useUpdateOnboardingTaskMutation,
  type OnboardingTaskItem,
  type OnboardingTaskStatus,
  type OnboardingTaskCategory,
} from "@/lib/api/onboarding";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CATEGORY_LABEL: Record<OnboardingTaskCategory, string> = {
  DOCS: "Documents",
  IT: "IT Setup",
  INDUCTION: "Induction",
  POLICY: "Policy",
  FINANCE: "Finance",
  OTHER: "Other",
};

const CATEGORY_COLOR: Record<OnboardingTaskCategory, string> = {
  DOCS: "bg-blue-100 text-blue-800",
  IT: "bg-purple-100 text-purple-800",
  INDUCTION: "bg-amber-100 text-amber-800",
  POLICY: "bg-slate-100 text-slate-800",
  FINANCE: "bg-emerald-100 text-emerald-800",
  OTHER: "bg-slate-100 text-slate-800",
};

export default function OnboardingChecklistDetailPage() {
  const params = useParams<{ id: string }>();
  const checklistId = params?.id ?? "";
  const { data, isLoading } = useGetOnboardingChecklistQuery(checklistId, {
    skip: !checklistId,
  });
  const [updateTask] = useUpdateOnboardingTaskMutation();
  const { toast } = useToast();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const checklist = data?.item;

  const groupedTasks = useMemo(() => {
    if (!checklist) return [];
    const groups: Record<string, OnboardingTaskItem[]> = {};
    for (const t of checklist.tasks) {
      const key = t.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.entries(groups);
  }, [checklist]);

  const handleToggle = async (task: OnboardingTaskItem) => {
    const next: OnboardingTaskStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    setBusyTaskId(task.id);
    try {
      const res = await updateTask({
        id: task.id,
        checklistId: checklistId,
        body: { status: next },
      }).unwrap();
      if (res.progress.justCompleted) {
        toast({
          title: "Onboarding complete",
          description: "Employee is now active.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.data?.error ?? err?.message ?? "Server error",
        variant: "destructive",
      });
    } finally {
      setBusyTaskId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="text-sm text-muted-foreground">Checklist not found.</div>
        <Button asChild variant="outline">
          <Link href="/hr/onboarding"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Link>
        </Button>
      </div>
    );
  }

  const employee = checklist.employee;
  const totalTasks = checklist.tasks.length;
  const doneTasks = checklist.tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "SKIPPED",
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/hr/onboarding"><ArrowLeft className="h-4 w-4 mr-1" /> All checklists</Link>
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Onboarding for</div>
                <h1 className="text-2xl font-extrabold tracking-tight">{employee?.employeeName ?? "Unnamed"}</h1>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {employee?.designation && (
                    <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {employee.designation}</span>
                  )}
                  {employee?.department && <span>· {employee.department}</span>}
                  {employee?.emailAddress1 && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {employee.emailAddress1}</span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-bold uppercase">
                {checklist.status.replace("_", " ")}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <Stat label="Tasks" value={`${doneTasks}/${totalTasks}`} icon={<ListChecks className="h-3.5 w-3.5" />} />
              <Stat label="Progress" value={`${checklist.completionPercent}%`} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
              <Stat
                label="Started"
                value={checklist.startDate ? new Date(checklist.startDate).toLocaleDateString() : "—"}
                icon={<Calendar className="h-3.5 w-3.5" />}
              />
              <Stat
                label="Joined"
                value={employee?.dateOfJoining ? new Date(employee.dateOfJoining).toLocaleDateString() : "—"}
                icon={<User className="h-3.5 w-3.5" />}
              />
            </div>

            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${checklist.completionPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {groupedTasks.map(([category, tasks]) => (
            <Card key={category} className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <Badge variant="outline" className={`text-[10px] font-bold uppercase ${CATEGORY_COLOR[category as OnboardingTaskCategory]}`}>
                  {CATEGORY_LABEL[category as OnboardingTaskCategory]}
                </Badge>
                <div className="divide-y">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      busy={busyTaskId === t.id}
                      onToggle={() => handleToggle(t)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function TaskRow({ task, busy, onToggle }: { task: OnboardingTaskItem; busy: boolean; onToggle: () => void }) {
  const completed = task.status === "COMPLETED";
  return (
    <div className="flex items-start gap-3 py-3">
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="mt-0.5 shrink-0 disabled:opacity-50"
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : completed ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <Circle className="h-5 w-5 text-slate-300" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${completed ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </div>
        {task.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{task.description}</div>
        )}
        <div className="flex items-center gap-3 mt-1 text-[10px] uppercase font-bold text-slate-400 tracking-widest">
          {task.dueDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Due {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.completedAt && (
            <span className="text-emerald-600">
              Completed {new Date(task.completedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
