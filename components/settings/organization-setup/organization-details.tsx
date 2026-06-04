"use client";

/**
 * Organization Details — the "Basic Details" identity form of the
 * Organization Setup screen (name, logo, website, type, contact, address).
 *
 * Mirrors the dirty-diff + sticky-save pattern from profile/OrganizationTab:
 *   `saved` is the server's last-known truth, `draft` is the working copy.
 *   Only changed fields are sent; the response refreshes `saved`. Writes are
 *   owner-only (enforced server-side by PUT /api/organization/settings); the
 *   UI mirrors that with a read-only banner for non-owners so we never fire a
 *   request that's guaranteed to 403.
 */

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useGetUserQuery } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { Save, Loader2, Lock, ImageIcon, AlertCircle } from "lucide-react";
import { ORG_TYPES, COUNTRIES, INDIAN_STATES } from "./constants";

// Editable identity fields kept in the draft. `name` lives on the org row;
// everything else lives in the org's `profile` JSON.
interface OrgForm {
  name: string;
  website: string;
  type: string;
  contactPerson: string;
  contactNumber: string;
  contactEmail: string;
  logoUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  zip: string;
}

const EMPTY_FORM: OrgForm = {
  name: "",
  website: "",
  type: "",
  contactPerson: "",
  contactNumber: "",
  contactEmail: "",
  logoUrl: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "",
  zip: "",
};

const NAME_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ServerSettings = {
  name: string;
  ownerId: string | null;
  profile: Partial<Record<keyof Omit<OrgForm, "name">, string>>;
};

function toForm(s: ServerSettings): OrgForm {
  const p = s.profile ?? {};
  return {
    name: s.name ?? "",
    website: p.website ?? "",
    type: p.type ?? "",
    contactPerson: p.contactPerson ?? "",
    contactNumber: p.contactNumber ?? "",
    contactEmail: p.contactEmail ?? "",
    logoUrl: p.logoUrl ?? "",
    addressLine1: p.addressLine1 ?? "",
    addressLine2: p.addressLine2 ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    country: p.country ?? "",
    zip: p.zip ?? "",
  };
}

