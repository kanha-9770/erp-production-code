"use client";

/**
 * Onboarding templates manager. Each org can have several templates;
 * one is marked default and is used by the AppointmentLetter SIGNED
 * trigger. A template is a JSON array of task seeds (title, category,
 * offsetDays) materialised into real Task rows when a checklist is created.
 */

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft, Plus, Trash2, Loader2, Star, ListChecks, Save, X as XIcon,
} from "lucide-react";
import {
  useGetOnboardingTemplatesQuery,
  useCreateOnboardingTemplateMutation,
  useUpdateOnboardingTemplateMutation,
  useDeleteOnboardingTemplateMutation,
  type OnboardingTemplateItem,
  type OnboardingTaskCategory,
} from "@/lib/api/onboarding";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

const CATEGORIES: OnboardingTaskCategory[] = ["DOCS", "IT", "INDUCTION", "POLICY", "FINANCE", "OTHER"];

type TaskSeed = {
  title: string;
  description?: string;
  category: OnboardingTaskCategory;
  offsetDays: number;
};

type DraftTemplate = {
  name: string;
  description: string;
  isDefault: boolean;
  defaultTasks: TaskSeed[];
};

const EMPTY: DraftTemplate = {
  name: "",
  description: "",
  isDefault: false,
  defaultTasks: [
    { title: "", category: "OTHER", offsetDays: 1 },
  ],
};

export default function OnboardingTemplatesPage() {
  const { toast } = useToast();
  const { data, isLoading } = useGetOnboardingTemplatesQuery();
  const [createTpl, { isLoading: creating }] = useCreateOnboardingTemplateMutation();
  const [updateTpl, { isLoading: updating }] = useUpdateOnboardingTemplateMutation();
  const [deleteTpl] = useDeleteOnboardingTemplateMutation();

  const templates: OnboardingTemplateItem[] = data?.items ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTemplate>(EMPTY);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setDraft(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (tpl: OnboardingTemplateItem) => {
    setEditingId(tpl.id);
    setDraft({
      name: tpl.name,
      description: tpl.description ?? "",
      isDefault: tpl.isDefault,
      defaultTasks: Array.isArray(tpl.defaultTasks) && tpl.defaultTasks.length > 0
        ? tpl.defaultTasks.map((t) => ({
            title: String(t.title ?? ""),
            description: t.description ? String(t.description) : "",
            category: (t.category ?? "OTHER") as OnboardingTaskCategory,
            offsetDays: Number(t.offsetDays ?? 1),
          }))
        : [{ title: "", category: "OTHER", offsetDays: 1 }],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const cleanedTasks = draft.defaultTasks
      .filter((t) => t.title.trim().length > 0)
      .map((t) => ({
        title: t.title.trim(),
        description: t.description?.trim() || undefined,
        category: t.category,
        offsetDays: Number.isFinite(t.offsetDays) ? t.offsetDays : 1,
      }));
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      isDefault: draft.isDefault,
      defaultTasks: cleanedTasks,
    };
    try {
      if (editingId) {
        await updateTpl({ id: editingId, body }).unwrap();
        toast({ title: "Template updated" });
      } else {
        await createTpl(body).unwrap();
        toast({ title: "Template created" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        title: editingId ? "Update failed" : "Create failed",
        description: err?.data?.error ?? err?.message ?? "Server error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTpl(deletingId).unwrap();
      setDeletingId(null);
      toast({ title: "Template deleted", variant: "destructive" });
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err?.data?.error ?? err?.message ?? "Server error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/hr/onboarding"><ArrowLeft className="h-4 w-4 mr-1" /> Onboarding</Link>
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Onboarding templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define a set of starter tasks that auto-create when an Appointment Letter is signed.
            </p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New template</Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : templates.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-center text-muted-foreground gap-2">
                <ListChecks className="h-8 w-8 text-slate-300" />
                <div className="text-sm font-medium">No templates yet</div>
                <div className="text-xs">A built-in fallback list will be used until you create one.</div>
              </div>
            ) : (
              <div className="divide-y">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => openEdit(tpl)}
                    className="w-full text-left flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm truncate">{tpl.name}</div>
                        {tpl.isDefault && (
                          <Badge variant="outline" className="text-[9px] uppercase font-bold bg-amber-50 text-amber-800">
                            <Star className="h-3 w-3 mr-1" /> Default
                          </Badge>
                        )}
                      </div>
                      {tpl.description && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{tpl.description}</div>
                      )}
                      <div className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-widest">
                        {(tpl.defaultTasks?.length ?? 0)} default tasks
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDeletingId(tpl.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Engineering Hire" />
              </div>
              <div className="space-y-1.5 flex items-center gap-3">
                <div>
                  <Label>Set as default</Label>
                  <p className="text-[10px] text-muted-foreground">Used by the SIGNED trigger</p>
                </div>
                <Switch checked={draft.isDefault} onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Description</Label>
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional notes for HR" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Default tasks</Label>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => setDraft({
                    ...draft,
                    defaultTasks: [...draft.defaultTasks, { title: "", category: "OTHER", offsetDays: draft.defaultTasks.length + 1 }],
                  })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add task
                </Button>
              </div>
              <div className="space-y-2">
                {draft.defaultTasks.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_140px_90px_32px] gap-2 items-end p-2 rounded-md border bg-slate-50/50">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-400">Title</Label>
                      <Input
                        value={t.title}
                        onChange={(e) => {
                          const arr = [...draft.defaultTasks];
                          arr[i] = { ...arr[i], title: e.target.value };
                          setDraft({ ...draft, defaultTasks: arr });
                        }}
                        placeholder="e.g. Collect Aadhar copy"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-400">Category</Label>
                      <Select
                        value={t.category}
                        onValueChange={(v) => {
                          const arr = [...draft.defaultTasks];
                          arr[i] = { ...arr[i], category: v as OnboardingTaskCategory };
                          setDraft({ ...draft, defaultTasks: arr });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-400">Day +</Label>
                      <Input
                        type="number" min={0}
                        value={t.offsetDays}
                        onChange={(e) => {
                          const arr = [...draft.defaultTasks];
                          arr[i] = { ...arr[i], offsetDays: Number(e.target.value) };
                          setDraft({ ...draft, defaultTasks: arr });
                        }}
                      />
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                      onClick={() => {
                        const arr = draft.defaultTasks.filter((_, j) => j !== i);
                        setDraft({ ...draft, defaultTasks: arr.length ? arr : [{ title: "", category: "OTHER", offsetDays: 1 }] });
                      }}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!draft.name.trim() || creating || updating}>
              {(creating || updating) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing checklists already created from this template are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
