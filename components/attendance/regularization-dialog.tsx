"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import type { AttendanceRecord } from "./attendance-record-detail";
import { formatDateLong } from "./attendance-format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The day being corrected. We let the caller pick the row from My
  // Attendance so the dialog already knows the date and current values.
  record: AttendanceRecord | null;
  onSuccess?: () => void;
}

function isoDate(record: AttendanceRecord | null) {
  return record?.date ?? "";
}

function timeFromIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combineDateTime(date: string, hhmm: string): string | null {
  if (!date || !hhmm) return null;
  // Build an ISO string in local time, then send as ISO. The server
  // re-parses with `new Date(...)` so this is exactly equivalent to a
  // Date constructed from date+time on the client.
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

export function RegularizationDialog({
  open,
  onOpenChange,
  record,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const date = isoDate(record);

  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Pre-fill with the record's existing values so the user only changes
  // what's wrong. Reset every time we open the dialog with a different row.
  useEffect(() => {
    if (!open || !record) return;
    setCheckInTime(timeFromIso(record.checkInAt));
    setCheckOutTime(timeFromIso(record.checkOutAt));
    setReason("");
  }, [open, record]);

  const isValid = useMemo(() => {
    if (reason.trim().length === 0) return false;
    if (!checkInTime && !checkOutTime) return false;
    return true;
  }, [reason, checkInTime, checkOutTime]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !isValid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/attendance/regularize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          requestedCheckInAt: combineDateTime(date, checkInTime),
          requestedCheckOutAt: combineDateTime(date, checkOutTime),
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to submit");
      }
      toast({
        title: "Regularization submitted",
        description: "An admin will review the request shortly.",
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({
        title: "Could not submit",
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
          <DialogTitle>Request correction</DialogTitle>
          <DialogDescription>
            {record
              ? `For ${formatDateLong(record.date)}. An admin will need to approve before payroll picks up the change.`
              : "Pick a day from your records first."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-in">Check-In</Label>
              <Input
                id="reg-in"
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
              />
              {record?.checkInTime && (
                <div className="text-[11px] text-gray-500">
                  Current: {record.checkInTime}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-out">Check-Out</Label>
              <Input
                id="reg-out"
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
              />
              {record?.checkOutTime && (
                <div className="text-[11px] text-gray-500">
                  Current: {record.checkOutTime}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reg-reason"
              rows={3}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Forgot to check out before leaving the office at 6:15 PM"
              required
            />
            <div className="text-[11px] text-gray-500 text-right">
              {reason.length} / 2000
            </div>
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
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
