"use client";

/**
 * Admin / Managing Director — silent duplicate-leads review queue.
 *
 * Regular agents never see this — the API returns 403 to anyone who
 * isn't admin / org-owner / Managing Director / Principal Broker.
 *
 * The page shows every AGENT-origin lead the system flagged as a
 * duplicate of an earlier capture, grouped by the original. For each
 * pair we surface:
 *
 *   - Both rows side-by-side (photo, name, phone, email).
 *   - Who captured each (assigned agent).
 *   - Which signal triggered the flag: phone / email / photo
 *     (with the Hamming distance for photo matches).
 *
 * Admin actions:
 *   - "Delete duplicate" — hard-deletes the duplicate row. The original
 *     stays untouched, the agent who created the duplicate loses their
 *     copy. We do this rather than "merge" because Phase 1 has no
 *     activity-history yet to merge.
 *
 * "Unflag" / "Promote duplicate to original" are deliberately not in
 * this round — they require a separate endpoint and a clear UX for
 * "what happens to the activity log on the demoted row". File them
 * under follow-ups.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetLeadDuplicatesQuery,
  useDeleteLeadMutation,
  type LeadDuplicateGroup,
} from "@/lib/api/real-estate/leads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Copy as CopyIcon,
  Search,
  Trash2,
  ExternalLink,
  Phone,
  Mail,
  Image as ImageIcon,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { formatDate } from "@/components/real-estate/constants";

export default function AdminLeadDuplicatesPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch } =
    useGetLeadDuplicatesQuery();
  const [deleteLead] = useDeleteLeadMutation();
  const [search, setSearch] = useState("");

  const groups = data?.data ?? [];

  // Lightweight client-side filter — duplicate volume per org is tiny
  // (single digits / dozens at most), so a string includes-check across
  // every name/phone/email per group is plenty fast.
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    const haystack = (g: LeadDuplicateGroup) =>
      [
        g.original.name,
        g.original.email,
        g.original.phone,
        ...g.duplicates.flatMap((d) => [d.name, d.email, d.phone]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return groups.filter((g) => haystack(g).includes(q));
  }, [groups, search]);

  const totalDuplicates = groups.reduce((n, g) => n + g.duplicates.length, 0);

  const handleDeleteDuplicate = async (lead: { id: string; name: string }) => {
    if (
      !confirm(
        `Permanently delete the duplicate capture for "${lead.name}"?\n\nThe original lead stays. The agent who created this row will no longer see it.`,
      )
    ) {
      return;
    }
    try {
      await deleteLead(lead.id).unwrap();
      toast({ title: "Duplicate deleted" });
      refetch();
    } catch (e: any) {
      toast({
        title: "Could not delete",
        description: e?.data?.error ?? e?.message,
        variant: "destructive",
      });
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-5xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  // ── Forbidden / errored ──────────────────────────────────────────────────
  if (isError) {
    const status = (error as any)?.status;
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">
              {status === 403 ? "Admins only" : "Couldn't load duplicates"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {status === 403
                ? "Duplicate review is restricted to admins, the Managing Director, and Principal Brokers."
                : "Try again in a moment. If the problem persists, check the server logs."}
            </p>
            <Button asChild variant="outline">
              <Link href="/real-estate/leads">Back to leads</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (groups.length === 0) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-5xl space-y-5">
        <PageHeader total={0} totalDuplicates={0} />
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <h2 className="font-semibold">No duplicate captures detected.</h2>
            <p className="text-sm text-muted-foreground">
              Every agent-captured lead in this org is unique on phone, email,
              and photo. New silent duplicates will show up here as soon as the
              system flags them.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main ────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-5xl space-y-5">
      <PageHeader total={groups.length} totalDuplicates={totalDuplicates} />

      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 max-w-md text-sm"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No groups match this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((g) => (
            <DuplicateGroupCard
              key={g.original.id}
              group={g}
              onDeleteDuplicate={handleDeleteDuplicate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function PageHeader({
  total,
  totalDuplicates,
}: {
  total: number;
  totalDuplicates: number;
}) {
  return (
    <div className="flex items-start gap-3">
      <Button asChild variant="ghost" size="icon">
        <Link href="/real-estate/leads" aria-label="Back to leads">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <div className="flex-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary shrink-0" />
          Duplicate leads
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Silent duplicates the system flagged when an agent re-captured a
          person already in the pipeline. Only you see this — the agents
          themselves see only their own copy.
        </p>
      </div>
      {total > 0 && (
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{totalDuplicates}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            duplicate{totalDuplicates === 1 ? "" : "s"} in {total} group
            {total === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Group card ────────────────────────────────────────────────────────────

function DuplicateGroupCard({
  group,
  onDeleteDuplicate,
}: {
  group: LeadDuplicateGroup;
  onDeleteDuplicate: (l: { id: string; name: string }) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {group.duplicates.length} duplicate
          {group.duplicates.length === 1 ? "" : "s"} of{" "}
          <span className="text-foreground">{group.original.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Original */}
        <DuplicateRow
          variant="original"
          lead={{
            id: group.original.id,
            name: group.original.name,
            email: group.original.email,
            phone: group.original.phone,
            photoUrl: group.original.photoUrl,
            createdAt: group.original.createdAt,
            capturedBy: group.original.capturedBy,
            matchedBy: null,
            phashDistance: null,
            phashSignal: null,
          }}
        />

        {/* Duplicates */}
        {group.duplicates.map((d) => (
          <DuplicateRow
            key={d.id}
            variant="duplicate"
            lead={{
              id: d.id,
              name: d.name,
              email: d.email,
              phone: d.phone,
              photoUrl: d.photoUrl ?? null,
              createdAt: d.createdAt,
              capturedBy: d.capturedBy,
              matchedBy: d.matchedBy,
              phashDistance: d.phashDistance,
              phashSignal: d.phashSignal,
            }}
            onDelete={() => onDeleteDuplicate({ id: d.id, name: d.name })}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Row (works for both original + duplicate) ────────────────────────────

interface RowLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null | undefined;
  createdAt: string;
  capturedBy: { id: string; name: string | null; email: string | null } | null;
  matchedBy: "phone" | "email" | "photo" | null;
  phashDistance: number | null;
  phashSignal: "dhash" | "phash" | null;
}

function DuplicateRow({
  variant,
  lead,
  onDelete,
}: {
  variant: "original" | "duplicate";
  lead: RowLead;
  onDelete?: () => void;
}) {
  const isOriginal = variant === "original";
  const capturedByLabel =
    lead.capturedBy?.name ?? lead.capturedBy?.email ?? "—";
  const initials = (lead.capturedBy?.name ?? lead.capturedBy?.email ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  return (
    <div
      className={
        "rounded-md border p-3 flex flex-col sm:flex-row gap-3 " +
        (isOriginal
          ? "bg-emerald-50/40 border-emerald-200/60 dark:bg-emerald-950/10 dark:border-emerald-900/30"
          : "bg-muted/30")
      }
    >
      {/* Photo */}
      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md border bg-background overflow-hidden shrink-0 flex items-center justify-center">
        {lead.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lead.photoUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={isOriginal ? "default" : "secondary"}
            className="text-[10px]"
          >
            {isOriginal ? "Original" : "Duplicate"}
          </Badge>
          <span className="font-medium truncate">{lead.name}</span>
          {!isOriginal && (
            <MatchBadge
              match={lead.matchedBy}
              phashDistance={lead.phashDistance}
              phashSignal={lead.phashSignal}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 min-w-0">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.phone ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate">Captured by {capturedByLabel}</span>
          </div>
          <div className="tabular-nums">
            on {formatDate(lead.createdAt)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex sm:flex-col gap-1.5 sm:justify-start">
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href={`/real-estate/leads/${lead.id}`}>
            Open <ExternalLink className="h-3 w-3 ml-1" />
          </Link>
        </Button>
        {!isOriginal && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Matched-by badge ─────────────────────────────────────────────────────

function MatchBadge({
  match,
  phashDistance,
  phashSignal,
}: {
  match: "phone" | "email" | "photo" | null;
  phashDistance: number | null;
  phashSignal: "dhash" | "phash" | null;
}) {
  if (match == null) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <AlertTriangle className="h-3 w-3" />
        Stale flag
      </Badge>
    );
  }
  if (match === "phone") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Phone className="h-3 w-3" />
        Same phone
      </Badge>
    );
  }
  if (match === "email") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Mail className="h-3 w-3" />
        Same email
      </Badge>
    );
  }
  // photo — surface which hash signalled (perceptual pHash is the
  // stronger "looks the same" signal; dHash means "near-identical
  // bytes"). Distance lets admin spot near-misses worth reviewing.
  const signalLabel =
    phashSignal === "phash"
      ? "perceptual"
      : phashSignal === "dhash"
        ? "byte-similar"
        : null;
  return (
    <Badge
      variant="outline"
      className="text-[10px] gap-1 border-amber-300 text-amber-700 dark:border-amber-900/60 dark:text-amber-300"
    >
      <CopyIcon className="h-3 w-3" />
      Same photo
      {signalLabel && <span className="opacity-70">· {signalLabel}</span>}
      {phashDistance != null && (
        <span className="opacity-70">· dist {phashDistance}</span>
      )}
    </Badge>
  );
}
