'use client';

import {
  LogOut, Mail, Shield, User, UserCog, Grid3x3,
  Workflow, Code2, Users as UsersIcon, BookOpen, Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/app/actions/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGetUserQuery } from '@/lib/api/auth';
import { useGetOrgModulesLiteQuery } from '@/lib/api/modules';
import { useRouteAccess } from '@/hooks/use-route-access';
import { usePermissionContext } from '@/context/PermissionContext';

interface AdminNavProps {
  user: {
    email: string;
    name: string;
    avatar?: string | null;
    organizationName?: string | null;
    role?: string | null;
  };
}

export function AdminNav({ user }: AdminNavProps) {
  const { data: userData } = useGetUserQuery();

  // Derive display name from API (same source as sidebar)
  const displayName = userData?.user
    ? (userData.user.first_name || userData.user.last_name)
      ? `${userData.user.first_name ?? ''} ${userData.user.last_name ?? ''}`.trim()
      : userData.user.username || user.name
    : user.name;


  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Left — workspace name. The mobile hamburger lives in the shared
            ConditionalLayout top bar above us, so we don't render our own. */}
        <Link href="/" className="font-bold text-lg truncate">
          <span className="hidden sm:inline">
            {user.organizationName || 'Workspace'}
          </span>
        </Link>

        {/* Right — apps launcher + user menu */}
        <div className="flex items-center gap-2">
          <AppsLauncher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{displayName}</span>
                  <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
                  {user.role && (
                    <span className="text-xs text-primary font-medium mt-0.5">{user.role}</span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile#personal">
                  <UserCog className="h-4 w-4 mr-2" />
                  Update Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile#security">
                  <Shield className="h-4 w-4 mr-2" />
                  Security Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile#notifications">
                  <Mail className="h-4 w-4 mr-2" />
                  Email Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logoutAction()}
                className="text-destructive cursor-pointer"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Apps launcher — Google-style 3x3 dot grid → popover with top-level
// modules as colourful round tiles. Uses the lite modules feed so opening
// the picker doesn't trigger a heavy fetch.
// ─────────────────────────────────────────────────────────────────────────────

interface SystemApp {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

// Cross-module shortcuts — always rendered above the workspace modules.
// Route permission gating lives on each destination page; the launcher
// itself shows the tile regardless and lets the route guard decide.
const SYSTEM_APPS: SystemApp[] = [
  { key: 'workflow-rules', label: 'Workflow rules', href: '/settings/workflow-rules/executions', icon: Workflow,  color: '#4285f4' },
  { key: 'functions',      label: 'Functions',      href: '/settings/functions',                  icon: Code2,     color: '#34a853' },
  { key: 'users',          label: 'Users',          href: '/settings/users',                      icon: UsersIcon, color: '#fbbc04' },
  { key: 'roles',          label: 'Roles',          href: '/settings/permission/roles',           icon: UserCog,   color: '#ea4335' },
  { key: 'permissions',    label: 'Permissions',    href: '/settings/permission',                 icon: Shield,    color: '#5e35b1' },
  { key: 'docs',           label: 'Documentation',  href: '/settings/docs',                       icon: BookOpen,  color: '#00897b' },
  { key: 'chatbot',        label: 'Chat bot',       href: '/chatbot',                             icon: Bot,       color: '#a142f4' },
];

function AppsLauncher() {
  const { data: userData } = useGetUserQuery();
  const organizationId = userData?.user?.organization?.id ?? null;
  const [open, setOpen] = useState(false);

  // Permission gates — admins/owners see everything (both hooks already
  // short-circuit to true for them). Regular employees and role-bound
  // users (HR, etc.) see only what their grants allow.
  //   - canAccess(path)        → route-level permission for system tiles
  //   - hasPermission(VIEW, id)→ module-level VIEW grant for workspace tiles
  const { canAccess } = useRouteAccess();
  const { hasPermission } = usePermissionContext();

  // Skip the fetch until the user actually opens the popover — keeps the
  // top bar from paying for module data on every page render.
  const { data, isLoading } = useGetOrgModulesLiteQuery(
    organizationId as string,
    { skip: !organizationId || !open },
  );

  // Filter system tiles by route-permission. Drops any app whose route
  // the current user can't reach — so HR sees only what HR is granted,
  // employees see even less, and admins see all seven.
  const visibleSystemApps = SYSTEM_APPS.filter((app) => canAccess(app.href));

  // Filter workspace tiles by module VIEW permission. Same logic the
  // sidebar uses, so the launcher and sidebar stay in sync about which
  // modules a role can open.
  const roots = (data?.data ?? [])
    .filter((m) => !m.parentId)
    .filter((m) => hasPermission('VIEW', m.id))
    .slice(0, 12);

  // Stable colour palette — used as the tile background when a module
  // doesn't specify its own `color`. Same order as Google's Workspace
  // launcher so the grid feels familiar.
  const palette = [
    '#ea4335', // red
    '#fbbc04', // amber
    '#34a853', // green
    '#4285f4', // blue
    '#a142f4', // purple
    '#f06292', // pink
    '#00897b', // teal
    '#fb8c00', // orange
    '#5e35b1', // indigo
  ];

  const slug = (name: string) =>
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'module';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label="Open apps menu"
        >
          <Grid3x3 className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 max-h-[80vh] overflow-y-auto" sideOffset={6}>
        {/* System apps — admin-style shortcuts the current role can reach.
            Hidden entirely when the user has no system-route grants
            (typical for plain employees with no admin tools). */}
        {visibleSystemApps.length > 0 && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              System
            </div>
            <div className="grid grid-cols-3 gap-1">
              {visibleSystemApps.map((app) => {
                const Icon = app.icon;
                return (
                  <Link
                    key={app.key}
                    href={app.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-lg p-2 hover:bg-muted/60 transition-colors text-center group"
                  >
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0 ring-1 ring-black/5 group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: app.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-medium leading-tight line-clamp-2 max-w-full">
                      {app.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Workspace modules — dynamic, fetched lazily on open and filtered
            by per-module VIEW permission. */}
        <div
          className={`text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1 ${
            visibleSystemApps.length > 0 ? 'mt-4' : ''
          }`}
        >
          Workspace
        </div>
        {!organizationId ? (
          <p className="text-xs text-muted-foreground px-1 py-4">Sign in to see your apps.</p>
        ) : isLoading ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : roots.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-4">No modules available yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {roots.map((m, i) => {
              const bg = m.color || palette[i % palette.length];
              const initial = (m.name || '?').charAt(0).toUpperCase();
              const href = m.hasForms ? `/${slug(m.name)}/${m.id}` : '/';
              return (
                <Link
                  key={m.id}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-lg p-2 hover:bg-muted/60 transition-colors text-center group"
                >
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 ring-1 ring-black/5 group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: bg }}
                  >
                    {initial}
                  </div>
                  <span className="text-[11px] font-medium leading-tight line-clamp-2 max-w-full">
                    {m.name}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
