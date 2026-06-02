'use client';

/**
 * EmployeeProfileCard — a rich, social-media-style profile header for the
 * user dashboard. Replaces the old plain greeting hero + basic work card
 * with a single "this is me" card: a gradient cover, an overlapping avatar,
 * the user's identity, a stat strip (tenure · shift · hours · team), and a
 * contact row — the kind of profile surface people expect from a modern app.
 *
 * Data strategy (so first paint stays instant):
 *   - Identity that the dashboard already has on first paint — name,
 *     designation, department, status, join date, roles — comes in via the
 *     `summary` prop (the /dashboard/summary payload). The card renders
 *     fully from this with zero wait.
 *   - Richer fields — avatar, verified email, phone, location, org, shift,
 *     in/out time, team — are pulled from useGetUserQuery() (/api/auth/me),
 *     which is almost always warm in the RTK cache (sidebar/profile use it
 *     too). They fill in seamlessly when that query resolves.
 *
 * No salary or sensitive identifiers are shown — safe for every user to see
 * their own card.
 */

import Link from 'next/link';
import {
  Clock, Sunrise, Sunset, Timer, Users, CalendarDays, Building2,
  Mail, Phone, MapPin, BadgeCheck, ArrowUpRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useGetUserQuery } from '@/lib/api/auth';
import type { DashboardSummary } from '@/lib/api/dashboard';

type SummaryUser = DashboardSummary['user'];

// ── small formatting helpers ──────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Hello';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Hello';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// "09:00" (24h) → "9:00 AM". Passes through free-text values untouched.
function formatTime(raw?: string | null): string | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return raw.trim() || null;
  let h = Number(m[1]);
  const min = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${period}`;
}

function parseHM(raw?: string | null): number | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Working span; wraps past midnight so overnight shifts read positive.
function workingHours(inT?: string | null, outT?: string | null): string | null {
  const a = parseHM(inT);
  const b = parseHM(outT);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff <= 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const mm = diff % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

// "1y 3mo" / "5mo" / "12d" since joining — the social-profile "member since"
// signal, but expressed as elapsed time which reads more naturally on a
// work dashboard.
function tenure(from?: string | null): string | null {
  if (!from) return null;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
    return days <= 0 ? 'Today' : `${days}d`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y}y ${m}mo`;
  if (y) return `${y}y`;
  return `${m}mo`;
}

