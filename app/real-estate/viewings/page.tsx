"use client";

/**
 * Property viewings — chronological list grouped by day, with status filter
 * and inline status update. Defaults to "from today onwards"; switch to
 * "history" to see past viewings.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useGetViewingsQuery,
  useUpdateViewingMutation,
} from "@/lib/api/real-estate/leads";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  Clock,
  Phone,
  ArrowLeft,
  Calendar,
  ImageOff,
} from "lucide-react";
import {
  VIEWING_STATUS_LABEL,
  VIEWING_STATUS_VARIANT,
  formatDateTime,
} from "@/components/real-estate/constants";

type Range = "upcoming" | "history" | "all";

export default function ViewingsPage() {
  const [range, setRange] = useState<Range>("upcoming");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const now = useMemo(() => new Date(), []);
  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = { limit: 200 };
    if (range === "upcoming") {
      params.from = now.toISOString();
    } else if (range === "history") {
      params.to = now.toISOString();
    }
    if (statusFilter) params.status = statusFilter;
    return params;
  }, [range, now, statusFilter]);

  const { data, isLoading } = useGetViewingsQuery(queryParams);

  const items = data?.data ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const v of items) {
      const key = v.scheduledAt.slice(0, 10); // YYYY-MM-DD
      const list = m.get(key) ?? [];
      list.push(v);
      m.set(key, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) =>
      range === "history" ? b.localeCompare(a) : a.localeCompare(b),
    );
  }, [items, range]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <CalendarDays className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Property viewings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {items.length} {range === "history" ? "past " : range === "upcoming" ? "upcoming " : ""}
              viewing{items.length === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
      </div>

      {/* Range tabs + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
          {(["upcoming", "history", "all"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-sm rounded-sm transition-colors capitalize ${
                range === r ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {Object.entries(VIEWING_STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No viewings found.</p>
            <p className="text-xs mt-2">
              Schedule one from a lead's detail page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, list]) => (
            <DayGroup key={date} date={date} viewings={list} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayGroup({
  date,
  viewings,
}: {
  date: string;
  viewings: any[];
}) {
  const friendly = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm font-medium">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {friendly}
        <span className="text-xs text-muted-foreground">
          {viewings.length} viewing{viewings.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-2">
        {viewings.map((v) => (
          <ViewingRow key={v.id} viewing={v} />
        ))}
      </div>
    </div>
  );
}

function ViewingRow({ viewing }: { viewing: any }) {
  const { toast } = useToast();
  const [update, { isLoading }] = useUpdateViewingMutation();

  const setStatus = async (status: string) => {
    try {
      await update({ id: viewing.id, body: { status: status as any } }).unwrap();
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ title: "Could not update", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-12 w-12 rounded-md overflow-hidden bg-muted shrink-0">
          {viewing.property?.primaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewing.property.primaryImageUrl}
              alt={viewing.property.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="h-5 w-5 text-muted-foreground/40" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={viewing.property ? `/real-estate/properties/${viewing.property.id}` : "#"}
            className="font-medium truncate block hover:underline"
          >
            {viewing.property?.title ?? "Property"}
          </Link>
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3" />
              {formatDateTime(viewing.scheduledAt)} · {viewing.durationMin} min
            </span>
            {viewing.lead && (
              <Link
                href={`/real-estate/leads/${viewing.lead.id}`}
                className="hover:underline truncate max-w-[200px]"
              >
                {viewing.lead.name}
              </Link>
            )}
            {viewing.lead?.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {viewing.lead.phone}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={VIEWING_STATUS_VARIANT[viewing.status as keyof typeof VIEWING_STATUS_VARIANT]} className="text-[10px]">
            {VIEWING_STATUS_LABEL[viewing.status as keyof typeof VIEWING_STATUS_LABEL]}
          </Badge>
          <Select value={viewing.status} onValueChange={setStatus} disabled={isLoading}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(VIEWING_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
