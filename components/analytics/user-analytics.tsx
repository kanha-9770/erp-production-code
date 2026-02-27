'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useState, useMemo } from 'react';
import { Search, TrendingUp } from 'lucide-react';

interface UserAnalytics {
  userId: string;
  email: string;
  name: string;
  status: string;
  loginCount: number;
  joinedDate: string;
}

interface UserAnalyticsTableProps {
  data: UserAnalytics[];
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  INACTIVE: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  SUSPENDED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PENDING_VERIFICATION: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function UserAnalyticsTable({ data, isLoading }: UserAnalyticsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(
      user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => b.loginCount - a.loginCount);
  }, [filteredData]);

  const stats = {
    totalUsers: data.length,
    activeCount: data.filter(u => u.status === 'ACTIVE').length,
    avgLogins: Math.round(data.reduce((sum, u) => sum + u.loginCount, 0) / data.length || 0),
    mostActiveUser: data.length > 0 ? data.reduce((max, u) => (u.loginCount > max.loginCount ? u : max)) : null,
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>User Analytics</CardTitle>
            <CardDescription>Organization user activity and status</CardDescription>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <div className="p-3 rounded-lg bg-foreground/5">
              <p className="text-xs text-foreground/60">Total Users</p>
              <p className="text-xl font-bold">{stats.totalUsers}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-100/30 dark:bg-emerald-900/30">
              <p className="text-xs text-foreground/60">Active</p>
              <p className="text-xl font-bold text-emerald-600">{stats.activeCount}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100/30 dark:bg-blue-900/30">
              <p className="text-xs text-foreground/60">Avg Logins</p>
              <p className="text-xl font-bold text-blue-600">{stats.avgLogins}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-100/30 dark:bg-purple-900/30">
              <p className="text-xs text-foreground/60 truncate">Most Active</p>
              <p className="text-lg font-bold text-purple-600">
                {stats.mostActiveUser ? stats.mostActiveUser.loginCount : 0}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
            <Input
              placeholder="Search by email or name..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-foreground/60">Loading user data...</p>
              </div>
            </div>
          ) : sortedData.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-foreground/60">No users found</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-foreground/10 hover:bg-transparent">
                    <TableHead className="font-semibold">Email</TableHead>
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Logins</TableHead>
                    <TableHead className="font-semibold">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((user) => (
                    <TableRow key={user.userId} className="border-foreground/10 hover:bg-foreground/5">
                      <TableCell className="font-mono text-sm">{user.email}</TableCell>
                      <TableCell className="font-medium">{user.name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[user.status] || 'bg-gray-100'}>
                          {user.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <div className="flex items-center justify-end gap-1">
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                          {user.loginCount}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/60">{user.joinedDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-xs text-foreground/60 text-center pt-4 border-t border-foreground/10">
            Showing {sortedData.length} of {data.length} users
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
