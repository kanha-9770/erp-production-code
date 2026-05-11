'use client';

import { BarChart3, Bot, Brain, FileDown, LayoutDashboard, LogOut, Mail, Menu, Settings, Shield, User, UserCog } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useRouteAccess } from '@/hooks/use-route-access';
import { useGetUserQuery } from '@/lib/api/auth';

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
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canAccess } = useRouteAccess();
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
        {/* Left — logo + desktop nav */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="px-4 py-4 border-b">
                <SheetTitle className="text-left text-base font-bold">
                  {user.organizationName || 'Analytics'}
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-3">

                <div className="border-t mt-2 pt-2">
                  <button
                    onClick={() => { logoutAction(); setMobileOpen(false); }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Sign Out
                  </button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="p-1.5 rounded-lg bg-foreground text-background">
              <BarChart3 className="h-5 w-5" />
            </div>
            <span className="hidden sm:inline">
              {user.organizationName || 'Analytics'}
            </span>
          </Link>
        </div>

        {/* Right — user menu */}
        <div className="flex items-center gap-3">
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
