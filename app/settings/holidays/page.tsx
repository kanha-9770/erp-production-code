'use client';

/**
 * Holiday calendar — admin-only CRUD.
 * Read by attendance (skip-punch on holiday) and payroll (paid days).
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CalendarHeart, Plus, Trash2, RefreshCw, ShieldAlert } from 'lucide-react';

interface Holiday {
  id: string;
  date: string;
  name: string;
  isOptional: boolean;
}

const currentYear = new Date().getFullYear();

export default function HolidaysPage() {
  const { toast } = useToast();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [optional, setOptional] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/holidays?year=${year}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        // Read is allowed for any org member; only POST/DELETE need admin.
        if (res.status === 401) setForbidden(true);
      }
      const j = await res.json();
      if (j.success) setHolidays(j.holidays ?? []);
    } catch {
      toast({ title: 'Failed to load holidays', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!date || !name.trim()) {
      toast({ title: 'Date and name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date, name: name.trim(), isOptional: optional }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast({ title: 'Holiday saved' });
      setDate('');
      setName('');
      setOptional(false);
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this holiday?')) return;
    try {
      const res = await fetch(`/api/holidays/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Delete failed');
      setHolidays((prev) => (prev ?? []).filter((h) => h.id !== id));
      toast({ title: 'Holiday removed' });
    } catch (e: any) {
      toast({ title: 'Could not delete', description: e?.message, variant: 'destructive' });
    }
  };

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Sign in required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CalendarHeart className="h-8 w-8 text-primary" />
            Holiday Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Holidays count as paid days in payroll and skip the punch requirement on the
            attendance widget.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a holiday</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_140px_auto] items-end">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Republic Day"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={optional} onCheckedChange={setOptional} id="optional-holiday" />
              <Label htmlFor="optional-holiday" className="cursor-pointer">
                Optional
              </Label>
            </div>
            <Button onClick={create} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Optional holidays don't auto-skip the working-day count — they're informational.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{year} Holidays</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (holidays ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No holidays added for {year}.
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Day</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(holidays ?? []).map((h) => {
                  const d = new Date(h.date);
                  const day = d.toLocaleDateString(undefined, { weekday: 'long' });
                  return (
                    <tr key={h.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-sm">{h.date}</td>
                      <td className="p-3 text-sm">{day}</td>
                      <td className="p-3 font-medium">{h.name}</td>
                      <td className="p-3">
                        {h.isOptional ? (
                          <Badge variant="outline">Optional</Badge>
                        ) : (
                          <Badge>Mandatory</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(h.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
