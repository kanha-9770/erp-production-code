"use client";

/**
 * Module-aware Approval Process list (Zoho-style): Process Name · Module ·
 * Execute On · Scope · Rules · Stages · Status toggle · edit/delete.
 */

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useDeleteApprovalProcessMutation,
  useGetApprovalProcessesQuery,
  useSetApprovalProcessActiveMutation,
  type ApprovalModule,
} from "@/lib/api/approvals";
import { moduleSubmodules, MODULE_LABEL } from "./module-schema";

const TRIGGER_LABEL: Record<string, string> = {
  CREATE: "Create only",
  EDIT: "Edit only",
  BOTH: "Create or Edit",
};

function scopeLabel(scope: any): string {
  if (!scope || scope.type === "record") return "Whole record";
  if (scope.type === "section") return `${scope.sections?.length ?? 0} section(s)`;
  if (scope.type === "fields") return `${scope.fields?.length ?? 0} field(s)`;
  return "—";
}

export function ProcessList({ module }: { module: ApprovalModule }) {
  const router = useRouter();
  const { toast } = useToast();
  const base = `/settings/${module}/approval-processes`;
  const subLabel = Object.fromEntries(moduleSubmodules(module).map((s) => [s.key, s.label]));

  const { data: processes = [], isLoading, isError, error } = useGetApprovalProcessesQuery(module);
  const [setActive] = useSetApprovalProcessActiveMutation();
  const [deleteProcess, { isLoading: deleting }] = useDeleteApprovalProcessMutation();
  const forbidden = isError && (error as any)?.status === 403;

  const toggle = async (id: string, isActive: boolean) => {
    try {
      await setActive({ module, id, isActive }).unwrap();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not update", description: e?.data?.error });
    }
  };
  const remove = async (id: string, name: string) => {
    try {
      await deleteProcess({ module, id }).unwrap();
      toast({ title: "Process deleted", description: name });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not delete", description: e?.data?.error });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{MODULE_LABEL[module]} Approval Processes</h1>
          <p className="text-sm text-muted-foreground">
            Automate the submission of {MODULE_LABEL[module].toLowerCase()} records for approval from one or more approvers.
          </p>
        </div>
        <Button onClick={() => router.push(`${base}/new`)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Approval Process
        </Button>
      </div>

      {forbidden ? (
        <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          You need the “Manage Approval Processes” permission to configure {MODULE_LABEL[module].toLowerCase()} approvals.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : processes.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 p-12 text-center">
          <Workflow className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">There is no approval process configured.</p>
          <Button onClick={() => router.push(`${base}/new`)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Approval Process
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process Name</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Execute On</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-center">Rules</TableHead>
                <TableHead className="text-center">Stages</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processes.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`${base}/${p.id}`)}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.description && (
                      <span className="block text-xs text-muted-foreground font-normal truncate max-w-xs">{p.description}</span>
                    )}
                  </TableCell>
                  <TableCell>{subLabel[p.submodule ?? ""] ?? "All"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{TRIGGER_LABEL[p.trigger] ?? p.trigger}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{scopeLabel(p.scope)}</TableCell>
                  <TableCell className="text-center">{p.ruleCount || <span className="text-muted-foreground">All</span>}</TableCell>
                  <TableCell className="text-center">{p.stageCount}</TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <Switch checked={p.isActive} onCheckedChange={(v) => toggle(p.id, v)} />
                      <Badge variant={p.isActive ? "default" : "secondary"} className="text-[10px]">
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`${base}/${p.id}`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete “{p.name}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              New records will no longer trigger this process. Requests already in flight keep running on
                              their frozen rules. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={deleting}
                              onClick={() => remove(p.id, p.name)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
