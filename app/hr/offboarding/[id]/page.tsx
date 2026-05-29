"use client";

/**
 * Single exit checklist — task tracker + exit interview capture.
 * Completing the last task auto-completes the checklist and deactivates
 * the Employee + their User account (handled server-side).
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, Calendar, User, ListChecks,
  Briefcase, Mail, Clock, Save,
} from "lucide-react";
import {
  useGetExitChecklistQuery,
  useUpdateExitTaskMutation,
  useUpdateExitChecklistMutation,
  type ExitTaskItem,
  type ExitTaskStatus,
  type ExitTaskCategory,
} from "@/lib/api/offboarding";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_LABEL: Record<ExitTaskCategory, string> = {
  ASSETS: "Assets",
  HANDOVER: "Handover",
  ACCESS: "Access",
  FINANCE: "Finance",
  INTERVIEW: "Interview",
  OTHER: "Other",
};

const CATEGORY_COLOR: Record<ExitTaskCategory, string> = {
  ASSETS: "bg-orange-100 text-orange-800",
  HANDOVER: "bg-blue-100 text-blue-800",
  ACCESS: "bg-rose-100 text-rose-800",
  FINANCE: "bg-emerald-100 text-emerald-800",
  INTERVIEW: "bg-purple-100 text-purple-800",
  OTHER: "bg-slate-100 text-slate-800",
};

// Default exit-interview questionnaire. Stored back to the server inside
// `exitInterview` JSON so the schema doesn't have to evolve when HR
// changes the question list.
const EXIT_QUESTIONS = [
  { id: "primary_reason", label: "Primary reason for leaving" },
  { id: "manager_feedback", label: "Feedback for your manager" },
  { id: "team_feedback", label: "Feedback about the team" },
  { id: "process_improvement", label: "What could the company do better?" },
  { id: "would_recommend", label: "Would you recommend us as a workplace?" },
];

export default function ExitChecklistDetailPage() {
  const params = useParams<{ id: string }>();
  const checklistId = params?.id ?? "";
  const { data, isLoading } = useGetExitChecklistQuery(checklistId, {
    skip: !checklistId,
  });
  const [updateTask] = useUpdateExitTaskMutation();
  const [updateChecklist, { isLoading: savingChecklist }] = useUpdateExitChecklistMutation();
  const { toast } = useToast();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [interview, setInterview] = useState<Record<string, string>>({});

  const checklist = data?.item;

  // Hydrate the interview form from server state when the checklist loads
  // or changes. Treat the server JSON as a flat key→string map for now.
  useEffect(() => {
    if (checklist?.exitInterview && typeof checklist.exitInterview === "object") {
      const src = checklist.exitInterview as Record<string, any>;
      const next: Record<string, string> = {};
      for (const q of EXIT_QUESTIONS) {
        const v = src[q.id];
        if (typeof v === "string") next[q.id] = v;
      }
      setInterview(next);
    }
  }, [checklist?.id, checklist?.exitInterview]);

  const groupedTasks = useMemo(() => {
    if (!checklist) return [];
    const groups: Record<string, ExitTaskItem[]> = {};
    for (const t of checklist.tasks) {
      const key = t.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.entries(groups);
  }, [checklist]);

  const handleToggle = async (task: ExitTaskItem) => {
    const next: ExitTaskStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    setBusyTaskId(task.id);
    try {
      const res = await updateTask({
        id: task.id,
        checklistId,
        body: { status: next },
      }).unwrap();
      if (res.progress.justCompleted) {
        toast({
          title: "Offboarding complete",
          description: "Employee has been deactivated.",
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

  const handleSaveInterview = async () => {
    if (!checklistId) return;
    try {
      await updateChecklist({
        id: checklistId,
        body: { exitInterview: interview },
      }).unwrap();
      toast({ title: "Interview saved" });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.data?.error ?? err?.message ?? "Server error",
        variant: "destructive",
      });
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
          <Link href="/hr/offboarding"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Link>
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
            <Link href="/hr/offboarding"><ArrowLeft className="h-4 w-4 mr-1" /> All exits</Link>
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-widest text-rose-500">Offboarding for</div>
                <h1 className="text-2xl font-extrabold tracking-tight">{employee?.employeeName ?? "Unnamed"}</h1>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
                label="Initiated"
                value={new Date(checklist.initiatedAt).toLocaleDateString()}
                icon={<Calendar className="h-3.5 w-3.5" />}
              />
              <Stat
                label="Last working"
                value={checklist.lastWorkingDate ? new Date(checklist.lastWorkingDate).toLocaleDateString() : "—"}
                icon={<User className="h-3.5 w-3.5" />}
              />
            </div>

            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-300"
                style={{ width: `${checklist.completionPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {groupedTasks.map(([category, tasks]) => (
            <Card key={category} className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <Badge variant="outline" className={`text-[10px] font-bold uppercase ${CATEGORY_COLOR[category as ExitTaskCategory]}`}>
                  {CATEGORY_LABEL[category as ExitTaskCategory]}
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

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Exit interview</h2>
              <p className="text-xs text-muted-foreground">
                Capture the conversation. Stored as JSON — fields can be edited later.
              </p>
            </div>
            <div className="space-y-3">
              {EXIT_QUESTIONS.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <Label className="text-sm font-medium">{q.label}</Label>
                  <Textarea
                    value={interview[q.id] ?? ""}
                    onChange={(e) =>
                      setInterview({ ...interview, [q.id]: e.target.value })
                    }
                    placeholder="…"
                    className="min-h-[60px]"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveInterview} disabled={savingChecklist}>
                {savingChecklist ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save interview
              </Button>
            </div>
          </CardContent>
        </Card>
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

function TaskRow({ task, busy, onToggle }: { task: ExitTaskItem; busy: boolean; onToggle: () => void }) {
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
          <CheckCircle2 className="h-5 w-5 text-rose-500" />
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
            <span className="text-rose-600">
              Completed {new Date(task.completedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
