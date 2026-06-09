"use client";

import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Search, RotateCcw, Trash2, Loader2, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useDispatch } from "react-redux";
import { baseApi } from "@/lib/api/baseApi";

type TrashItem = {
  id: string;
  resourceType: string;
  resourceId: string;
  resourceName: string | null;
  deletedById: string | null;
  deletedByName: string | null;
  deletedAt: string;
  organizationId: string | null;
};

const FRIENDLY_TYPE: Record<string, string> = {
  Form: "Form",
  FormModule: "Module",
  FormSection: "Section",
  FormField: "Field",
  Subform: "Subform",
  FormRecord: "Record",
  Holiday: "Holiday",
  Role: "Role",
  OrganizationUnit: "Unit",
  User: "User",
  UserUnitAssignment: "User assignment",
  WorkflowRule: "Workflow rule",
  CrmFunction: "Function",
  FunctionBinding: "Function binding",
  SavedFilter: "Saved filter",
  RoutePermission: "Route permission",
  PayrollRecord: "Payroll record",
  LookupTemplate: "Lookup template",
  LookupSource: "Lookup source",
  ChatConversation: "Chat",
  AIProvider: "AI provider",
  AIProviderKey: "AI provider key",
};

function friendlyType(t: string) {
  return FRIENDLY_TYPE[t] ?? t;
}

/**
 * RTK Query cache tags to invalidate after restoring each resource type, so the
 * relevant screens refetch and the restored record shows up without a full page
 * reload. The trash page restores via plain fetch (it's type-agnostic), so it
 * can't rely on a mutation's invalidatesTags — we dispatch invalidation here
 * based on what came back. Types not listed simply don't force a refetch (their
 * screens may not be RTK-backed); add an entry when one needs it.
 */
const RESTORE_INVALIDATION: Record<string, string[]> = {
  Role: ["OrgRoles", "Roles"],
  OrganizationUnit: ["OrgUnits"],
  UserUnitAssignment: ["OrgUnits", "AdminUsers"],
  User: ["AdminUsers", "Employees"],
  Form: ["Form", "FormDetail", "OrgModules"],
  FormModule: ["OrgModules", "Module", "PermissionModules"],
  FormRecord: ["Records", "Record"],
  RoutePermission: ["RoutePermissions", "RouteAccess"],
};

/** Preset retention options. "custom" reveals a numeric input. */
const PRESETS: Array<{ value: string; label: string; days: number | null }> = [
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "180", label: "180 days", days: 180 },
  { value: "365", label: "1 year", days: 365 },
  { value: "0", label: "Never (keep forever)", days: 0 },
  { value: "custom", label: "Custom…", days: null },
];

/** Map a numeric retention value back to the matching preset key (or "custom"). */
function presetForDays(days: number): string {
  const match = PRESETS.find((p) => p.days === days);
  return match?.value ?? "custom";
}

