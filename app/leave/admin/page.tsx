'use client';

/**
 * Admin allocation page — set yearly leave balances for every employee.
 *
 * Two flows:
 *   • Inline edit: click a cell → type new "allocated" value → blur saves.
 *   • Bulk allocate: button opens a dialog that adds the same amount to
 *     every active employee in one shot (used for "+12 casual to all" yearly
 *     resets).
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Wallet, RefreshCw, Users, ShieldAlert, Sparkles } from 'lucide-react';

interface BalanceRow {
  leaveType: { id: string; name: string; code: string; color: string | null };
  year: number;
  allocated: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
  isPaid: boolean;
}

interface EmployeeRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  balances: BalanceRow[];
}

const currentYear = new Date().getFullYear();

export default function LeaveAdminPage() {
  const { toast } = useToast();
  const [year, setYear] = useState<number>(currentYear);
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null); // `${userId}:${typeId}`

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/leaves/allocate?year=${year}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      const j = await res.json();
      if (j.success) setEmployees(j.employees ?? []);
    } catch {
      toast({ title: 'Failed to load allocations', variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const adjust = async (userId: string, leaveTypeId: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    setSavingCell(`${userId}:${leaveTypeId}`);
    try {
      const res = await fetch('/api/leaves/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, leaveTypeId, year, amount }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      // Optimistic update
      setEmployees((prev) =>
        (prev ?? []).map((e) =>
          e.id === userId
            ? {
                ...e,
                balances: e.balances.map((b) =>
                  b.leaveType.id === leaveTypeId
                    ? { ...b, allocated: b.allocated + amount, available: b.available + amount }
                    : b,
                ),
              }
            : e,
        ),
      );
      toast({ title: 'Allocation updated' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSavingCell(null);
    }
  };

  if (forbidden) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allTypes = employees?.[0]?.balances.map((b) => b.leaveType) ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            Leave Allocations
          </h1>
          <p className="text-muted-foreground mt-1">
            Set annual leave balances per employee. Click any cell to adjust.
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
          <Button onClick={() => setBulkOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Bulk Allocate
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </CardContent>
        </Card>
      ) : (employees ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No active employees in this organization.
          </CardContent>
        </Card>
      ) : allTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No leave types configured. Add some via the leave-rules admin first.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b text-xs uppercase text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left p-3 sticky left-0 bg-muted/30">Employee</th>
                  {allTypes.map((t) => (
                    <th key={t.id} className="text-left p-3 min-w-[160px]">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(employees ?? []).map((e) => (
                  <tr key={e.id} className="border-b hover:bg-muted/20">
                    <td className="p-3 sticky left-0 bg-background">
                      <div className="font-medium">
                        {e.firstName || e.lastName
                          ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim()
                          : e.email}
                      </div>
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </td>
                    {allTypes.map((t) => {
                      const b = e.balances.find((bb) => bb.leaveType.id === t.id);
                      const cellId = `${e.id}:${t.id}`;
                      return (
                        <td key={t.id} className="p-3">
                          <BalanceCell
                            available={b?.available ?? 0}
                            used={b?.used ?? 0}
                            pending={b?.pending ?? 0}
                            allocated={b?.allocated ?? 0}
                            saving={savingCell === cellId}
                            onAdjust={(delta) => adjust(e.id, t.id, delta)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <BulkAllocateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        leaveTypes={allTypes}
        year={year}
        onDone={() => {
          setBulkOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function BalanceCell({
  available,
  used,
  pending,
  allocated,
  saving,
  onAdjust,
}: {
  available: number;
  used: number;
  pending: number;
  allocated: number;
  saving: boolean;
  onAdjust: (delta: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const startEdit = () => {
    setVal(String(allocated));
    setEditing(true);
  };
  const commit = () => {
    const newAlloc = Number(val);
    setEditing(false);
    if (!Number.isFinite(newAlloc)) return;
    const delta = newAlloc - allocated;
    if (delta !== 0) onAdjust(delta);
  };

  if (editing) {
    return (
      <Input
        type="number"
        autoFocus
        step="0.5"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-8 w-24"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={saving}
      className="text-left hover:bg-muted/40 px-2 py-1 rounded -mx-2 -my-1 w-full"
      title="Click to edit allocated"
    >
      <div className="font-medium">
        {available.toFixed(1)}
        <span className="text-muted-foreground font-normal"> / {allocated.toFixed(0)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        used {used.toFixed(1)} · pending {pending.toFixed(1)}
      </div>
    </button>
  );
}

function BulkAllocateDialog({
  open,
  onOpenChange,
  leaveTypes,
  year,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaveTypes: { id: string; name: string }[];
  year: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [amount, setAmount] = useState('12');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setLeaveTypeId(leaveTypes[0]?.id ?? '');
  }, [open, leaveTypes]);

  const submit = async () => {
    const a = Number(amount);
    if (!leaveTypeId || !Number.isFinite(a)) {
      toast({ title: 'Pick type and amount', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leaves/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leaveTypeId, year, amount: a, reason: reason || 'BULK_GRANT', bulk: true }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast({
        title: 'Bulk allocation done',
        description: `Applied to ${j.applied} of ${j.total} employees.`,
      });
      onDone();
    } catch (e: any) {
      toast({ title: 'Bulk allocate failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk allocate leaves</DialogTitle>
          <DialogDescription>
            Add (or subtract) the same amount for every active employee in {year}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount (use a negative number to subtract)</Label>
            <Input
              type="number"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Note (audit trail)</Label>
            <Input
              placeholder="e.g. Annual reset 2026"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Apply to all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
