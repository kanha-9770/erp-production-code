"use client";

/**
 * Cross-module approvals working area (Settings → Approvals). Tabs: "My
 * Approvals" (inbox across inventory + purchase), "Submitted by me", and "All"
 * (admin history). Each row opens the request detail sheet.
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Inbox } from "lucide-react";
import { useRouteAccess } from "@/hooks/use-route-access";
import {
  useGetApprovalInboxQuery,
  useGetApprovalRequestsQuery,
  type ApprovalRequestSummary,
} from "@/lib/api/approvals";
import { MODULE_LABEL, type ApprovalModule } from "./module-schema";
import { RequestDetailSheet } from "./request-detail";

const STATUS_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
  RECALLED: "secondary",
};

function moduleLabel(m: string): string {
  return MODULE_LABEL[m as ApprovalModule] ?? m;
}

export function ApprovalsWorkspace() {
  const { isAdmin } = useRouteAccess();
  const [tab, setTab] = useState("inbox");
  const [openId, setOpenId] = useState<string | null>(null);

  const inbox = useGetApprovalInboxQuery();
  const mine = useGetApprovalRequestsQuery({ scope: "mine", pageSize: 100 });
  const all = useGetApprovalRequestsQuery({ scope: "all", pageSize: 100 }, { skip: !isAdmin });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Approvals &amp; History</h1>
        <p className="text-sm text-muted-foreground">
          Act on records awaiting your approval across modules, track what you submitted, and view full approval history.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> My Approvals
            {inbox.data && inbox.data.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {inbox.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="mine">Submitted by me</TabsTrigger>
          {isAdmin && <TabsTrigger value="all">All</TabsTrigger>}
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <RequestTable rows={inbox.data ?? []} loading={inbox.isLoading} onOpen={setOpenId} emptyText="Nothing awaiting your approval." showRequester />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <RequestTable rows={mine.data?.rows ?? []} loading={mine.isLoading} onOpen={setOpenId} emptyText="You haven't submitted anything for approval yet." />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="all" className="mt-4">
            <RequestTable rows={all.data?.rows ?? []} loading={all.isLoading} onOpen={setOpenId} emptyText="No approval requests yet." showRequester />
          </TabsContent>
        )}
      </Tabs>

      <RequestDetailSheet requestId={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function RequestTable({
  rows,
  loading,
  onOpen,
  emptyText,
  showRequester,
}: {
  rows: ApprovalRequestSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
  emptyText: string;
  showRequester?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="rounded-lg border bg-muted/20 p-10 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Record</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Process</TableHead>
            {showRequester && <TableHead>Requested by</TableHead>}
            <TableHead className="text-center">Stage</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead>Raised</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
              <TableCell className="font-medium">
                {r.record?.primary || "—"}
                {r.record?.secondary && r.record?.primary !== r.record?.secondary && (
                  <span className="block text-xs text-muted-foreground font-normal">{r.record.secondary}</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{moduleLabel(r.module)}</TableCell>
              <TableCell className="text-sm">{r.processName}</TableCell>
              {showRequester && <TableCell className="text-sm">{r.requestedByName}</TableCell>}
              <TableCell className="text-center text-sm">
                {r.status === "PENDING" ? `${r.currentStage + 1} / ${r.totalStages}` : "—"}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