export function TrashPage() {
  const { toast } = useToast();
  const dispatch = useDispatch();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [emptying, setEmptying] = useState(false);

  // Retention policy state. `null` retentionDays means "loading" — we don't
  // render the "expires in" column until we know the policy, otherwise items
  // would briefly look like they live forever.
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [presetValue, setPresetValue] = useState<string>("30");
  const [customDays, setCustomDays] = useState<string>("30");
  const [savingRetention, setSavingRetention] = useState(false);

  const safeJson = async (res: Response): Promise<any | null> => {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); }
    catch { return { _raw: text }; }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/trash/settings", { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok || !json?.success) {
        // Don't surface as a hard error — the list still works without
        // settings. We just show the default in the UI.
        console.warn("[trash-settings] load failed:", json?.error || json?._raw || res.status);
        setRetentionDays(30);
        setPresetValue("30");
        setCustomDays("30");
        return;
      }
      const days = Number(json.data?.retentionDays ?? 30);
      setRetentionDays(days);
      setPresetValue(presetForDays(days));
      setCustomDays(String(days));
    } catch (err) {
      console.warn("[trash-settings] load threw:", err);
      setRetentionDays(30);
      setPresetValue("30");
      setCustomDays("30");
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trash", { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?._raw || `Failed to load trash (${res.status})`);
      }
      setItems(json.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load trash");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Settings + items load in parallel — neither blocks the other.
    loadSettings();
    refresh();
  }, []);

  const types = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.resourceType))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== "all" && it.resourceType !== typeFilter) return false;
      if (!q) return true;
      const haystack = [
        it.resourceName ?? "",
        it.resourceType,
        friendlyType(it.resourceType),
        it.deletedByName ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, typeFilter]);

  const setBusy = (id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const restore = async (item: TrashItem) => {
    setBusy(item.id, true);
    try {
      const res = await fetch(`/api/trash/${item.id}/restore`, {
        method: "POST",
        // Same-origin by default, but be explicit so the auth-token cookie
        // always rides along — without it, the route returns 401 and the
        // user sees a generic "Restore failed (401)" with no clue why.
        credentials: "include",
      });
      const json = await safeJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?._raw || `Restore failed (${res.status})`);
      }
      toast({ title: "Restored", description: `${friendlyType(item.resourceType)} "${item.resourceName ?? item.resourceId}" is back.` });
      // Invalidate the RTK cache for the restored resource so screens like the
      // Role Hierarchy refetch immediately instead of showing stale data until
      // a manual page reload.
      const tags = RESTORE_INVALIDATION[item.resourceType];
      if (tags?.length) dispatch(baseApi.util.invalidateTags(tags));
      // Re-fetch from the server rather than just filtering locally — if the
      // restore created cascading side-effects (e.g. expired items got purged
      // alongside), the list should reflect the authoritative state.
      await refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't restore", description: e?.message ?? "Unknown error" });
    } finally {
      setBusy(item.id, false);
    }
  };

  const purge = async (item: TrashItem) => {
    setBusy(item.id, true);
    try {
      const res = await fetch(`/api/trash/${item.id}`, { method: "DELETE" });
      const json = await safeJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?._raw || `Delete failed (${res.status})`);
      }
      toast({ title: "Deleted permanently", description: `${friendlyType(item.resourceType)} "${item.resourceName ?? item.resourceId}" is gone.` });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't delete", description: e?.message ?? "Unknown error" });
    } finally {
      setBusy(item.id, false);
    }
  };

  const emptyAll = async () => {
    setEmptying(true);
    try {
      const res = await fetch(`/api/trash`, { method: "DELETE" });
      const json = await safeJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?._raw || `Empty failed (${res.status})`);
      }
      toast({ title: "Recycle bin emptied", description: `${json.data?.count ?? 0} item(s) deleted permanently.` });
      setItems([]);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't empty", description: e?.message ?? "Unknown error" });
    } finally {
      setEmptying(false);
    }
  };

  /**
   * Resolve the days-to-save based on the current preset/custom inputs. Returns
   * `null` if the input is invalid (caller should reject the save).
   */
  const resolveRetentionInput = (): number | null => {
    if (presetValue === "custom") {
      const n = Number(customDays);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    }
    const preset = PRESETS.find((p) => p.value === presetValue);
    return preset?.days ?? null;
  };

  const saveRetention = async () => {
    const days = resolveRetentionInput();
    if (days === null) {
      toast({ variant: "destructive", title: "Invalid retention", description: "Enter a non-negative number of days (0 = never)." });
      return;
    }
    setSavingRetention(true);
    try {
      const res = await fetch("/api/trash/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: days }),
      });
      const json = await safeJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?._raw || `Save failed (${res.status})`);
      }
      const saved = Number(json.data?.retentionDays ?? days);
      setRetentionDays(saved);
      setPresetValue(presetForDays(saved));
      setCustomDays(String(saved));
      toast({
        title: "Retention updated",
        description: saved === 0
          ? "Items will stay in the recycle bin until you delete them manually."
          : `Items will be auto-deleted after ${saved} day${saved === 1 ? "" : "s"}.`,
      });
      // Reload the list — the new policy may have purged some items already.
      refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't save", description: e?.message ?? "Unknown error" });
    } finally {
      setSavingRetention(false);
    }
  };

  /**
   * For an item, return the date it will be auto-purged (or null if retention
   * is disabled). We compute this on the client from `deletedAt + retentionDays`
   * — the server's authoritative purge runs lazily on the next list call, so
   * this is just a UX hint.
   */
  const expiresAt = (deletedAt: string): Date | null => {
    if (!retentionDays || retentionDays <= 0) return null;
    return new Date(parseISO(deletedAt).getTime() + retentionDays * 86400000);
  };

  const expiryLabel = (deletedAt: string): { label: string; tone: "muted" | "warn" | "danger" } => {
    const exp = expiresAt(deletedAt);
    if (!exp) return { label: "Never", tone: "muted" };
    const now = Date.now();
    const ms = exp.getTime() - now;
    if (ms <= 0) return { label: "Purging soon", tone: "danger" };
    const days = ms / 86400000;
    const tone: "muted" | "warn" | "danger" =
      days < 1 ? "danger" : days < 3 ? "warn" : "muted";
    return { label: `in ${formatDistanceToNowStrict(exp)}`, tone };
  };

  const isCustom = presetValue === "custom";
  const showExpiryColumn = retentionDays !== null;

  return (
    <div className="p-4 space-y-4 bg-background min-h-screen">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Recycle Bin</CardTitle>
              <CardDescription className="text-xs mt-1">
                Items deleted from anywhere in the app land here. Restore puts
                them back exactly as they were. Permanent delete cannot be
                undone.
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={items.length === 0 || loading || emptying}
                >
                  {emptying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                  Empty bin
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty the recycle bin?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all {items.length} item(s).
                    They cannot be restored afterward.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={emptyAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, empty it
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pt-2 pb-4">
          {/* Retention policy strip */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>Auto-delete after</span>
            </div>

            <Select value={presetValue} onValueChange={setPresetValue} disabled={savingRetention}>
              <SelectTrigger className="w-full sm:w-44 h-8 text-sm">
                <SelectValue placeholder="Choose retention" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isCustom && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  className="w-24 h-8 text-sm"
                  placeholder="Days"
                  disabled={savingRetention}
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={saveRetention}
              disabled={savingRetention || retentionDays === null}
              className="h-8"
            >
              {savingRetention ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Save
            </Button>

            <p className="text-xs text-muted-foreground sm:ml-auto">
              {retentionDays === null
                ? "Loading…"
                : retentionDays === 0
                  ? "Items stay in the recycle bin until deleted manually."
                  : `Items older than ${retentionDays} day${retentionDays === 1 ? "" : "s"} are removed automatically.`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type, or deleter…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm h-9"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-56 h-9 text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>{friendlyType(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="text-center py-4 text-red-600 text-sm">
              <p>{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
                Retry
              </Button>
            </div>
          )}

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs font-medium py-2 px-3">Name</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Type</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Deleted by</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Deleted at</TableHead>
                  {showExpiryColumn && (
                    <TableHead className="text-xs font-medium py-2 px-3">Auto-deletes</TableHead>
                  )}
                  <TableHead className="text-xs font-medium py-2 px-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: showExpiryColumn ? 6 : 5 }).map((_, j) => (
                        <TableCell key={j} className="py-2 px-3"><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showExpiryColumn ? 6 : 5} className="text-center py-8 text-muted-foreground text-sm">
                      {items.length === 0 ? "Recycle bin is empty." : "No items match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((it) => {
                    const busy = busyIds.has(it.id);
                    const exp = showExpiryColumn ? expiryLabel(it.deletedAt) : null;
                    return (
                      <TableRow key={it.id} className="hover:bg-muted/30">
                        <TableCell className="py-2 px-3 text-sm font-medium max-w-xs">
                          <span className="truncate block" title={it.resourceName ?? it.resourceId}>
                            {it.resourceName ?? it.resourceId}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">{it.resourceId}</span>
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          <Badge variant="outline" className="text-xs">{friendlyType(it.resourceType)}</Badge>
                        </TableCell>
                        <TableCell className="py-2 px-3 text-xs">
                          {it.deletedByName ?? "—"}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-xs">
                          {format(parseISO(it.deletedAt), "MMM dd, yyyy hh:mm a")}
                        </TableCell>
                        {showExpiryColumn && exp && (
                          <TableCell className="py-2 px-3 text-xs">
                            <span
                              className={
                                exp.tone === "danger"
                                  ? "text-red-600 font-medium"
                                  : exp.tone === "warn"
                                    ? "text-amber-600 font-medium"
                                    : "text-muted-foreground"
                              }
                              title={(() => {
                                const d = expiresAt(it.deletedAt);
                                return d ? format(d, "MMM dd, yyyy hh:mm a") : "Never";
                              })()}
                            >
                              {exp.label}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => restore(it)}
                            >
                              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                              Restore
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}>
                                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    "{it.resourceName ?? it.resourceId}" will be removed for good.
                                    This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => purge(it)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Yes, delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && !error && (
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {items.length} item(s)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
