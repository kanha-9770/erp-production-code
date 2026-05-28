"use client";

/**
 * Per-user permission override sheet.
 *
 * Renders the user's full effective permission matrix and lets the admin
 * flip each permission between three states:
 *
 *   • Inherit (●) — no override row; the user follows their role's grant.
 *   • Grant   (✓) — override row with granted=true.
 *   • Deny    (✗) — override row with granted=false.
 *
 * On save, we POST a single batched diff to /api/users/[id]/permission-matrix
 * containing only the rows that CHANGED from inherit (upserts) plus the
 * IDs of any previously-active override the admin removed.
 *
 * Layout:
 *   - Sheet on desktop & mobile (Radix slide-in from the right on lg+, full
 *     screen on smaller widths via the Sheet primitive's responsive sizing).
 *   - Grouped by Module, then by Resource (form/global) inside each module,
 *     each group collapsible.
 *   - Filter chips for: Granted-only, Overridden-only, Search.
 *
 * Performance:
 *   - One GET on open (returns user + roles + permissions + modules +
 *     rolePerms + overrides — see route file).
 *   - One PUT on save (transactional upsert+deactivate).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleDot,
  Filter,
  Loader2,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types matching /api/users/[id]/permission-matrix GET ────────────────────

interface ApiPermission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  resource: string;
}
interface ApiModule {
  id: string;
  name: string;
}
interface ApiRolePerm {
  permissionId: string;
  moduleId: string | null;
  formId: string | null;
  granted: boolean;
}
interface ApiOverride {
  id: string;
  permissionId: string;
  moduleId: string | null;
  formId: string | null;
  granted: boolean;
  isActive: boolean;
}
interface ApiUser {
  id: string;
  name: string;
  email: string;
  status: string;
}
interface ApiRole {
  id: string;
  name: string;
  isAdmin: boolean;
}

interface MatrixResponse {
  success: boolean;
  user: ApiUser;
  roles: ApiRole[];
  permissions: ApiPermission[];
  modules: ApiModule[];
  rolePerms: ApiRolePerm[];
  overrides: ApiOverride[];
  error?: string;
}

type CellState = "inherit" | "grant" | "deny";

interface OverrideSheetProps {
  userId: string | null;
  /** Role name purely for the header — saves a lookup. */
  roleName: string | null;
  open: boolean;
  onClose: () => void;
  /** Fired after a successful save so the parent can refetch counts. */
  onSaved?: () => void;
}