function statusTone(status?: string | null): { label: string; cls: string } | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s.includes('ACTIVE')) {
    return { label: status, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-transparent' };
  }
  if (s.includes('LEAVE')) {
    return { label: status, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent' };
  }
  if (s.includes('TERMINAT') || s.includes('INACTIVE')) {
    return { label: status, cls: 'bg-red-500/15 text-red-600 dark:text-red-400 border-transparent' };
  }
  return { label: status, cls: 'bg-muted text-muted-foreground border-transparent' };
}

// ── component ──────────────────────────────────────────────────────────────

export function EmployeeProfileCard({ summary }: { summary: SummaryUser }) {
  const { data } = useGetUserQuery();
  const u = data?.user;
  const e = u?.employee;

  // Identity — summary first (instant), enriched by /api/auth/me.
  const fullName =
    e?.employeeName ||
    summary.name ||
    [u?.first_name, u?.last_name].filter(Boolean).join(' ') ||
    summary.email ||
    'You';
  const designation = e?.designation || summary.designation || null;
  const department = e?.department || summary.department || null;
  const company = e?.companyName || null;
  const status = statusTone(e?.status || summary.status);
  const joining = e?.dateOfJoining || summary.dateOfJoining || null;
  const avatar = u?.avatar || null;
  const email = summary.email || u?.email || null;
  const emailVerified = !!u?.email_verified;
  const phone = u?.mobile || u?.phone || null;
  const location = u?.location || null;
  const org = u?.organization?.name || null;

  const roles =
    summary.roles && summary.roles.length > 0
      ? summary.roles
      : (u?.unitAssignments || []).map((ua) => ({
          roleName: ua.role.name,
          unitName: ua.unit.name,
        }));

  // Headline subline: designation · department · company (whatever exists).
  const subline = [designation, department, company].filter(Boolean).join('  ·  ');

  // Shift / timing.
  const inLabel = formatTime(e?.inTime);
  const outLabel = formatTime(e?.outTime);
  const hours = workingHours(e?.inTime, e?.outTime);

  // Stat strip — only cells that have a value, so it never shows blanks.
  const stats: Array<{ label: string; value: string; icon: typeof Clock }> = [];
  const t = tenure(joining);
  if (t) stats.push({ label: 'Tenure', value: t, icon: CalendarDays });
  if (e?.shiftType) stats.push({ label: 'Shift', value: e.shiftType, icon: Clock });
  if (hours) stats.push({ label: 'Hours', value: hours, icon: Timer });
  if (e?.employeeEngagementTeamName)
    stats.push({ label: 'Team', value: e.employeeEngagementTeamName, icon: Users });

  // Contact chips — same rule.
  const contacts: Array<{ value: string; icon: typeof Mail; verified?: boolean }> = [];
  if (email) contacts.push({ value: email, icon: Mail, verified: emailVerified });
  if (phone) contacts.push({ value: phone, icon: Phone });
  if (location) contacts.push({ value: location, icon: MapPin });
  if (org) contacts.push({ value: org, icon: Building2 });

  return (
    <Card className="relative overflow-hidden border shadow-sm">
      {/* ── Cover banner ──────────────────────────────────────────────── */}
      <div className="relative h-24 sm:h-28 bg-gradient-to-br from-primary/80 via-primary to-indigo-600">
        {/* soft decorative blobs so the banner isn't a flat slab */}
        <div className="absolute -top-8 -right-6 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute top-4 left-1/3 h-20 w-20 rounded-full bg-white/10 blur-xl" />
        {/* greeting + profile link float on the banner */}
        <p className="absolute left-4 sm:left-6 top-3 text-[11px] sm:text-xs font-medium uppercase tracking-wider text-white/85">
          {greeting()}
        </p>
        <Link
          href="/profile"
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm px-2.5 py-1 text-[11px] font-medium text-white transition-colors"
        >
          View profile
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ── Identity row (avatar overlaps the banner) ─────────────────── */}
      <div className="px-4 sm:px-6 pb-4">
        <div className="flex items-end gap-4 -mt-10 sm:-mt-12">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24 ring-4 ring-card shadow-md shrink-0">
            {avatar && <AvatarImage src={avatar} alt={fullName} />}
            <AvatarFallback className="bg-primary/15 text-primary font-semibold text-xl sm:text-2xl">
              {initialsOf(fullName)}
            </AvatarFallback>
          </Avatar>
          {/* status pill sits on the banks of the banner, right-aligned */}
          {status && (
            <div className="ml-auto mb-2">
              <Badge className={cn('text-[11px]', status.cls)}>
                <BadgeCheck className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {fullName}
            </h1>
            {emailVerified && (
              <BadgeCheck className="h-5 w-5 text-primary" aria-label="Verified" />
            )}
          </div>
          {subline && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subline}</p>
          )}

          {/* Role badges */}
          {roles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.slice(0, 4).map((r, i) => (
                <Badge
                  key={`${r.roleName}-${i}`}
                  variant="secondary"
                  className="text-[11px] font-normal"
                >
                  {r.roleName}
                  {r.unitName && (
                    <span className="text-muted-foreground/70 ml-1">· {r.unitName}</span>
                  )}
                </Badge>
              ))}
              {roles.length > 4 && (
                <Badge variant="secondary" className="text-[11px] font-normal">
                  +{roles.length - 4} more
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* ── Stat strip — tenure · shift · hours · team ──────────────── */}
        {stats.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 rounded-lg border overflow-hidden">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-2.5 p-3">
                  <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="text-sm font-semibold truncate">{s.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Shift timing line ───────────────────────────────────────── */}
        {inLabel && outLabel && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <Sunrise className="h-4 w-4" />
              {inLabel}
            </span>
            <span className="text-muted-foreground/50">→</span>
            <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
              <Sunset className="h-4 w-4" />
              {outLabel}
            </span>
            {hours && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                {hours} / day
              </span>
            )}
          </div>
        )}

        {/* ── Contact row ─────────────────────────────────────────────── */}
        {contacts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {contacts.map((c, i) => {
              const Icon = c.icon;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[220px]">{c.value}</span>
                  {c.verified && (
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
