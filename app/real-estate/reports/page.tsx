"use client";

/**
 * Reports hub (FR-9). Single page with a tab strip per report so admins
 * don't navigate-and-load to switch views. Date-range picker is at the top
 * and propagates to whichever report needs it.
 */

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  useGetSalesRegisterQuery,
  useGetCommissionRegisterQuery,
  useGetPayoutRegisterQuery,
  useGetLeadConversionQuery,
  useGetLeaderboardQuery,
  useGetPropertyAgingQuery,
  useGetComplianceStatusReportQuery,
  useGetTaxStatementQuery,
} from "@/lib/api/real-estate/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  FileText,
  TrendingUp,
  Banknote,
  Trophy,
  Activity,
  Building2,
  Shield,
  Receipt,
} from "lucide-react";
import {
  COMMISSION_ROLE_LABEL,
  COMMISSION_STATUS_LABEL,
  COMMISSION_STATUS_VARIANT,
  AGENT_COMPLIANCE_LABEL,
  AGENT_COMPLIANCE_VARIANT,
  WITHDRAWAL_STATUS_LABEL,
  WITHDRAWAL_STATUS_VARIANT,
  PROPERTY_STATUS_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  formatCurrency,
  formatDate,
  fullName,
  initials,
} from "@/components/real-estate/constants";

// Indian financial year — Apr 1 → Mar 31. Default to the current FY.
function currentFY(): number {
  const d = new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

// First day of current month / today, used to seed sensible defaults.
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ReportsHubPage() {
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
    [today],
  );

  const [from, setFrom] = useState<string>(ymd(monthStart));
  const [to, setTo] = useState<string>(ymd(today));

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-7xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sales, commissions, payouts, leaderboards, and tax statements.
          </p>
        </div>
      </div>

      {/* Date range — applies to date-aware reports (everything except aging
          and compliance status). */}
      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFrom(ymd(monthStart));
                setTo(ymd(today));
              }}
            >
              This month
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFrom(ymd(new Date(today.getFullYear(), 0, 1)));
                setTo(ymd(today));
              }}
            >
              YTD
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              All time
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList className="overflow-x-auto justify-start">
          <TabsTrigger value="sales">
            <Receipt className="h-3.5 w-3.5 mr-1.5" /> Sales
          </TabsTrigger>
          <TabsTrigger value="commission">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Commissions
          </TabsTrigger>
          <TabsTrigger value="payouts">
            <Banknote className="h-3.5 w-3.5 mr-1.5" /> Payouts
          </TabsTrigger>
          <TabsTrigger value="leaderboard">
            <Trophy className="h-3.5 w-3.5 mr-1.5" /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="conversion">
            <Activity className="h-3.5 w-3.5 mr-1.5" /> Lead conversion
          </TabsTrigger>
          <TabsTrigger value="aging">
            <Building2 className="h-3.5 w-3.5 mr-1.5" /> Aging
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <Shield className="h-3.5 w-3.5 mr-1.5" /> Compliance
          </TabsTrigger>
          <TabsTrigger value="tax">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Tax
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <SalesRegisterReport from={from} to={to} />
        </TabsContent>
        <TabsContent value="commission">
          <CommissionRegisterReport from={from} to={to} />
        </TabsContent>
        <TabsContent value="payouts">
          <PayoutRegisterReport from={from} to={to} />
        </TabsContent>
        <TabsContent value="leaderboard">
          <LeaderboardReport from={from} to={to} />
        </TabsContent>
        <TabsContent value="conversion">
          <LeadConversionReport from={from} to={to} />
        </TabsContent>
        <TabsContent value="aging">
          <PropertyAgingReport />
        </TabsContent>
        <TabsContent value="compliance">
          <ComplianceStatusReport />
        </TabsContent>
        <TabsContent value="tax">
          <TaxStatementReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales register
// ─────────────────────────────────────────────────────────────────────────────

function SalesRegisterReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGetSalesRegisterQuery({ from, to });
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <SummaryStrip
        items={[
          { label: "Sales", value: String(data.summary.count) },
          { label: "Total revenue", value: formatCurrency(data.summary.totalSales) },
          { label: "Total commission", value: formatCurrency(data.summary.totalCommission) },
        ]}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Closed</th>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Buyer</th>
                <th className="text-right p-3">Sale price</th>
                <th className="text-right p-3">Commission</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={6} />
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="p-3 text-xs tabular-nums">
                      {r.closedAt ? formatDate(r.closedAt) : "—"}
                    </td>
                    <td className="p-3 font-mono text-xs">{r.code ?? "—"}</td>
                    <td className="p-3">
                      <Link
                        href={`/real-estate/properties/${r.property?.id ?? ""}`}
                        className="hover:underline"
                      >
                        {r.property?.title ?? "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.property?.city}</div>
                    </td>
                    <td className="p-3">{r.buyer?.name ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {formatCurrency(r.salePrice, r.currency)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatCurrency(r.baseCommission, r.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission register
// ─────────────────────────────────────────────────────────────────────────────

function CommissionRegisterReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGetCommissionRegisterQuery({ from, to });
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <SummaryStrip
        items={[
          { label: "Splits", value: String(data.summary.count) },
          { label: "Total", value: formatCurrency(data.summary.totalAmount) },
          { label: "On hold", value: formatCurrency(data.summary.onHold) },
          { label: "Released", value: formatCurrency(data.summary.released) },
          { label: "Reversed", value: formatCurrency(data.summary.reversed) },
        ]}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Role</th>
                <th className="text-right p-3">%</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={6} />
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="p-3 text-xs tabular-nums">{formatDate(r.createdAt)}</td>
                    <td className="p-3">
                      {r.transaction?.property?.title ?? "—"}
                      <div className="text-xs text-muted-foreground">
                        {r.transaction?.code}
                      </div>
                    </td>
                    <td className="p-3">
                      {COMMISSION_ROLE_LABEL[r.role]}
                      {r.level != null && (
                        <span className="ml-1 text-xs text-muted-foreground">L{r.level}</span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.percent.toFixed(4)}%</td>
                    <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(r.amount)}</td>
                    <td className="p-3">
                      <Badge variant={COMMISSION_STATUS_VARIANT[r.status]} className="text-[10px]">
                        {COMMISSION_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout register
// ─────────────────────────────────────────────────────────────────────────────

function PayoutRegisterReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGetPayoutRegisterQuery({ from, to });
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <SummaryStrip
        items={[
          { label: "Requests", value: String(data.summary.count) },
          { label: "Total requested", value: formatCurrency(data.summary.totalRequested) },
          { label: "Total paid", value: formatCurrency(data.summary.totalPaid) },
        ]}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Requested</th>
                <th className="text-left p-3">Bank</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-right p-3">Net</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={6} />
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="p-3 text-xs tabular-nums">{formatDate(r.createdAt)}</td>
                    <td className="p-3 text-xs">
                      {r.bankAccount.bankName} ••••{r.bankAccount.accountNumberLast4}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(r.netAmount)}</td>
                    <td className="p-3">
                      <Badge variant={WITHDRAWAL_STATUS_VARIANT[r.status]} className="text-[10px]">
                        {WITHDRAWAL_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs">{r.paymentReference ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

function LeaderboardReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGetLeaderboardQuery({ from, to });
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">#</th>
              <th className="text-left p-3">Agent</th>
              <th className="text-right p-3">Sales</th>
              <th className="text-right p-3">Revenue</th>
              <th className="text-right p-3">Commission</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={5} />
            ) : (
              data.rows.map((r, idx) => (
                <tr key={r.user.id} className="border-b hover:bg-muted/40">
                  <td className="p-3 tabular-nums w-12">
                    {idx === 0 && <span aria-label="Top">🥇</span>}
                    {idx === 1 && <span aria-label="2nd">🥈</span>}
                    {idx === 2 && <span aria-label="3rd">🥉</span>}
                    {idx > 2 && <span className="text-muted-foreground">{idx + 1}</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={r.user.avatar ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {initials(r.user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{fullName(r.user)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{r.sales}</td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    {formatCurrency(r.revenue)}
                  </td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(r.commission)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead conversion
// ─────────────────────────────────────────────────────────────────────────────

function LeadConversionReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useGetLeadConversionQuery({ from, to });
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <SummaryStrip
        items={[
          { label: "Total", value: String(data.summary.total) },
          { label: "Converted", value: String(data.summary.converted) },
          { label: "Lost", value: String(data.summary.lost) },
          { label: "Conversion rate", value: `${data.summary.conversionRate}%` },
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <BreakdownCard
          title="By status"
          map={data.byStatus}
          labelMap={LEAD_STATUS_LABEL as any}
        />
        <BreakdownCard
          title="By source"
          map={data.bySource}
          labelMap={LEAD_SOURCE_LABEL as any}
        />
        <BreakdownCard title="By score" map={data.byScore} labelMap={{ HOT: "Hot", WARM: "Warm", COLD: "Cold" }} />
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  map,
  labelMap,
}: {
  title: string;
  map: Record<string, number>;
  labelMap: Record<string, string>;
}) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data.</p>
        ) : (
          entries.map(([k, v]) => {
            const pct = total > 0 ? (v / total) * 100 : 0;
            return (
              <div key={k}>
                <div className="flex justify-between items-baseline text-xs">
                  <span>{labelMap[k] ?? k}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {v} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Property aging
// ─────────────────────────────────────────────────────────────────────────────

function PropertyAgingReport() {
  const { data, isLoading } = useGetPropertyAgingQuery();
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const oldest = data.rows.slice(0, 1)[0];

  return (
    <div className="space-y-3">
      <SummaryStrip
        items={[
          { label: "In inventory", value: String(data.rows.length) },
          {
            label: "Oldest listing",
            value: oldest ? `${oldest.daysOnMarket} days` : "—",
          },
        ]}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">City</th>
                <th className="text-right p-3">Listing price</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Days on market</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={5} />
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/40">
                    <td className="p-3">
                      <Link href={`/real-estate/properties/${r.id}`} className="hover:underline">
                        {r.title}
                      </Link>
                      {r.code && <div className="text-xs font-mono text-muted-foreground">{r.code}</div>}
                    </td>
                    <td className="p-3">{r.city}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatCurrency(r.listingPrice, r.currency)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px]">
                        {PROPERTY_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        r.daysOnMarket > 90
                          ? "text-destructive"
                          : r.daysOnMarket > 30
                            ? "text-amber-600"
                            : ""
                      }`}
                    >
                      {r.daysOnMarket}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance status
// ─────────────────────────────────────────────────────────────────────────────

function ComplianceStatusReport() {
  const { data, isLoading } = useGetComplianceStatusReportQuery();
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <SummaryStrip
        items={[
          { label: "Compliant", value: String(data.summary.COMPLIANT) },
          { label: "Pending KYC", value: String(data.summary.PENDING_KYC) },
          { label: "Non-compliant", value: String(data.summary.NON_COMPLIANT) },
        ]}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Agent</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Verified</th>
                <th className="text-right p-3">Pending</th>
                <th className="text-right p-3">Rejected</th>
                <th className="text-right p-3">Expiring (30d)</th>
                <th className="text-left p-3">License expires</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={7} />
              ) : (
                data.rows.map((r) => (
                  <tr key={r.agentId} className="border-b hover:bg-muted/40">
                    <td className="p-3">
                      <Link
                        href={`/real-estate/agents/${r.agentId}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={r.user.avatar ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {initials(r.user)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate">{fullName(r.user)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.user.email}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge variant={AGENT_COMPLIANCE_VARIANT[r.complianceStatus]} className="text-[10px]">
                        {AGENT_COMPLIANCE_LABEL[r.complianceStatus]}
                      </Badge>
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.docsVerified}</td>
                    <td className="p-3 text-right tabular-nums">{r.docsPending}</td>
                    <td className="p-3 text-right tabular-nums">{r.docsRejected}</td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        r.docsExpiringSoon > 0 ? "text-amber-600" : ""
                      }`}
                    >
                      {r.docsExpiringSoon}
                    </td>
                    <td className="p-3 text-xs">{r.licenseExpiresAt ? formatDate(r.licenseExpiresAt) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax statement
// ─────────────────────────────────────────────────────────────────────────────

function TaxStatementReport() {
  const [fy, setFy] = useState(currentFY());
  const { data, isLoading } = useGetTaxStatementQuery({ fy });
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <Field label="Financial year">
            <Input
              type="number"
              value={fy}
              onChange={(e) => setFy(parseInt(e.target.value || "0", 10))}
              className="w-32"
            />
          </Field>
          <div className="text-xs text-muted-foreground self-end pb-1.5">
            FY {fy}-{(fy + 1) % 100} · {data.period.from} → {data.period.to}
          </div>
        </CardContent>
      </Card>
      <SummaryStrip
        items={[
          { label: "Gross earned", value: formatCurrency(data.summary.grossEarned) },
          { label: "Reversed", value: formatCurrency(data.summary.reversed) },
          { label: "Net taxable", value: formatCurrency(data.summary.netEarned) },
        ]}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Property</th>
                <th className="text-left p-3">Role</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <EmptyRow colSpan={5} />
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-3 text-xs tabular-nums">{formatDate(r.createdAt)}</td>
                    <td className="p-3 text-xs">
                      {r.propertyTitle}
                      {r.transactionCode && <div className="font-mono text-muted-foreground">{r.transactionCode}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      {COMMISSION_ROLE_LABEL[r.role]}
                      {r.level != null && <span className="ml-1 text-muted-foreground">L{r.level}</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="p-3">
                      <Badge variant={COMMISSION_STATUS_VARIANT[r.status]} className="text-[10px]">
                        {COMMISSION_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Reusable bits ───────────────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
    </div>
  );
}

function SummaryStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div
      className={`grid gap-3 grid-cols-2 sm:grid-cols-${Math.min(items.length, 5)}`}
    >
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className="text-xl font-bold tabular-nums">{it.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-muted-foreground text-sm">
        No data for this range.
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
