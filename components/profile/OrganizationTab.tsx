"use client";

/**
 * OrganizationTab — admin-only org settings.
 *
 * For now it ships a Currency picker; new org-wide settings (logo, fiscal
 * year, address, etc.) can be slotted in as additional <Card> sections
 * without disturbing the picker. The currency value is stored in
 * localStorage via the `org-currency` helper and best-effort POSTed to
 * `/api/organization/settings`. If the endpoint isn't there yet, the
 * local persistence is enough for `formatCurrency()` callers across the
 * app to show the chosen currency.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import {
  CURRENCIES,
  fetchOrgCurrency,
  findCurrency,
  formatCurrency,
  getOrgCurrency,
  setOrgCurrency,
} from "@/lib/org-currency";
import type { ProfileUser } from "@/components/profile/types";

interface Props {
  user: ProfileUser;
}

export default function OrganizationTab({ user }: Props) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<string>(() => getOrgCurrency());
  const [draft, setDraft] = useState<string>(() => getOrgCurrency());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // On mount, pull the authoritative value from the server so the admin
  // sees what's actually persisted (not just whatever's in this device's
  // localStorage cache). The fetch is memoised at module level so it
  // doesn't fire again if other components have already loaded it.
  useEffect(() => {
    let cancelled = false;
    fetchOrgCurrency()
      .then((cur) => {
        if (cancelled) return;
        setSaved(cur);
        setDraft(cur);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = saved !== draft;
  const draftCurrency = useMemo(() => findCurrency(draft), [draft]);

  const save = async () => {
    setBusy(true);
    try {
      // PUT to /api/organization/settings — persists to the DB,
      // updates the local cache and broadcasts the change to every
      // subscribed component on this tab + other open tabs.
      const persisted = await setOrgCurrency(draft);
      setSaved(persisted);
      setDraft(persisted);
      toast({
        title: "Organization currency saved",
        description: `All members of ${user.organization?.name ?? "your org"} will now see amounts in ${persisted}.`,
      });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const discard = () => setDraft(saved);

  return (
    <div className="space-y-6">
      {/* Org identity card — gives the admin context for the whole tab. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Organization
          </CardTitle>
          <CardDescription>
            Settings on this page apply to every member of your
            organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Name
            </span>
            <span className="font-medium">
              {user.organization?.name ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Your role
            </span>
            <span className="font-medium inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              {user.isOrgOwner ? "Owner" : "Admin"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Currency card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Currency
          </CardTitle>
          <CardDescription>
            All monetary amounts across the app — payroll, salary, bonuses,
            forms with currency fields — render in this currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Default currency
            </Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="h-10 w-full justify-between font-normal"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm tabular-nums w-12 text-muted-foreground">
                      {draft}
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
                            setDraft(c.code);
                            setOpen(false);
                          }}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Check
                              className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                c.code === draft
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

          {/* Live preview — proves the picker is wired up to the same
              formatCurrency() the rest of the app uses. */}
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Preview
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Salary</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(48500, draft)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bonus</span>
              <span className="font-medium tabular-nums">
                {formatCurrency(2750.5, draft)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(51250.5, draft)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save bar mirrors the one in PreferencesTab so the action surface
          is consistent across profile tabs. */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Changes apply org-wide once saved.
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={discard} disabled={!dirty || busy}>
            Discard
          </Button>
          <Button
            onClick={save}
            disabled={!dirty || busy}
            className="h-10"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Save changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
