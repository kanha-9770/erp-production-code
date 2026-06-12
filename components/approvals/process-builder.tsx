"use client";

/**
 * Module-aware Zoho-style Approval Process builder (inventory / purchase).
 *
 * Module/Submodule · Name · Description · When-to-Execute · Trigger Scope
 * (whole record / section / specific fields) · Rule Criteria · ordered Approver
 * stages (ALL/ANY, users+roles) · On-approve / On-reject actions · Process admins.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CRITERIA_OPERATORS } from "@/lib/approvals/criteria";
import type { ApprovalStage, Criteria, CriteriaRule, ProcessScope } from "@/lib/approvals/types";
import {
  useCreateApprovalProcessMutation,
  useGetApprovalProcessQuery,
  useUpdateApprovalProcessMutation,
  type ApprovalModule,
} from "@/lib/api/approvals";
import {
  criteriaFields,
  moduleSections,
  moduleSubmodules,
  statusOptionsFor,
  MODULE_LABEL,
} from "./module-schema";
import { useDirectory, useModuleMasters } from "./directory";
import { PrincipalPicker } from "./principal-picker";

function emptyStage(): ApprovalStage {
  return { name: "", mode: "ANY", approverUserIds: [], approverRoleIds: [] };
}

export function ProcessBuilder({ module, processId }: { module: ApprovalModule; processId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!processId;
  const listHref = `/settings/${module}/approval-processes`;

  const { data: existing, isLoading: loadingExisting } = useGetApprovalProcessQuery(
    { module, id: processId! },
    { skip: !isEdit },
  );
  const { users, roles } = useDirectory();
  const masters = useModuleMasters(module);
  const [createProcess, { isLoading: creating }] = useCreateApprovalProcessMutation();
  const [updateProcess, { isLoading: updating }] = useUpdateApprovalProcessMutation();
  const saving = creating || updating;

  const submodules = useMemo(() => moduleSubmodules(module), [module]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submodule, setSubmodule] = useState<string>(submodules[0]?.key ?? "");
  const [onCreate, setOnCreate] = useState(true);
  const [onEdit, setOnEdit] = useState(false);
  const [scopeType, setScopeType] = useState<"record" | "section" | "fields">("record");
  const [scopeSections, setScopeSections] = useState<string[]>([]);
  const [scopeFields, setScopeFields] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"ALL" | "ANY">("ALL");
  const [rules, setRules] = useState<CriteriaRule[]>([]);
  const [stages, setStages] = useState<ApprovalStage[]>([emptyStage()]);
  const [approveStatus, setApproveStatus] = useState("");
  const [rejectStatus, setRejectStatus] = useState("");
  const [adminUserIds, setAdminUserIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name ?? "");
    setDescription(existing.description ?? "");
    setSubmodule((existing.submodule as string) ?? submodules[0]?.key ?? "");
    const trig = existing.trigger ?? "BOTH";
    setOnCreate(trig === "CREATE" || trig === "BOTH");
    setOnEdit(trig === "EDIT" || trig === "BOTH");
    const sc = (existing.scope ?? { type: "record" }) as ProcessScope;
    setScopeType(sc.type);
    setScopeSections(sc.type === "section" ? sc.sections : []);
    setScopeFields(sc.type === "fields" ? sc.fields : []);
    const crit = existing.criteria as Criteria | undefined;
    setMatchMode(crit?.matchMode === "ANY" ? "ANY" : "ALL");
    setRules(Array.isArray(crit?.rules) ? crit!.rules : []);
    setStages(Array.isArray(existing.stages) && existing.stages.length ? existing.stages : [emptyStage()]);
    setApproveStatus(existing.onApprove?.setStatus ?? "");
    setRejectStatus(existing.onReject?.setStatus ?? "");
    setAdminUserIds(Array.isArray(existing.adminUserIds) ? existing.adminUserIds : []);
    setIsActive(existing.isActive !== false);
  }, [existing, submodules]);

  const fields = useMemo(() => criteriaFields(module, submodule), [module, submodule]);
  const sections = useMemo(() => moduleSections(module, submodule), [module, submodule]);
  const statusOptions = useMemo(() => statusOptionsFor(module, submodule), [module, submodule]);
  const mastersByKey = useMemo(() => new Map(masters.map((m) => [m.key, m])), [masters]);

  // Role tree (for the hierarchy-scope hint): parent role id → its child roles.
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const childrenByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of roles) {
      if (!r.parentId) continue;
      (m.get(r.parentId) ?? m.set(r.parentId, []).get(r.parentId)!).push(r.id);
    }
    return m;
  }, [roles]);
  const descendantRoleNames = (roleIds: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    const stack = roleIds.flatMap((id) => childrenByParent.get(id) ?? []);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = rolesById.get(id);
      if (r) out.push(r.name);
      stack.push(...(childrenByParent.get(id) ?? []));
    }
    return out;
  };

  const addRule = () => setRules((r) => [...r, { field: fields[0]?.key ?? "", op: "equals", value: "" }]);
  const updateRule = (i: number, patch: Partial<CriteriaRule>) =>
    setRules((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeRule = (i: number) => setRules((r) => r.filter((_, idx) => idx !== i));

  const addStage = () => setStages((s) => [...s, emptyStage()]);
  const updateStage = (i: number, patch: Partial<ApprovalStage>) =>
    setStages((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeStage = (i: number) => setStages((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));
  const moveStage = (i: number, dir: -1 | 1) =>
    setStages((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = s.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const trigger = onCreate && onEdit ? "BOTH" : onCreate ? "CREATE" : onEdit ? "EDIT" : "";

  const buildScope = (): ProcessScope => {
    if (scopeType === "section") return { type: "section", sections: scopeSections };
    if (scopeType === "fields") return { type: "fields", fields: scopeFields };
    return { type: "record" };
  };

  const handleSave = async () => {
    if (!name.trim()) return toast({ variant: "destructive", title: "Name is required" });
    if (!trigger) return toast({ variant: "destructive", title: "Choose when to execute (creation and/or edit)" });
    if (scopeType === "section" && scopeSections.length === 0)
      return toast({ variant: "destructive", title: "Pick at least one section for the scope" });
    if (scopeType === "fields" && scopeFields.length === 0)
      return toast({ variant: "destructive", title: "Pick at least one field for the scope" });
    const validStages = stages.filter((s) => s.approverUserIds.length + s.approverRoleIds.length > 0);
    if (validStages.length === 0)
      return toast({ variant: "destructive", title: "Add at least one approver", description: "Each stage needs a user or role." });

    const body = {
      module,
      name: name.trim(),
      description: description.trim() || null,
      submodule,
      trigger: trigger as "CREATE" | "EDIT" | "BOTH",
      isActive,
      scope: buildScope(),
      criteria: { matchMode, rules: rules.filter((r) => r.field && r.op), scope: buildScope() } as Criteria,
      stages: validStages,
      onApprove: approveStatus ? { setStatus: approveStatus } : null,
      onReject: rejectStatus ? { setStatus: rejectStatus } : null,
      adminUserIds,
    };

    try {
      if (isEdit) await updateProcess({ id: processId!, body }).unwrap();
      else await createProcess(body).unwrap();
      toast({ title: isEdit ? "Approval process updated" : "Approval process created" });
      router.push(listHref);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save", description: e?.data?.error ?? "Please try again." });
    }
  };

  if (isEdit && loadingExisting) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading process…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label>{MODULE_LABEL[module]} Module</Label>
              <Select value={submodule} onValueChange={setSubmodule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {submodules.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High-value approval" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this approval process is for…" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>When to Execute</Label>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={onCreate} onCheckedChange={(v) => setOnCreate(!!v)} /> Record Creation
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={onEdit} onCheckedChange={(v) => setOnEdit(!!v)} /> Record Edit
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trigger scope (field / section level) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Trigger Scope</CardTitle>
          <p className="text-xs text-muted-foreground">
            Require approval for the whole record, only a section, or only specific fields.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={scopeType} onValueChange={(v) => setScopeType(v as typeof scopeType)}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="record">Whole record (all fields)</SelectItem>
              <SelectItem value="section">Specific section(s)</SelectItem>
              <SelectItem value="fields">Specific field(s)</SelectItem>
            </SelectContent>
          </Select>

          {scopeType === "section" && (
            <CheckboxGroup
              options={sections.map((s) => ({ value: s, label: s }))}
              selected={scopeSections}
              onChange={setScopeSections}
            />
          )}
          {scopeType === "fields" && (
            <CheckboxGroup
              options={fields.map((f) => ({ value: f.key, label: f.label }))}
              selected={scopeFields}
              onChange={setScopeFields}
            />
          )}
        </CardContent>
      </Card>

      {/* Rule criteria */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Rule Criteria</span>
            <span className="text-xs font-normal text-muted-foreground">
              {rules.length === 0 ? "Applies to every matching record" : "Records matching the rules below"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Match</span>
              <Select value={matchMode} onValueChange={(v) => setMatchMode(v as "ALL" | "ANY")}>
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">ALL rules</SelectItem>
                  <SelectItem value="ANY">ANY rule</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {rules.map((rule, i) => {
            const field = fields.find((f) => f.key === rule.field);
            const needsValue = (CRITERIA_OPERATORS.find((o) => o.op === rule.op)?.needsValue) ?? true;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                <Select value={rule.field} onValueChange={(v) => updateRule(i, { field: v })}>
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={rule.op} onValueChange={(v) => updateRule(i, { op: v as CriteriaRule["op"] })}>
                  <SelectTrigger className="h-9 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITERIA_OPERATORS.map((o) => (
                      <SelectItem key={o.op} value={o.op}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsValue && (
                  <CriteriaValueInput
                    field={field}
                    statusOptions={statusOptions}
                    masterOptions={field?.type === "master" ? mastersByKey.get(field.master ?? "")?.options ?? [] : []}
                    value={rule.value ?? ""}
                    onChange={(v) => updateRule(i, { value: v })}
                  />
                )}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRule(i)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRule} disabled={fields.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Add criteria
          </Button>
        </CardContent>
      </Card>

      {/* Approvers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Approvers</CardTitle>
          <p className="text-xs text-muted-foreground">Stages run in order; each must be approved before the next begins.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {stages.map((stage, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">Stage {i + 1}</Badge>
                  <Input
                    value={stage.name ?? ""}
                    onChange={(e) => updateStage(i, { name: e.target.value })}
                    placeholder="Stage label (optional)"
                    className="h-8 w-48"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveStage(i, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === stages.length - 1} onClick={() => moveStage(i, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={stages.length === 1} onClick={() => removeStage(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Approval by</span>
                <Select value={stage.mode} onValueChange={(v) => updateStage(i, { mode: v as "ALL" | "ANY" })}>
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">Any one approver</SelectItem>
                    <SelectItem value="ALL">All approvers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <PrincipalPicker
                users={users}
                roles={roles}
                selectedUserIds={stage.approverUserIds}
                selectedRoleIds={stage.approverRoleIds}
                onChange={(u, r) => updateStage(i, { approverUserIds: u, approverRoleIds: r })}
              />
              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-2.5">
                <Switch
                  checked={!!stage.hierarchyScoped}
                  onCheckedChange={(v) => updateStage(i, { hierarchyScoped: v })}
                  className="mt-0.5"
                />
                <div className="text-xs leading-relaxed">
                  <div className="font-medium text-foreground">Restrict to subordinate roles (role hierarchy)</div>
                  <p className="text-muted-foreground">
                    Role approvers can only act on requests raised by someone whose role is{" "}
                    <span className="font-medium">below theirs</span> in the org hierarchy. Specific users added above
                    are never restricted.
                  </p>
                  {stage.hierarchyScoped && stage.approverRoleIds.length > 0 && (() => {
                    const names = descendantRoleNames(stage.approverRoleIds);
                    return names.length > 0 ? (
                      <p className="mt-1 text-muted-foreground">
                        Covers requests raised by: <span className="text-foreground">{names.join(", ")}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-amber-600">
                        The selected role(s) have no sub-roles in the hierarchy — only listed users or admins could
                        approve. Set parent/child roles under Settings → Roles.
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addStage}>
            <Plus className="h-3.5 w-3.5" /> Add stage
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">On Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label>Set status (optional)</Label>
            <StatusSelect value={approveStatus} onChange={setApproveStatus} options={statusOptions} placeholder="Keep submitted status" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">On Rejection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label>Set status (optional)</Label>
            <StatusSelect value={rejectStatus} onChange={setRejectStatus} options={statusOptions} placeholder="Keep submitted status" />
          </CardContent>
        </Card>
      </div>

      {/* Process admins */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Process Admins</CardTitle>
          <p className="text-xs text-muted-foreground">These users can force-approve/reject any request in this process (besides org admins).</p>
        </CardHeader>
        <CardContent>
          <PrincipalPicker
            users={users}
            roles={roles}
            usersOnly
            selectedUserIds={adminUserIds}
            selectedRoleIds={[]}
            onChange={(u) => setAdminUserIds(u)}
            placeholder="Add process admin…"
          />
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between sticky bottom-0 bg-background/80 backdrop-blur border-t py-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={isActive} onCheckedChange={setIsActive} /> Active
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(listHref)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEdit ? "Save changes" : "Create process"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-md border p-3 max-h-48 overflow-y-auto">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
      {options.length === 0 && <span className="text-sm text-muted-foreground">No options</span>}
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CriteriaValueInput({
  field,
  statusOptions,
  masterOptions,
  value,
  onChange,
}: {
  field: { type: string; options?: Array<{ value: string; label: string }> } | undefined;
  statusOptions: Array<{ value: string; label: string }>;
  masterOptions: Array<{ id: string; value: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const asSelect = (opts: Array<{ value: string; label: string }>, placeholder: string) => (
    <Select value={value || "__"} onValueChange={(v) => onChange(v === "__" ? "" : v)}>
      <SelectTrigger className="h-9 w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__">Any</SelectItem>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (field?.type === "master") return asSelect(masterOptions.map((o) => ({ value: o.value, label: o.value })), "Select value");
  if (field?.type === "status") return asSelect(statusOptions, "Select status");
  if (field?.type === "select" && field.options) return asSelect(field.options, "Select value");
  return (
    <Input
      type={field?.type === "number" || field?.type === "currency" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value"
      className="h-9 w-44"
    />
  );
}