export function OrganizationDetails() {
  const { toast } = useToast();
  const { data: me } = useGetUserQuery();
  const myId = me?.user?.id;
  const isAdmin = me?.user?.isAdmin ?? false;

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<OrgForm | null>(null);
  const [draft, setDraft] = useState<OrgForm>(EMPTY_FORM);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Owner or org admin may edit (the server enforces the same). `isOrgOwner`
  // from /me is the canonical owner signal; we also compare ids as a fallback.
  const isOwner =
    (me?.user?.isOrgOwner ?? false) || (!!myId && !!ownerId && myId === ownerId);
  const canEdit = isOwner || isAdmin;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organization/settings", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; settings?: ServerSettings }
          | null;
        if (!cancelled && json?.success && json.settings) {
          const form = toForm(json.settings);
          setSaved(form);
          setDraft(form);
          setOwnerId(json.settings.ownerId ?? null);
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

  const set = <K extends keyof OrgForm>(key: K, value: OrgForm[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = useMemo(() => {
    if (!saved) return false;
    return (Object.keys(draft) as Array<keyof OrgForm>).some(
      (k) => (draft[k] ?? "").trim() !== (saved[k] ?? "").trim(),
    );
  }, [draft, saved]);

  const nameTooShort = draft.name.trim().length === 0;
  const emailInvalid =
    draft.contactEmail.trim().length > 0 &&
    !EMAIL_RE.test(draft.contactEmail.trim());
  const canSave = canEdit && dirty && !nameTooShort && !emailInvalid && !busy;

  const save = async () => {
    if (!canSave || !saved) return;
    setBusy(true);
    try {
      // Only send what changed. `name` is a top-level field; the rest go
      // under `profile`.
      const body: { name?: string; profile?: Record<string, string> } = {};
      if (draft.name.trim() !== saved.name.trim()) body.name = draft.name.trim();

      const profile: Record<string, string> = {};
      (Object.keys(draft) as Array<keyof OrgForm>).forEach((k) => {
        if (k === "name") return;
        if ((draft[k] ?? "").trim() !== (saved[k] ?? "").trim()) {
          profile[k] = (draft[k] ?? "").trim();
        }
      });
      if (Object.keys(profile).length > 0) body.profile = profile;

      const res = await fetch("/api/organization/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; settings?: ServerSettings; error?: string }
        | null;
      if (!res.ok || !json?.success || !json.settings) {
        throw new Error(json?.error ?? `Save failed (${res.status})`);
      }
      const fresh = toForm(json.settings);
      setSaved(fresh);
      setDraft(fresh);
      setOwnerId(json.settings.ownerId ?? null);
      toast({ title: "Saved", description: "Organization details updated" });
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

  if (loading || !saved) return <DetailsSkeleton />;

  const readOnly = !canEdit;
  const stateIsIndia = draft.country === "India" || draft.country === "";
  const initials =
    draft.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—";

  return (
    <div className="pb-28">
      {/* Section heading */}
      <div className="mb-5 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">
          Basic Details
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Core identity of your organization, visible across the app.
        </p>
      </div>

      {/* Read-only banner for non-owners */}
      {readOnly && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-4 py-3">
          <Lock className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
          <div className="text-sm leading-snug">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Read-only access
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              {isAdmin
                ? "You can view these details, but only the organization owner can edit them."
                : "Only the organization owner can change these settings."}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm divide-y">
        {/* Logo */}
        <FieldRow label="Logo">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
              {draft.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.logoUrl}
                  alt="Organization logo"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-base font-semibold">{initials}</span>
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <Input
                value={draft.logoUrl}
                onChange={(e) => set("logoUrl", e.target.value)}
                disabled={readOnly || busy}
                placeholder="https://…/logo.png"
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">
                Paste a public image URL. Square images look best.
              </p>
            </div>
          </div>
        </FieldRow>

        {/* Name */}
        <FieldRow label="Name" required>
          <Input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={readOnly || busy}
            maxLength={NAME_MAX}
            aria-invalid={nameTooShort || undefined}
            placeholder="Organization name"
          />
          {nameTooShort && (
            <FieldError>Name can&apos;t be empty</FieldError>
          )}
        </FieldRow>

        {/* Website */}
        <FieldRow label="Website">
          <Input
            value={draft.website}
            onChange={(e) => set("website", e.target.value)}
            disabled={readOnly || busy}
            placeholder="Company website"
            inputMode="url"
          />
        </FieldRow>

        {/* Type of organization */}
        <FieldRow label="Type of organization">
          <Select
            value={draft.type || undefined}
            onValueChange={(v) => set("type", v)}
            disabled={readOnly || busy}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {ORG_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        {/* Contact person */}
        <FieldRow label="Contact person">
          <Input
            value={draft.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
            disabled={readOnly || busy}
            placeholder="Contact person"
          />
        </FieldRow>

        {/* Contact number */}
        <FieldRow label="Contact number">
          <Input
            value={draft.contactNumber}
            onChange={(e) => set("contactNumber", e.target.value)}
            disabled={readOnly || busy}
            placeholder="91-XXXXXXXXXX"
            inputMode="tel"
          />
        </FieldRow>

        {/* Contact email */}
        <FieldRow label="Contact email" required>
          <Input
            type="email"
            value={draft.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
            disabled={readOnly || busy}
            aria-invalid={emailInvalid || undefined}
            placeholder="name@company.com"
            inputMode="email"
          />
          {emailInvalid && <FieldError>Enter a valid email address</FieldError>}
        </FieldRow>

        {/* Primary address */}
        <FieldRow label="Primary address">
          <div className="space-y-3">
            <Input
              value={draft.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              disabled={readOnly || busy}
              placeholder="Address Line 1"
            />
            <Input
              value={draft.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              disabled={readOnly || busy}
              placeholder="Address Line 2"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
                disabled={readOnly || busy}
                placeholder="City"
              />
              {stateIsIndia ? (
                <Select
                  value={draft.state || undefined}
                  onValueChange={(v) => set("state", v)}
                  disabled={readOnly || busy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={draft.state}
                  onChange={(e) => set("state", e.target.value)}
                  disabled={readOnly || busy}
                  placeholder="State / Province"
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                value={draft.country || undefined}
                onValueChange={(v) => {
                  // Switching away from India clears a now-invalid state pick.
                  if (v !== "India" && stateIsIndia) set("state", "");
                  set("country", v);
                }}
                disabled={readOnly || busy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={draft.zip}
                onChange={(e) => set("zip", e.target.value)}
                disabled={readOnly || busy}
                placeholder="ZIP / PIN Code"
                inputMode="numeric"
              />
            </div>
          </div>
        </FieldRow>
      </div>

      {/* Sticky save bar (owner / admin only) */}
      {canEdit && (
        <div
          aria-live="polite"
          className={cn(
            "sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 mt-4 px-4 sm:px-6 lg:px-8 py-3",
            "bg-background/95 backdrop-blur border-t",
            "flex items-center justify-between gap-3",
            "transition-opacity duration-150",
            !dirty && "opacity-60",
          )}
        >
          <p className="text-xs text-muted-foreground min-w-0 truncate">
            {dirty ? (
              <span className="font-medium text-foreground">Unsaved changes</span>
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

// A label/value row that stacks on mobile and goes side-by-side (fixed label
// column) on larger screens — the Zoho-style form layout from the mockup.
function FieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-1.5 sm:gap-4 px-4 sm:px-6 py-4">
      <Label className="text-sm font-medium text-foreground pt-0 sm:pt-2.5">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="min-w-0 max-w-xl">{children}</div>
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs text-destructive inline-flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      {children}
    </p>
  );
}

function DetailsSkeleton() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-xl border bg-card shadow-sm divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-4 px-4 sm:px-6 py-4"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full max-w-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