export function UserOverrideSheet({
  userId,
  roleName,
  open,
  onClose,
  onSaved,
}: OverrideSheetProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatrixResponse | null>(null);

  // Working state, keyed by `${permissionId}|${moduleId||""}|${formId||""}`.
  // Holds the user's CURRENT desired state for each scope. We diff this
  // against the initial state on save to produce upserts + removeIds.
  const [working, setWorking] = useState<Map<string, CellState>>(new Map());

  // Initial snapshot of the working map at load time — used for the diff.
  const [initial, setInitial] = useState<Map<string, CellState>>(new Map());

  // UI filters
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "overridden" | "granted">(
    "all",
  );
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(
    new Set(),
  );

  // ── Load on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/users/${userId}/permission-matrix`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: MatrixResponse) => {
        if (cancelled) return;
        if (!j.success) {
          setError(j.error ?? "Failed to load");
          return;
        }
        setData(j);
        const { state, init } = computeInitialState(j);
        setWorking(state);
        setInitial(init);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  // ── Filtered + grouped data ────────────────────────────────────────────────
  const groups = useMemo(() => {
    if (!data) return [];
    return buildGroups(data, working, query, filter);
  }, [data, working, query, filter]);

  const dirtyCount = useMemo(() => {
    let count = 0;
    working.forEach((v, k) => {
      if ((initial.get(k) ?? "inherit") !== v) count++;
    });
    return count;
  }, [working, initial]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const setCell = (key: string, state: CellState) => {
    setWorking((prev) => {
      const next = new Map(prev);
      next.set(key, state);
      return next;
    });
  };

  const handleSave = async () => {
    if (!data || !userId) return;
    setSaving(true);

    // Compute diff between working and initial.
    const upserts: Array<{
      permissionId: string;
      moduleId: string | null;
      formId: string | null;
      granted: boolean;
    }> = [];
    const removeIds: string[] = [];
    const overrideIdByKey = new Map<string, string>();
    for (const o of data.overrides) {
      overrideIdByKey.set(makeKey(o.permissionId, o.moduleId, o.formId), o.id);
    }

    working.forEach((state, key) => {
      const prev = initial.get(key) ?? "inherit";
      if (prev === state) return;
      const { permissionId, moduleId, formId } = parseKey(key);
      if (state === "inherit") {
        const id = overrideIdByKey.get(key);
        if (id) removeIds.push(id);
      } else {
        upserts.push({
          permissionId,
          moduleId,
          formId,
          granted: state === "grant",
        });
      }
    });

    if (upserts.length === 0 && removeIds.length === 0) {
      setSaving(false);
      onClose();
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}/permission-matrix`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upserts, removeIds }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      toast({
        title: "Overrides saved",
        description: `${j.upserted ?? 0} updated, ${j.removed ?? 0} cleared.`,
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="text-base">
            {data?.user
              ? `Override permissions — ${data.user.name}`
              : "Override permissions"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {roleName
              ? `Inherited from role: ${roleName}. Toggle a permission to grant, deny, or inherit.`
              : "Toggle a permission to grant, deny, or inherit from role."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Toolbar */}
          <div className="px-5 py-3 border-b bg-muted/30 flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search permission, module, or resource…"
                className="pl-8 h-9"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <FilterChip
                label="All"
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
              <FilterChip
                label="Overridden"
                active={filter === "overridden"}
                onClick={() => setFilter("overridden")}
                icon={<ShieldAlert className="h-3 w-3" />}
              />
              <FilterChip
                label="Granted"
                active={filter === "granted"}
                onClick={() => setFilter("granted")}
                icon={<ShieldCheck className="h-3 w-3" />}
              />
            </div>
          </div>

          {/* Body */}
          <ScrollArea className="flex-1">
            <div className="px-5 py-4">
              {error ? (
                <ErrorBlock message={error} />
              ) : loading ? (
                <MatrixSkeleton />
              ) : groups.length === 0 ? (
                <EmptyBlock query={query} filter={filter} />
              ) : (
                <div className="space-y-3">
                  {groups.map((g) => (
                    <ModuleGroup
                      key={g.moduleKey}
                      group={g}
                      collapsed={collapsedModules.has(g.moduleKey)}
                      onToggle={() =>
                        setCollapsedModules((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.moduleKey)) next.delete(g.moduleKey);
                          else next.add(g.moduleKey);
                          return next;
                        })
                      }
                      onSetCell={setCell}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <SheetFooter className="px-5 py-3 border-t bg-background sticky bottom-0 gap-2 flex-row sm:justify-between sm:items-center">
          <div className="text-xs text-muted-foreground">
            {dirtyCount > 0 ? (
              <span className="font-medium text-foreground">
                {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
              </span>
            ) : (
              "No changes"
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || loading || dirtyCount === 0}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-full text-[11px] font-medium border inline-flex items-center gap-1.5 transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface PermissionRow {
  key: string;
  permission: ApiPermission;
  inherited: boolean; // role grants this at this scope
  current: CellState;
}

interface ResourceGroup {
  resourceKey: string; // "global" | formId
  resourceLabel: string;
  rows: PermissionRow[];
}

interface ModuleGroupData {
  moduleKey: string;
  moduleLabel: string;
  resources: ResourceGroup[];
}

function ModuleGroup({
  group,
  collapsed,
  onToggle,
  onSetCell,
}: {
  group: ModuleGroupData;
  collapsed: boolean;
  onToggle: () => void;
  onSetCell: (key: string, state: CellState) => void;
}) {
  const totals = useMemo(() => {
    let granted = 0;
    let denied = 0;
    let overridden = 0;
    let inherited = 0;
    for (const res of group.resources) {
      for (const row of res.rows) {
        if (row.current === "grant") granted++;
        if (row.current === "deny") denied++;
        if (row.inherited && row.current === "inherit") inherited++;
        if (
          (row.current === "grant" && !row.inherited) ||
          (row.current === "deny" && row.inherited)
        )
          overridden++;
      }
    }
    return { granted, denied, overridden, inherited };
  }, [group]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            collapsed && "-rotate-90",
          )}
        />
        <span className="text-sm font-semibold">{group.moduleLabel}</span>
        <div className="ml-auto flex items-center gap-1">
          {totals.granted > 0 && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-800"
            >
              {totals.granted} granted
            </Badge>
          )}
          {totals.denied > 0 && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] border-rose-200 bg-rose-50 text-rose-800"
            >
              {totals.denied} denied
            </Badge>
          )}
          {totals.overridden > 0 && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] border-amber-200 bg-amber-50 text-amber-800"
            >
              {totals.overridden} overridden
            </Badge>
          )}
        </div>
      </button>
      {!collapsed && (
        <div className="border-t">
          {group.resources.map((res, ri) => (
            <div key={res.resourceKey}>
              {ri > 0 && <Separator />}
              <div className="px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                  {res.resourceLabel}
                </div>
                <div className="space-y-1">
                  {res.rows.map((row) => (
                    <PermissionRowView
                      key={row.key}
                      row={row}
                      onChange={(state) => onSetCell(row.key, state)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionRowView({
  row,
  onChange,
}: {
  row: PermissionRow;
  onChange: (state: CellState) => void;
}) {
  // Effective: what the user actually ends up with.
  const effectiveGranted =
    row.current === "grant" || (row.current === "inherit" && row.inherited);

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-1 rounded hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{row.permission.name}</span>
          {row.inherited && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[9px] font-normal text-muted-foreground border-dashed"
            >
              inherited
            </Badge>
          )}
        </div>
        {row.permission.description ? (
          <p className="text-[10px] text-muted-foreground truncate">
            {row.permission.description}
          </p>
        ) : null}
      </div>
      <TriStateToggle
        value={row.current}
        inherited={row.inherited}
        onChange={onChange}
      />
      <div
        className={cn(
          "w-1.5 h-6 rounded-full shrink-0 transition-colors",
          effectiveGranted ? "bg-emerald-500" : "bg-muted",
        )}
        aria-label={effectiveGranted ? "Effective: granted" : "Effective: denied"}
        title={effectiveGranted ? "User has this permission" : "User does not have this permission"}
      />
    </div>
  );
}

function TriStateToggle({
  value,
  inherited,
  onChange,
}: {
  value: CellState;
  inherited: boolean;
  onChange: (state: CellState) => void;
}) {
  return (
    <div className="inline-flex h-7 rounded-md border bg-background overflow-hidden text-[10px]">
      <ToggleButton
        active={value === "inherit"}
        onClick={() => onChange("inherit")}
        title={
          inherited
            ? "Inherit from role (currently granted)"
            : "Inherit from role (no role grant)"
        }
        icon={<CircleDot className="h-3 w-3" />}
        label="Inherit"
        tone="neutral"
      />
      <ToggleButton
        active={value === "grant"}
        onClick={() => onChange("grant")}
        title="Grant explicitly"
        icon={<Check className="h-3 w-3" />}
        label="Grant"
        tone="grant"
      />
      <ToggleButton
        active={value === "deny"}
        onClick={() => onChange("deny")}
        title="Deny explicitly"
        icon={<X className="h-3 w-3" />}
        label="Deny"
        tone="deny"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
  tone: "neutral" | "grant" | "deny";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "px-2 h-full inline-flex items-center gap-1 font-medium transition-colors",
        active
          ? tone === "grant"
            ? "bg-emerald-500 text-white"
            : tone === "deny"
            ? "bg-rose-500 text-white"
            : "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EmptyBlock({
  query,
  filter,
}: {
  query: string;
  filter: "all" | "overridden" | "granted";
}) {
  return (
    <div className="py-12 text-center">
      <Filter className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">
        No permissions match{query ? ` "${query}"` : ""}
        {filter !== "all" ? ` with filter "${filter}"` : ""}.
      </p>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeKey(
  permissionId: string,
  moduleId: string | null,
  formId: string | null,
) {
  return `${permissionId}|${moduleId ?? ""}|${formId ?? ""}`;
}

function parseKey(key: string): {
  permissionId: string;
  moduleId: string | null;
  formId: string | null;
} {
  const [permissionId, m, f] = key.split("|");
  return {
    permissionId,
    moduleId: m === "" ? null : m,
    formId: f === "" ? null : f,
  };
}

/**
 * Build the initial working state for every cell that could be relevant.
 *
 * A "cell" exists for each (permission × scope) the user could care about:
 *   - For every inherited rolePerm (so the admin sees what they inherit).
 *   - For every existing override (so the admin can flip it).
 *   - For every permission × org-global scope (so the admin can add new
 *     overrides at the module-agnostic level). We don't pre-create a cell
 *     for every (permission × module × form) combo — too many keys — but
 *     the admin can still drill in via the global rows.
 */
function computeInitialState(j: MatrixResponse): {
  state: Map<string, CellState>;
  init: Map<string, CellState>;
} {
  const state = new Map<string, CellState>();

  // Seed every inherited grant with state "inherit".
  for (const rp of j.rolePerms) {
    const k = makeKey(rp.permissionId, rp.moduleId, rp.formId);
    state.set(k, "inherit");
  }

  // Seed every (permission, global) scope so admins can grant at the
  // org-wide level even when no role-level grant exists.
  for (const p of j.permissions) {
    const k = makeKey(p.id, null, null);
    if (!state.has(k)) state.set(k, "inherit");
  }

  // Apply existing active overrides — they take precedence.
  for (const o of j.overrides) {
    if (!o.isActive) continue;
    const k = makeKey(o.permissionId, o.moduleId, o.formId);
    state.set(k, o.granted ? "grant" : "deny");
  }

  // Snapshot a copy for diffing on save.
  const init = new Map(state);
  return { state, init };
}

/**
 * Group the working state into Module → Resource → Permission rows, with
 * search + filter applied. Module "global" gets a bucket of its own at the
 * top so global-scope rows are easy to find.
 */
function buildGroups(
  data: MatrixResponse,
  working: Map<string, CellState>,
  query: string,
  filter: "all" | "overridden" | "granted",
): ModuleGroupData[] {
  const q = query.trim().toLowerCase();

  const permById = new Map(data.permissions.map((p) => [p.id, p]));
  const moduleById = new Map(data.modules.map((m) => [m.id, m]));

  // role-perm lookup so we can show the "inherited" badge.
  const inheritedSet = new Set(
    data.rolePerms.map((p) => makeKey(p.permissionId, p.moduleId, p.formId)),
  );

  // Bucket by moduleId.
  const byModule = new Map<string, Map<string, PermissionRow[]>>();

  for (const [key, state] of working.entries()) {
    const { permissionId, moduleId, formId } = parseKey(key);
    const perm = permById.get(permissionId);
    if (!perm) continue;

    const row: PermissionRow = {
      key,
      permission: perm,
      inherited: inheritedSet.has(key),
      current: state,
    };

    // Filter
    if (filter === "overridden" && state === "inherit") continue;
    if (filter === "granted" && !(state === "grant" || (state === "inherit" && row.inherited)))
      continue;
    if (q) {
      const hay = [
        perm.name,
        perm.description ?? "",
        perm.resource,
        perm.category,
        moduleId ? moduleById.get(moduleId)?.name ?? "" : "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const mKey = moduleId ?? "__global__";
    const rKey = formId ?? "__module__";
    if (!byModule.has(mKey)) byModule.set(mKey, new Map());
    const resMap = byModule.get(mKey)!;
    if (!resMap.has(rKey)) resMap.set(rKey, []);
    resMap.get(rKey)!.push(row);
  }

  // Sort + assemble.
  const groups: ModuleGroupData[] = [];

  // Global first.
  const globalRes = byModule.get("__global__");
  if (globalRes) {
    groups.push({
      moduleKey: "__global__",
      moduleLabel: "Global (no module)",
      resources: assembleResources(globalRes),
    });
  }

  // Then named modules, alphabetical by name.
  const orderedModuleKeys = Array.from(byModule.keys())
    .filter((k) => k !== "__global__")
    .sort((a, b) => {
      const an = moduleById.get(a)?.name ?? a;
      const bn = moduleById.get(b)?.name ?? b;
      return an.localeCompare(bn);
    });

  for (const mKey of orderedModuleKeys) {
    const resMap = byModule.get(mKey)!;
    groups.push({
      moduleKey: mKey,
      moduleLabel: moduleById.get(mKey)?.name ?? "Unnamed module",
      resources: assembleResources(resMap),
    });
  }

  return groups;
}

function assembleResources(
  resMap: Map<string, PermissionRow[]>,
): ResourceGroup[] {
  const out: ResourceGroup[] = [];
  const moduleScope = resMap.get("__module__");
  if (moduleScope && moduleScope.length > 0) {
    out.push({
      resourceKey: "__module__",
      resourceLabel: "Module-wide",
      rows: moduleScope.sort((a, b) =>
        a.permission.name.localeCompare(b.permission.name),
      ),
    });
  }
  const formKeys = Array.from(resMap.keys()).filter((k) => k !== "__module__");
  for (const fKey of formKeys) {
    out.push({
      resourceKey: fKey,
      resourceLabel: `Form ${fKey.slice(-6)}`,
      rows: (resMap.get(fKey) ?? []).sort((a, b) =>
        a.permission.name.localeCompare(b.permission.name),
      ),
    });
  }
  return out;
}
