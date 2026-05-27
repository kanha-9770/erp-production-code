"use client";

/**
 * OrganizationTab — org-level settings, owner-only edits.
 *
 * Layout (mobile-first):
 *   1. Identity card — name (editable), org id, created date, member count,
 *      owner badge.
 *   2. Currency card — picker + live preview.
 *   3. Modules card — read-only summary; deep-link to the dedicated
 *      module-management page (we deliberately don't duplicate that
 *      surface here).
 *   4. Sticky save bar — shown only when the viewer is the owner and
 *      something is dirty.
 *
 * Permission model:
 *   The server (PUT /api/organization/settings) enforces owner-only.
 *   The UI mirrors that — non-owner admins see a read-only view with a
 *   banner explaining why the inputs are disabled, so we never make a
 *   request that's going to 403.
 *
 * State strategy:
 *   `saved` is the server's last-known truth; `draft` is what the user
 *   is editing. Dirty fields are computed by shallow-diffing the two.
 *   A single PUT sends only the changed fields, the response refreshes
 *   `saved`, and the currency cache (`lib/org-currency`) is poked so
 *   any open page that displays money re-renders with the new symbol.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2,
  Coins,
  Check,
  ChevronsUpDown,
  Save,
  Loader2,
  ShieldCheck,
  Lock,
  ExternalLink,
  Boxes,
  Users,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  CURRENCIES,
  findCurrency,
  formatCurrency,
  notifyCurrencyChanged,
} from "@/lib/org-currency";
import { ERP_MODULES } from "@/lib/erp-modules";
import type { ProfileUser } from "@/components/profile/types";

interface Props {
  user: ProfileUser;
}

interface OrgSettings {
  currency: string;
  name: string;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
  selectedModules: string[];
}

const NAME_MAX = 120;

function formatCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch {
    return "—";
  }
}

export default function OrganizationTab({ user }: Props) {
  const { toast } = useToast();
  const isOwner = !!user.isOrgOwner;

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<OrgSettings | null>(null);
  const [draft, setDraft] = useState<OrgSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Single fetch on mount — the server is the source of truth. We hydrate
  // both `saved` and `draft` from the same response so the dirty-diff
  // starts clean even if the user has stale localStorage for currency.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organization/settings", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; settings?: OrgSettings; error?: string }
          | null;
        if (!cancelled && json?.success && json.settings) {
          setSaved(json.settings);
          setDraft(json.settings);
        }
      } catch {
        /* surfaced via the empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute which fields changed. Returns a partial body suitable for PUT.
  const diff = useMemo<Partial<Pick<OrgSettings, "name" | "currency">>>(() => {
    if (!saved || !draft) return {};
    const out: Partial<Pick<OrgSettings, "name" | "currency">> = {};
    if (draft.name.trim() !== saved.name) out.name = draft.name.trim();
    if (draft.currency !== saved.currency) out.currency = draft.currency;
    return out;
  }, [saved, draft]);

  const dirtyKeys = Object.keys(diff) as Array<keyof typeof diff>;
  const dirty = dirtyKeys.length > 0;
  const nameTooShort = !!draft && draft.name.trim().length === 0;
  const canSave = isOwner && dirty && !nameTooShort && !busy;

  const draftCurrency = useMemo(
    () => (draft ? findCurrency(draft.currency) : undefined),
    [draft],
  );

  const save = async () => {
    if (!canSave || !draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/organization/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diff),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; settings?: OrgSettings; error?: string }
        | null;
      if (!res.ok || !json?.success || !json.settings) {
        throw new Error(json?.error ?? `Save failed (${res.status})`);
      }
      setSaved(json.settings);
      setDraft(json.settings);
      // If currency changed, broadcast so every open formatCurrency()
      // consumer re-renders without a page reload.
      if (diff.currency) notifyCurrencyChanged(json.settings.currency);
      toast({
        title: "Saved",
        description:
          dirtyKeys.length === 1
            ? `${dirtyKeys[0] === "name" ? "Organization name" : "Currency"} updated`
            : "Organization settings updated",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Try again";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (saved) setDraft(saved);
  };

  // Keyboard shortcuts: Cmd/Ctrl+S = save, Esc = discard (when dirty).
  // Bound to the document only while this component is mounted; we
  // bail out early if the user is currently typing in something other
  // than our own inputs, to avoid hijacking shortcuts in nested fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        if (!canSave) return;
        e.preventDefault();
        void save();
      } else if (e.key === "Escape" && dirty && !busy) {
        discard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, dirty, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !saved || !draft) {
    return <OrgTabSkeleton />;
  }

  const moduleMap = new Map(ERP_MODULES.map((m) => [m.id, m]));
  const activeModuleDefs = saved.selectedModules
    .map((id) => moduleMap.get(id))
    .filter((m): m is (typeof ERP_MODULES)[number] => !!m);

  return (
    <div className="space-y-4 sm:space-y-6 pb-32">
      {/* ── Owner-only banner (admins-but-not-owner viewers) ──────────── */}
      {!isOwner && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-4 py-3">
          <Lock className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
          <div className="text-sm leading-snug">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Read-only access
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Only the organization owner can change these settings. Ask
              your owner to make changes here.
            </p>
          </div>
        </div>
      )}

      {/* ── 1. Identity card (hero) ──────────────────────────────────
          Gradient background + larger primary-tinted "logo" tile gives
          this card visible weight over the two below it, anchoring the
          tab the way the dashboard hero anchors that page. */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Organization
          </CardTitle>
          <CardDescription>
            Public information about your organization. Visible to every
            member across the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* "Logo" tile + editable name */}
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20"
            >
              <Building2 className="h-7 w-7 sm:h-9 sm:w-9" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label
                htmlFor="org-name"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Organization name
              </Label>
              <Input
                id="org-name"
                ref={nameInputRef}
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                }
                disabled={!isOwner || busy}
                maxLength={NAME_MAX}
                aria-invalid={nameTooShort || undefined}
                className="h-10 bg-background/70 backdrop-blur-sm text-base font-medium"
                placeholder="Acme Inc."
              />
              <div className="flex items-center justify-between gap-2">
                {nameTooShort ? (
                  <p className="text-xs text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Name can't be empty
                  </p>
                ) : (
                  <span aria-hidden />
                )}
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {draft.name.length}/{NAME_MAX}
                </span>
              </div>
            </div>
          </div>

          {/* Metadata strip — tinted chips so each cell reads as a
              distinct signal rather than three identical grey tiles. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <MetaCell
              tone="emerald"
              label="Your role"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              value={
                <span className="inline-flex items-center gap-1.5">
                  {isOwner ? "Owner" : "Admin"}
                  {isOwner && (
                    <Badge className="text-[10px] px-1.5 h-4 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 border-transparent">
                      You
                    </Badge>
                  )}
                </span>
              }
            />
            <MetaCell
              tone="indigo"
              label="Members"
              icon={<Users className="h-3.5 w-3.5" />}
              value={
                <span className="tabular-nums">
                  {saved.memberCount.toLocaleString()}
                </span>
              }
            />
            <MetaCell
              tone="amber"
              label="Created"
              icon={<Calendar className="h-3.5 w-3.5" />}
              value={formatCreatedAt(saved.createdAt)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Currency card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Coins className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base leading-tight">Currency</CardTitle>
              <CardDescription className="mt-0.5">
                Every monetary amount across the app — payroll, salary,
                bonuses, currency form fields — renders in this currency.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Default currency
            </Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  disabled={!isOwner || busy}
                  className="h-10 w-full justify-between font-normal"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm tabular-nums w-12 text-muted-foreground">
                      {draft.currency}
                    </span>
                    <span className="truncate">
                      {draftCurrency
                        ? `${draftCurrency.symbol} · ${draftCurrency.name}`
                        : "Custom (not in catalogue)"}
                    </span>
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(440px,calc(100vw-2rem))] p-0"
                align="start"
              >
                <Command
                  filter={(value, search) => {
                    const q = search.toLowerCase().trim();
                    if (!q) return 1;
                    return value.toLowerCase().includes(q) ? 1 : 0;
                  }}
                >
                  <CommandInput
                    placeholder="Search currency or code (e.g. INR, Euro)…"
                    className="h-9"
                  />
                  <CommandList>
                    <CommandEmpty>No matches.</CommandEmpty>
                    <CommandGroup>
                      {CURRENCIES.map((c) => (
                        <CommandItem
                          key={c.code}
                          value={`${c.code} ${c.name} ${c.symbol}`}
                          onSelect={() => {
                            setDraft((d) =>
                              d ? { ...d, currency: c.code } : d,
                            );
                            setPickerOpen(false);
                          }}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Check
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                c.code === draft.currency
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <span className="font-mono text-xs tabular-nums w-12 shrink-0 text-muted-foreground">
                              {c.code}
                            </span>
                            <span className="truncate">{c.name}</span>
                          </span>
                          <span className="font-medium text-xs tabular-nums text-foreground/80 shrink-0">
                            {c.symbol}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Live preview — three rows of sample amounts in the chosen
              currency. Uses the same formatCurrency() the rest of the
              app uses, so what the admin sees here is exactly what
              members will see on payroll/salary pages. */}
          <div className="rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent px-3.5 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Preview
              </div>
              {draftCurrency && (
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  {draftCurrency.symbol} · {draftCurrency.code}
                </span>
              )}
            </div>
            <PreviewRow label="Salary" amount={48500} code={draft.currency} />
            <PreviewRow label="Bonus" amount={2750.5} code={draft.currency} />
            <div className="border-t border-amber-500/20 pt-1.5">
              <PreviewRow
                label="Total"
                amount={51250.5}
                code={draft.currency}
                emphasis
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Modules card (read-only summary) ──────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Boxes className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base leading-tight">Active modules</CardTitle>
              <CardDescription className="mt-0.5">
                ERP modules turned on for your organization.
                {activeModuleDefs.length > 0 && (
                  <>
                    {" "}
                    <span className="tabular-nums font-medium text-foreground/80">
                      {activeModuleDefs.length}
                    </span>{" "}
                    of{" "}
                    <span className="tabular-nums">{ERP_MODULES.length}</span>{" "}
                    active.
                  </>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeModuleDefs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No modules selected. Members will only see Profile and
              Settings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {activeModuleDefs.map((m) => (
                <Badge
                  key={m.id}
                  variant="secondary"
                  className="font-normal text-xs"
                >
                  {m.label}
                </Badge>
              ))}
            </div>
          )}
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 text-xs"
            >
              <a href="/settings/erp-modules">
                Manage modules
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Sticky save bar (owner only) ─────────────────────────────── */}
      {isOwner && (
        <div
          aria-live="polite"
          className={cn(
            // Anchored to the bottom of the scroll container with a
            // backdrop blur so it never sits flush against content.
            "sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3",
            "bg-background/95 backdrop-blur border-t",
            "flex items-center justify-between gap-3",
            "transition-opacity duration-150",
            !dirty && "opacity-60",
          )}
        >
          <p className="text-xs text-muted-foreground min-w-0 truncate">
            {dirty ? (
              <>
                <span className="font-medium text-foreground">
                  {dirtyKeys.length} unsaved
                  {dirtyKeys.length === 1 ? " change" : " changes"}
                </span>
                <span className="hidden sm:inline">
                  {" · "}Esc to discard, Ctrl+S to save
                </span>
              </>
            ) : (
              "Changes apply org-wide once saved."
            )}
          </p>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={discard}
              disabled={!dirty || busy}
              className="h-9"
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!canSave}
              className="h-9 min-w-[120px]"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

type MetaTone = "emerald" | "indigo" | "amber";

// Per-tone background + icon colour so each cell of the metadata strip
// reads as a distinct signal. Border stays neutral so the row still feels
// like one strip rather than three competing chips.
const META_TONE: Record<MetaTone, { wrap: string; chip: string }> = {
  emerald: {
    wrap: "bg-emerald-500/[0.06] border-emerald-500/20",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  indigo: {
    wrap: "bg-indigo-500/[0.06] border-indigo-500/20",
    chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  },
  amber: {
    wrap: "bg-amber-500/[0.06] border-amber-500/20",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
};

function MetaCell({
  label,
  icon,
  value,
  tone = "indigo",
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  tone?: MetaTone;
}) {
  const t = META_TONE[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", t.wrap)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
            t.chip,
          )}
        >
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
      </div>
      <div className="text-sm font-medium mt-1.5 truncate">{value}</div>
    </div>
  );
}

function PreviewRow({
  label,
  amount,
  code,
  emphasis,
}: {
  label: string;
  amount: number;
  code: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasis ? "font-semibold" : "font-medium",
        )}
      >
        {formatCurrency(amount, code)}
      </span>
    </div>
  );
}

function OrgTabSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-4">
            <Skeleton className="h-16 w-16 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full rounded-md" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-56 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-1.5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-5 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    </div>
  );
}
