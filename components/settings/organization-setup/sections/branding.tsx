"use client";

/**
 * Domains and Rebranding — custom domain + white-label brand settings stored
 * in the `branding` setup section. Includes a live preview of the brand colors.
 */

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useOrgSetupSection } from "../use-org-setup";
import { SetupSaveBar } from "../setup-save-bar";
import { ReadOnlyBanner } from "../read-only-banner";

interface Branding {
  brandName: string;
  customDomain: string;
  primaryColor: string;
  accentColor: string;
  loginLogoUrl: string;
  faviconUrl: string;
  footerText: string;
}

const DEFAULTS: Branding = {
  brandName: "",
  customDomain: "",
  primaryColor: "#4f46e5",
  accentColor: "#0ea5e9",
  loginLogoUrl: "",
  faviconUrl: "",
  footerText: "",
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalize(b: Partial<Branding> | undefined): Branding {
  return {
    brandName: b?.brandName ?? "",
    customDomain: b?.customDomain ?? "",
    primaryColor: b?.primaryColor || DEFAULTS.primaryColor,
    accentColor: b?.accentColor || DEFAULTS.accentColor,
    loginLogoUrl: b?.loginLogoUrl ?? "",
    faviconUrl: b?.faviconUrl ?? "",
    footerText: b?.footerText ?? "",
  };
}

export function BrandingSection() {
  const { saved, isOwner, loading, saving, save } = useOrgSetupSection<
    Record<string, string>
  >("branding", {});

  const savedBranding = useMemo(() => normalize(saved as Partial<Branding>), [saved]);
  const [draft, setDraft] = useState<Branding>(DEFAULTS);
  useEffect(() => {
    if (!loading) setDraft(savedBranding);
  }, [loading, savedBranding]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedBranding);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const ro = !isOwner || saving;

  return (
    <div className="pb-28">
      <div className="mb-5 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">
          Domains and Rebranding
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Custom domain, logo, and brand colors for a white-labeled experience.
        </p>
      </div>

      {!isOwner && <ReadOnlyBanner what="branding and domain settings" />}

      <div className="space-y-6">
        {/* Identity */}
        <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold">Brand identity</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Brand name</Label>
              <Input
                value={draft.brandName}
                onChange={(e) => set("brandName", e.target.value)}
                disabled={ro}
                placeholder="Shown in place of the default product name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custom domain</Label>
              <Input
                value={draft.customDomain}
                onChange={(e) => set("customDomain", e.target.value)}
                disabled={ro}
                placeholder="app.yourcompany.com"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Login logo URL</Label>
              <Input
                value={draft.loginLogoUrl}
                onChange={(e) => set("loginLogoUrl", e.target.value)}
                disabled={ro}
                placeholder="https://…/logo.png"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Favicon URL</Label>
              <Input
                value={draft.faviconUrl}
                onChange={(e) => set("faviconUrl", e.target.value)}
                disabled={ro}
                placeholder="https://…/favicon.ico"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Footer text</Label>
              <Input
                value={draft.footerText}
                onChange={(e) => set("footerText", e.target.value)}
                disabled={ro}
                placeholder="© Your Company. All rights reserved."
              />
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold">Brand colors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ColorField
              label="Primary color"
              value={draft.primaryColor}
              onChange={(v) => set("primaryColor", v)}
              disabled={ro}
            />
            <ColorField
              label="Accent color"
              value={draft.accentColor}
              onChange={(v) => set("accentColor", v)}
              disabled={ro}
            />
          </div>

          {/* Live preview */}
          <div className="rounded-lg border overflow-hidden">
            <div
              className="px-4 py-3 text-white text-sm font-medium"
              style={{ backgroundColor: safeColor(draft.primaryColor) }}
            >
              {draft.brandName || "Your Brand"}
            </div>
            <div className="p-4 bg-background flex items-center gap-3">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: safeColor(draft.primaryColor) }}
              >
                Primary
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: safeColor(draft.accentColor) }}
              >
                Accent
              </button>
              <span className="text-xs text-muted-foreground">Preview</span>
            </div>
          </div>
        </div>
      </div>

      {isOwner && (
        <SetupSaveBar
          dirty={dirty}
          saving={saving}
          onSave={() => save(draft as unknown as Record<string, string>)}
          onDiscard={() => setDraft(savedBranding)}
        />
      )}
    </div>
  );
}

function safeColor(c: string): string {
  return HEX_RE.test(c) ? c : "#4f46e5";
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const valid = HEX_RE.test(value);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safeColor(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-60",
          )}
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="#4f46e5"
          aria-invalid={!valid || undefined}
          className="font-mono"
        />
      </div>
      {!valid && (
        <p className="text-xs text-destructive">Use a hex color like #4f46e5</p>
      )}
    </div>
  );
}
