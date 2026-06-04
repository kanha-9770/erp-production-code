"use client";

/**
 * Email Authentication — the sending domain plus the SPF / DKIM / DMARC DNS
 * records the org must publish. The domain (and a manual "verified" flag) are
 * persisted in the `emailAuth` setup section; the records are derived from the
 * domain and shown with copy buttons.
 */

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ShieldCheck, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrgSetupSection } from "../use-org-setup";
import { SetupSaveBar } from "../setup-save-bar";
import { ReadOnlyBanner } from "../read-only-banner";

interface EmailAuth {
  sendingDomain: string;
  verified: boolean;
}

const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})+$/;

function normalize(e: Record<string, unknown> | undefined): EmailAuth {
  return {
    sendingDomain: typeof e?.sendingDomain === "string" ? e.sendingDomain : "",
    verified: e?.verified === true || e?.verified === "true",
  };
}

interface DnsRecord {
  label: string;
  type: string;
  host: string;
  value: string;
}

function buildRecords(domain: string): DnsRecord[] {
  const d = domain || "yourdomain.com";
  return [
    {
      label: "SPF",
      type: "TXT",
      host: d,
      value: "v=spf1 include:_spf.erp-mail.com ~all",
    },
    {
      label: "DKIM",
      type: "TXT",
      host: `erp._domainkey.${d}`,
      value: "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCB…",
    },
    {
      label: "DMARC",
      type: "TXT",
      host: `_dmarc.${d}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${d}; fo=1`,
    },
  ];
}

export function EmailAuthSection() {
  const { toast } = useToast();
  const { saved, isOwner, loading, saving, save } = useOrgSetupSection<
    Record<string, string>
  >("emailAuth", {});

  const savedAuth = useMemo(() => normalize(saved), [saved]);
  const [draft, setDraft] = useState<EmailAuth>({
    sendingDomain: "",
    verified: false,
  });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) setDraft(savedAuth);
  }, [loading, savedAuth]);

  const dirty =
    draft.sendingDomain.trim() !== savedAuth.sendingDomain.trim() ||
    draft.verified !== savedAuth.verified;
  const domainValid =
    draft.sendingDomain.trim() === "" ||
    DOMAIN_RE.test(draft.sendingDomain.trim());

  const records = useMemo(
    () => buildRecords(draft.sendingDomain.trim()),
    [draft.sendingDomain],
  );

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast({ title: "Copied", description: "Record value copied to clipboard" });
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Copy it manually", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const ro = !isOwner || saving;

  return (
    <div className="pb-28">
      <div className="mb-5 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground">
          Email Authentication
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Authenticate your sending domain with SPF, DKIM, and DMARC so system
          email lands in the inbox.
        </p>
      </div>

      {!isOwner && <ReadOnlyBanner what="email authentication" />}

      <div className="space-y-6">
        {/* Domain + status */}
        <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <Label>Sending domain</Label>
              <Input
                value={draft.sendingDomain}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sendingDomain: e.target.value }))
                }
                disabled={ro}
                placeholder="yourcompany.com"
                aria-invalid={!domainValid || undefined}
              />
              {!domainValid && (
                <p className="text-xs text-destructive">
                  Enter a valid domain like yourcompany.com
                </p>
              )}
            </div>
            <div className="shrink-0">
              {draft.verified ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent hover:bg-emerald-500/15 gap-1.5 py-1.5 px-3">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="gap-1.5 py-1.5 px-3 text-amber-700 dark:text-amber-300"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Not verified
                </Badge>
              )}
            </div>
          </div>

          {isOwner && (
            <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={draft.verified}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, verified: e.target.checked }))
                }
                className="h-4 w-4 rounded border-input"
              />
              Mark this domain as verified (after publishing the records below)
            </label>
          )}
        </div>

        {/* DNS records */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">DNS records to publish</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add these to your domain&apos;s DNS, then mark the domain as
              verified.
            </p>
          </div>
          <div className="divide-y">
            {records.map((r) => (
              <div key={r.label} className="px-4 sm:px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {r.type}
                  </Badge>
                  <span className="text-sm font-semibold">{r.label}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)] sm:items-start">
                  <span className="text-xs font-medium text-muted-foreground pt-1.5">
                    Host
                  </span>
                  <CopyRow
                    text={r.host}
                    copied={copied === `${r.label}-host`}
                    onCopy={() => copy(`${r.label}-host`, r.host)}
                  />
                  <span className="text-xs font-medium text-muted-foreground pt-1.5">
                    Value
                  </span>
                  <CopyRow
                    text={r.value}
                    copied={copied === `${r.label}-value`}
                    onCopy={() => copy(`${r.label}-value`, r.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isOwner && (
        <SetupSaveBar
          dirty={dirty}
          saving={saving}
          disabled={!domainValid}
          onSave={() =>
            save({
              sendingDomain: draft.sendingDomain.trim(),
              verified: String(draft.verified),
            })
          }
          onDiscard={() => setDraft(savedAuth)}
        />
      )}
    </div>
  );
}

function CopyRow({
  text,
  copied,
  onCopy,
}: {
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="flex-1 min-w-0 truncate rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs font-mono">
        {text}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onCopy}
        aria-label="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
