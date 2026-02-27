'use client';

import { useState, useEffect } from 'react';
import { Bell, Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useGetUserQuery, useLogoutMutation } from '@/lib/api/auth';

interface UnitAssignment {
  unit: { id: string; name: string };
  role: { id: string; name: string };
  notes?: string;
}

interface User {
  id: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  email_verified: boolean;
  status: string;
  createdAt: string;
  mobile?: string;
  mobile_verified?: boolean;
  avatar?: string;
  department?: string;
  phone?: string;
  location?: string;
  joinDate?: string;
  organization?: { id: string; name: string };
  unitAssignments?: Array<UnitAssignment>;
  employee?: {
    employeeName: string;
    // ... other fields
  };
}

export function Header() {
  const { data: userData, isLoading, error, refetch } = useGetUserQuery(undefined, { skip: false });
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const publicRoutes = ['/login', '/register', '/verify-otp', '/forgot-password', '/reset-password', '/'];

  // IMPORTANT: Your API returns role.name as "ADMIN" (uppercase), so match exactly
  const isAdmin = user?.unitAssignments?.some(
    (assignment) => assignment.role.name.toUpperCase() === 'ADMIN'
  ) || false;

  useEffect(() => {
    if (publicRoutes.includes(pathname)) return;

    const checkUser = async () => {
      if (error && !isLoading) {
        toast({ title: 'Error', description: 'Failed to load user data', variant: 'destructive' });
        sessionStorage.removeItem('user');
        router.push('/login');
        return;
      }

      if (userData?.user) {
        sessionStorage.setItem('user', JSON.stringify(userData.user));
        setUser(userData.user);
      } else if (!isLoading && !userData?.user) {
        sessionStorage.removeItem('user');
        router.push('/login');
      }
    };

    const storedUser = sessionStorage.getItem('user');
    if (storedUser && !userData && !isLoading) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch {
        sessionStorage.removeItem('user');
        refetch();
      }
    } else {
      checkUser();
    }
  }, [router, toast, pathname, userData, isLoading, error, refetch]);

  const handleLogout = async () => {
    try {
      await logout().unwrap();
      sessionStorage.removeItem('user');
      document.cookie = 'auth-token=; path=/; max-age=0';
      toast({ title: 'Logged out', description: 'You have been successfully logged out' });
      router.push('/login');
    } catch {
      toast({ title: 'Error', description: 'Failed to logout.', variant: 'destructive' });
    }
  };

  const displayName = user?.first_name || user?.username || user?.employee?.employeeName || 'Guest';
  const displayEmail = user?.email || 'No email';
  const avatarFallback = displayName.charAt(0).toUpperCase() || 'U';

  if (publicRoutes.includes(pathname)) {
    return (
      <header className="bg-white border-b border-gray-200 px-6 py-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input placeholder="Search..." className="pl-10 h-9" />
            </div>
          </div>
          <Button variant="ghost" size="icon" disabled>
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-1">
      <div className="flex items-center justify-between">
        {/* Search Bar */}
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input placeholder="Search orders, products, customers..." className="pl-10 h-9" />
          </div>
        </div>

        {/* Right Side: Admin Button (conditional) + Notification + Profile */}
        <div className="flex items-center gap-3">
          {/* Admin Button - Only for admins, appears BEFORE profile */}
          {isAdmin && (
            <Link href="/admin/modules">
              <Button variant="default" size="sm" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            </Link>
          )}

          {/* Notification Bell */}
          <Button variant="ghost" size="icon" disabled={isLoading}>
            <Bell className="h-4 w-4" />
          </Button>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full p-0"
                disabled={isLoading || isLoggingOut}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.avatar || '/placeholder-user.jpg'} alt={displayName} />
                  <AvatarFallback>{avatarFallback}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">{displayEmail}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link href="/profile">
                <DropdownMenuItem className="cursor-pointer">Profile</DropdownMenuItem>
              </Link>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}