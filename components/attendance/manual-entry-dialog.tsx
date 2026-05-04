"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { todayIso } from "./attendance-format";

interface TeamUserMin {
  id: string;
  email: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function combineDateTime(date: string, hhmm: string): string | null {
  if (!date || !hhmm) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [h, mm] = hhmm.split(":").map(Number);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    !Number.isFinite(h) ||
    !Number.isFinite(mm)
  ) {
    return null;
  }
  const dt = new Date(y, m - 1, d, h, mm, 0, 0);
  return dt.toISOString();
}

export function ManualEntryDialog({ open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const today = useMemo(() => todayIso(), []);

  const [users, setUsers] = useState<TeamUserMin[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [userId, setUserId] = useState<string>("");
  const [date, setDate] = useState<string>(today);
  const [checkInTime, setCheckInTime] = useState<string>("09:00");
  const [checkOutTime, setCheckOutTime] = useState<string>("18:00");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(
        `/api/attendance/team?from=${today}&to=${today}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = await res.json();
      if (json?.success && Array.isArray(json.users)) {
        setUsers(
          (json.users as any[]).map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
          })),
        );
      }
    } catch {
      // No-op; user picker will just be empty.
    } finally {
      setUsersLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (!open) return;
    setUserId("");
    setDate(today);
    setCheckInTime("09:00");
    setCheckOutTime("18:00");
    setReason("");
    loadUsers();
  }, [open, today, loadUsers]);

  const isValid = userId && date && reason.trim().length > 0 && (checkInTime || checkOutTime);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/attendance/admin/manual-punch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date,
          checkInAt: combineDateTime(date, checkInTime),
          checkOutAt: combineDateTime(date, checkOutTime),
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to write");
      }
      toast({
        title: "Manual entry recorded",
        description: "Audit log + workflow rules have fired.",
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({
        title: "Could not write",
        description: e?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Manual attendance entry
          </DialogTitle>
          <DialogDescription>
            Direct write — bypasses the punch flow and is logged as
            <code className="mx-1">source: ADMIN</code>. Use for backfills,
            broken biometrics, or new joiners. The reason is required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={usersLoading ? "Loading…" : "Pick a user"}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <div className="flex flex-col">
                      <span className="text-sm">{u.name}</span>
                      <span className="text-[11px] text-gray-500">
                        {u.email}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label htmlFor="me-date">Date</Label>
              <Input
                id="me-date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label htmlFor="me-in">Check-In</Label>
              <Input
                id="me-in"
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label htmlFor="me-out">Check-Out</Label>
              <Input
                id="me-out"
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="me-reason"
              rows={3}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Biometric scanner offline; backfilling check-in confirmed by team lead"
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
