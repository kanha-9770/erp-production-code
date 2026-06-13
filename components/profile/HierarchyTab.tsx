"use client";

/**
 * HierarchyTab — the per-user "reporting line" view on /profile#hierarchy.
 *
 * Every user sees ONLY their own slice of the org role tree (scoped
 * server-side, see /api/profile/hierarchy):
 *   • Reporting line — the chain of roles ABOVE them (top-most → direct
 *     manager), so they can see who they ultimately report to.
 *   • Your position — their own role, with co-holders highlighted.
 *   • Your team — the roles + people that report up to them, with
 *     per-role head-counts. Collapsible.
 *
 * The role tree itself is defined by admins in /settings/company; this is a
 * read-only, scoped projection of it for the individual.
 */

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Network,
  Users,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  UserCircle2,
  CornerDownRight,
} from "lucide-react";
import {
  useGetMyHierarchyQuery,
  type HierarchyNode,
  type HierarchyUser,
  type ScopedHierarchyChain,
} from "@/lib/api/hierarchy";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

// ── A single person chip (avatar + name), with a "You" marker. ──────────────
function PersonChip({ person }: { person: HierarchyUser }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3",
        person.isYou && "border-primary/40 bg-primary/5",
      )}
      title={person.email}
    >
      <Avatar className="h-6 w-6 shrink-0">
        {person.avatar ? (
          <AvatarImage src={person.avatar} alt={person.name} />
        ) : null}
        <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground/70">
          {initials(person.name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-medium">
        {person.name}
        {person.isYou && (
          <span className="ml-1 text-[10px] font-semibold text-primary">(You)</span>
        )}
      </span>
    </div>
  );
}

function PeopleList({ people }: { people: HierarchyUser[] }) {
  if (people.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">No one holds this role yet.</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => (
        <PersonChip key={p.id} person={p} />
      ))}
    </div>
  );
}

// ── An ancestor step in the upward reporting line. ──────────────────────────
function ReportingStep({ node, isTop }: { node: HierarchyNode; isTop: boolean }) {
  return (
    <div className="relative pl-7">
      {/* connector rail */}
      <span
        aria-hidden
        className={cn(
          "absolute left-2.5 w-px bg-border",
          isTop ? "top-4 bottom-0" : "top-0 bottom-0",
        )}
      />
      <span
        aria-hidden
        className="absolute left-1 top-3.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-border bg-background"
      />
      <div className="rounded-lg border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {node.isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <UserCircle2 className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="truncate text-sm font-semibold">{node.roleName}</span>
          <Badge variant="secondary" className="ml-auto h-5 shrink-0 font-normal text-[11px]">
            {node.userCount} {node.userCount === 1 ? "person" : "people"}
          </Badge>
        </div>
        {node.users.length > 0 && (
          <div className="mt-2">
            <PeopleList people={node.users} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── A node in the downward "reports to you" subtree (recursive). ────────────
function TeamNode({ node, depth }: { node: HierarchyNode; depth: number }) {
  const hasChildren = node.children.length > 0;
  // Expand the first two levels by default; deeper levels start collapsed to
  // keep big org charts manageable.
  const [open, setOpen] = useState(depth < 2);

  return (
    <div className={cn(depth > 0 && "border-l border-border pl-3 sm:pl-4")}>
      <div className="rounded-lg border bg-card">
        <button
          type="button"
          onClick={() => hasChildren && setOpen((o) => !o)}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2.5 text-left",
            hasChildren && "hover:bg-muted/40",
            !hasChildren && "cursor-default",
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
            {hasChildren ? (
              open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <CornerDownRight className="h-3.5 w-3.5 opacity-50" />
            )}
          </span>
          <span className="truncate text-sm font-medium">{node.roleName}</span>
          {node.isAdmin && (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <Badge variant="secondary" className="ml-auto h-5 shrink-0 font-normal text-[11px]">
            {node.userCount} {node.userCount === 1 ? "person" : "people"}
          </Badge>
        </button>

        {open && node.users.length > 0 && (
          <div className="border-t px-3 py-2.5">
            <PeopleList people={node.users} />
          </div>
        )}
      </div>

      {open && hasChildren && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <TeamNode key={child.roleId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── A full chain: reporting line + your position + your team. ───────────────
function ChainView({
  chain,
  showRoleHeading,
}: {
  chain: ScopedHierarchyChain;
  showRoleHeading: boolean;
}) {
  const { reportsTo, you, totalReports } = chain;

  return (
    <div className="space-y-4 sm:space-y-6">
      {showRoleHeading && (
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <span>As {you.roleName}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* ── Reporting line (who you report to) ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <ArrowUp className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base leading-tight">Reporting line</CardTitle>
              <CardDescription className="mt-0.5">
                {reportsTo.length > 0
                  ? "Who you report up to, from the top of your line down to your manager."
                  : "You're at the top of your reporting line."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {reportsTo.map((node, idx) => (
              <ReportingStep key={node.roleId} node={node} isTop={idx === 0} />
            ))}

            {/* Your own position — the anchor of the chain. */}
            <div className="relative pl-7">
              {reportsTo.length > 0 && (
                <span
                  aria-hidden
                  className="absolute left-2.5 top-0 h-3.5 w-px bg-border"
                />
              )}
              <span
                aria-hidden
                className="absolute left-1 top-3.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-primary bg-primary"
              />
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    {you.isAdmin ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <UserCircle2 className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="truncate text-sm font-semibold">{you.roleName}</span>
                  <Badge className="ml-auto h-5 shrink-0 border-transparent bg-primary/15 text-[11px] font-normal text-primary hover:bg-primary/15">
                    Your role
                  </Badge>
                </div>
                {you.users.length > 0 && (
                  <div className="mt-2">
                    <PeopleList people={you.users} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Your team (who reports to you) ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base leading-tight">Your team</CardTitle>
              <CardDescription className="mt-0.5">
                {totalReports > 0 ? (
                  <>
                    <span className="font-medium text-foreground/80 tabular-nums">
                      {totalReports}
                    </span>{" "}
                    {totalReports === 1 ? "person reports" : "people report"} up to
                    you across the roles below.
                  </>
                ) : (
                  "No one reports to you yet."
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {you.children.length > 0 ? (
            <div className="space-y-2">
              {you.children.map((child) => (
                <TeamNode key={child.roleId} node={child} depth={0} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
              <Users className="h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-foreground/70">
                No direct reports
              </p>
              <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">
                No roles sit below {you.roleName} in the org hierarchy yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function HierarchyTab() {
  const { data, isLoading, isError } = useGetMyHierarchyQuery();

  if (isLoading) {
    return <HierarchySkeleton />;
  }

  if (isError || !data?.success) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Network className="mx-auto h-7 w-7 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Couldn&apos;t load your hierarchy</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Please refresh the page or try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hierarchy = data.data;

  if (!hierarchy.hasRole || hierarchy.chains.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground">
            <Network className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium">No role assigned yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            You haven&apos;t been placed in the organization hierarchy. Ask your
            administrator to assign you a role in Settings → Company.
          </p>
        </CardContent>
      </Card>
    );
  }

  const multi = hierarchy.chains.length > 1;

  return (
    <div className="space-y-6 pb-12">
      {/* Intro */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Network className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Reporting structure</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Where you sit in the organization — who you report to and who
            reports to you.
          </p>
        </div>
      </div>

      {hierarchy.chains.map((chain) => (
        <ChainView key={chain.you.roleId} chain={chain} showRoleHeading={multi} />
      ))}
    </div>
  );
}

function HierarchySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-56 mt-2" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
