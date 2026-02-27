'use client';

import { useState, useCallback } from 'react';
import { getFullReportData } from '@/app/actions/reports';
import {
  generateExecutiveSummaryPDF,
  generateFullAnalyticsReportPDF,
  generateAnalyticsExcel,
  generateAnalyticsCSV,
  downloadPDF,
  downloadExcel,
  downloadCSV,
  type ReportSection,
  type ReportMeta,
} from '@/lib/report-engine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  FileText,
  FileSpreadsheet,
  Table2,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileBarChart,
  CalendarDays,
  Building2,
  Shield,
  TrendingUp,
  ArrowRight,
  FileDown,
  BarChart3,
  Users,
  Activity,
} from 'lucide-react';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────
type ExportFormat = 'executive-pdf' | 'full-pdf' | 'excel' | 'csv';

interface ExportHistoryItem {
  id: string;
  format: ExportFormat;
  dateRange: string;
  timestamp: Date;
  status: 'completed' | 'failed';
  sections: number;
}

// ──────────────────────────────────────────────────
// Helpers to build sections from report data
// ──────────────────────────────────────────────────
function buildSections(data: Awaited<ReturnType<typeof getFullReportData>>): ReportSection[] {
  const sections: ReportSection[] = [];

  // KPIs
  sections.push({
    title: 'Key Performance Indicators',
    type: 'kpi-strip',
    data: [
      { label: 'Total Users', value: data.kpis.totalUsers },
      { label: 'Active Today', value: data.kpis.activeToday },
      { label: 'Active (7d)', value: data.kpis.active7d },
      { label: 'Active (30d)', value: data.kpis.active30d },
      { label: 'Total Modules', value: data.kpis.totalModules },
      { label: 'Submissions', value: data.kpis.totalSubmissions, change: data.kpis.submissionGrowth },
      { label: 'Pending Approvals', value: data.kpis.pendingApprovals },
      { label: 'Audit Entries', value: data.kpis.auditEntries, change: data.kpis.auditGrowth },
      { label: 'Login Success', value: data.kpis.loginSuccess, change: data.kpis.loginGrowth },
      { label: 'Login Failed', value: data.kpis.loginFailed },
      { label: 'Failure Rate', value: `${data.kpis.failureRate}%` },
    ],
  });

  // Alerts
  if (data.alerts.length > 0) {
    sections.push({ title: 'Smart Alerts', type: 'alerts', data: data.alerts });
  }

  // Module usage
  if (data.modules.length > 0) {
    sections.push({
      title: 'Module Usage',
      type: 'table',
      data: {
        headers: ['Module', 'Type', 'Forms', 'Published', 'Submissions'],
        rows: data.modules.map((m) => [m.name, m.type, String(m.formCount), String(m.publishedForms), String(m.totalRecords)]),
      },
    });
  }

  // Role Analysis
  if (data.roles.length > 0) {
    sections.push({
      title: 'Role Analysis',
      type: 'table',
      data: {
        headers: ['Role', 'Level', 'Admin', 'Users', 'Permissions'],
        rows: data.roles.map((r) => [r.name, String(r.level), r.isAdmin ? 'Yes' : 'No', String(r.userCount), String(r.permissionCount)]),
      },
    });
    if (data.unassignedUsers > 0) {
      sections.push({
        title: 'User Assignment Status',
        type: 'text',
        data: [`${data.unassignedUsers} users currently have no role assignment.`],
      });
    }
  }

  // Recent Audit Logs
  if (data.recentAudits.length > 0) {
    sections.push({
      title: 'Audit Trail',
      type: 'table',
      data: {
        headers: ['Date', 'Action', 'Module', 'User', 'Details'],
        rows: data.recentAudits.map((a) => [
          new Date(a.date).toLocaleDateString(),
          a.action,
          a.module,
          a.user,
          a.details,
        ]),
      },
    });
  }

  // Login History
  if (data.recentLogins.length > 0) {
    sections.push({
      title: 'Login History',
      type: 'table',
      data: {
        headers: ['Date', 'Email', 'Name', 'Status', 'IP Address'],
        rows: data.recentLogins.map((l) => [
          new Date(l.date).toLocaleDateString(),
          l.email,
          l.name,
          l.status,
          l.ip,
        ]),
      },
    });
  }

  // Generated insights
  const insights: string[] = [];
  if (data.kpis.totalUsers > 0) {
    const activePercent = Math.round((data.kpis.active30d / data.kpis.totalUsers) * 100);
    insights.push(`${activePercent}% of users were active in the last 30 days.`);
  }
  if (data.kpis.submissionGrowth !== 0) {
    insights.push(`Submissions ${data.kpis.submissionGrowth > 0 ? 'increased' : 'decreased'} by ${Math.abs(data.kpis.submissionGrowth)}% compared to previous period.`);
  }
  if (data.kpis.failureRate > 5) {
    insights.push(`Login failure rate of ${data.kpis.failureRate}% warrants attention.`);
  }
  const totalFormCount = data.modules.reduce((s, m) => s + m.formCount, 0);
  const totalPublished = data.modules.reduce((s, m) => s + m.publishedForms, 0);
  if (totalFormCount > 0) {
    insights.push(`${totalPublished} of ${totalFormCount} forms are published (${Math.round((totalPublished / totalFormCount) * 100)}%).`);
  }
  if (insights.length > 0) {
    sections.push({ title: 'Generated Insights', type: 'text', data: insights });
  }

  return sections;
}

// ──────────────────────────────────────────────────
// Report Card Component
// ──────────────────────────────────────────────────
function ReportCard({
  title,
  description,
  icon: Icon,
  format,
  onGenerate,
  generating,
  currentFormat,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  format: ExportFormat;
  onGenerate: (format: ExportFormat) => void;
  generating: boolean;
  currentFormat: ExportFormat | null;
}) {
  const isThisGenerating = generating && currentFormat === format;

  return (
    <Card className="group hover:border-foreground/20 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-foreground/5 text-foreground group-hover:bg-foreground/10 transition-colors">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          onClick={() => onGenerate(format)}
          disabled={generating}
          className="w-full gap-2"
          variant={isThisGenerating ? 'secondary' : 'default'}
          size="sm"
        >
          {isThisGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Generate & Download
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────
// History Row Component
// ──────────────────────────────────────────────────
function HistoryRow({ item }: { item: ExportHistoryItem }) {
  const formatLabels: Record<ExportFormat, string> = {
    'executive-pdf': 'Executive Summary',
    'full-pdf': 'Full Analytics Report',
    excel: 'Excel Workbook',
    csv: 'CSV Export',
  };
  const formatIcons: Record<ExportFormat, React.ElementType> = {
    'executive-pdf': FileText,
    'full-pdf': FileBarChart,
    excel: FileSpreadsheet,
    csv: Table2,
  };
  const Icon = formatIcons[item.format];

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="p-2 rounded-md bg-foreground/5">
        <Icon className="h-4 w-4 text-foreground/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{formatLabels[item.format]}</p>
        <p className="text-xs text-muted-foreground">
          {item.dateRange} &middot; {item.sections} sections
        </p>
      </div>
      <div className="flex items-center gap-2">
        {item.status === 'completed' ? (
          <Badge variant="secondary" className="gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" />
            Done
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertCircle className="h-3 w-3" />
            Failed
          </Badge>
        )}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Stat Card in Preview
// ──────────────────────────────────────────────────
function PreviewStat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Main Reports Page
// ══════════════════════════════════════════════════
export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('30d');
  const [generating, setGenerating] = useState(false);
  const [currentFormat, setCurrentFormat] = useState<ExportFormat | null>(null);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [previewData, setPreviewData] = useState<Awaited<ReturnType<typeof getFullReportData>> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── Load Preview Data ──
  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const data = await getFullReportData(dateRange);
      setPreviewData(data);
    } catch (e) {
      toast.error('Failed to load report preview');
    } finally {
      setLoadingPreview(false);
    }
  }, [dateRange]);

  // ── Generate Report ──
  const handleGenerate = useCallback(
    async (format: ExportFormat) => {
      setGenerating(true);
      setCurrentFormat(format);

      try {
        const data = await getFullReportData(dateRange);
        const sections = buildSections(data);
        const meta: ReportMeta = {
          organizationName: data.meta.organizationName,
          dateRange: dateRange,
          generatedAt: new Date(data.meta.generatedAt),
          generatedBy: data.meta.generatedBy,
          filters: { 'Date Range': dateRange },
        };

        const dateStr = new Date().toISOString().slice(0, 10);

        switch (format) {
          case 'executive-pdf': {
            const doc = generateExecutiveSummaryPDF(meta, sections);
            downloadPDF(doc, `executive-summary-${dateStr}`);
            toast.success('Executive Summary PDF downloaded');
            break;
          }
          case 'full-pdf': {
            const doc = generateFullAnalyticsReportPDF(meta, sections);
            downloadPDF(doc, `full-analytics-report-${dateStr}`);
            toast.success('Full Analytics Report PDF downloaded');
            break;
          }
          case 'excel': {
            const wb = await generateAnalyticsExcel(meta, sections);
            await downloadExcel(wb, `analytics-data-${dateStr}`);
            toast.success('Excel workbook downloaded');
            break;
          }
          case 'csv': {
            const csv = generateAnalyticsCSV(sections);
            downloadCSV(csv, `analytics-data-${dateStr}`);
            toast.success('CSV export downloaded');
            break;
          }
        }

        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            format,
            dateRange,
            timestamp: new Date(),
            status: 'completed' as const,
            sections: sections.length,
          },
          ...prev,
        ]);

        setPreviewData(data);
      } catch (e) {
        console.error('Export error:', e);
        toast.error('Failed to generate report');
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            format,
            dateRange,
            timestamp: new Date(),
            status: 'failed' as const,
            sections: 0,
          },
          ...prev,
        ]);
      } finally {
        setGenerating(false);
        setCurrentFormat(null);
      }
    },
    [dateRange]
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-balance">Reports & Export</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate professional reports and export analytics data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px]">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadPreview} disabled={loadingPreview}>
            {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Preview Data</span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate" className="gap-2">
            <FileDown className="h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ── Generate Tab ── */}
        <TabsContent value="generate" className="space-y-6">
          {/* Report types */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Document Reports
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReportCard
                title="Executive Summary"
                description="Cover page, KPI overview, growth trends, alerts, key usage analytics, and system health summary in a polished PDF."
                icon={FileText}
                format="executive-pdf"
                onGenerate={handleGenerate}
                generating={generating}
                currentFormat={currentFormat}
              />
              <ReportCard
                title="Full Analytics Report"
                description="Landscape PDF with table of contents, all analytics sections, detailed data tables, filters metadata, and appendix."
                icon={FileBarChart}
                format="full-pdf"
                onGenerate={handleGenerate}
                generating={generating}
                currentFormat={currentFormat}
              />
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Data Exports
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReportCard
                title="Excel Workbook"
                description="Multi-sheet workbook with report info, KPIs, module usage, roles, audit trail, login history, and generated insights."
                icon={FileSpreadsheet}
                format="excel"
                onGenerate={handleGenerate}
                generating={generating}
                currentFormat={currentFormat}
              />
              <ReportCard
                title="CSV Export"
                description="Comma-separated values file with all analytics sections. Compatible with any data tool or spreadsheet application."
                icon={Table2}
                format="csv"
                onGenerate={handleGenerate}
                generating={generating}
                currentFormat={currentFormat}
              />
            </div>
          </div>

          {/* Quick Info */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Organization-scoped exports</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All reports are automatically scoped to your organization. Data from other organizations is never included.
                    Reports dynamically discover all modules and forms at generation time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Preview Tab ── */}
        <TabsContent value="preview" className="space-y-6">
          {!previewData ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                <div className="p-3 rounded-full bg-muted">
                  <TrendingUp className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No preview loaded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "Preview Data" to load the current analytics snapshot
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadPreview} disabled={loadingPreview}>
                  {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load Preview
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI Grid */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">KPI Overview</CardTitle>
                  <CardDescription className="text-xs">
                    Data for {previewData.meta.organizationName} &middot; {dateRange}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <PreviewStat label="Total Users" value={previewData.kpis.totalUsers} icon={Users} />
                    <PreviewStat label="Active Today" value={previewData.kpis.activeToday} icon={Activity} />
                    <PreviewStat label="Active (7d)" value={previewData.kpis.active7d} icon={Activity} />
                    <PreviewStat label="Active (30d)" value={previewData.kpis.active30d} icon={Activity} />
                    <PreviewStat label="Modules" value={previewData.kpis.totalModules} icon={BarChart3} />
                    <PreviewStat label="Submissions" value={previewData.kpis.totalSubmissions} icon={FileText} />
                    <PreviewStat label="Pending" value={previewData.kpis.pendingApprovals} icon={Clock} />
                    <PreviewStat label="Failure Rate" value={`${previewData.kpis.failureRate}%`} icon={AlertCircle} />
                  </div>
                </CardContent>
              </Card>

              {/* Alerts */}
              {previewData.alerts.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Smart Alerts ({previewData.alerts.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {previewData.alerts.map((alert, i) => (
                      <div key={i} className="flex items-center gap-3 py-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            alert.severity === 'critical'
                              ? 'bg-red-500'
                              : alert.severity === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                        </div>
                        <Badge
                          variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Modules Preview */}
              {previewData.modules.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Module Usage ({previewData.modules.length} modules)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {previewData.modules.map((mod, i) => {
                        const maxRecords = Math.max(...previewData.modules.map((m) => m.totalRecords), 1);
                        return (
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{mod.name}</span>
                                <Badge variant="outline" className="text-xs">{mod.type}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{mod.formCount} forms</span>
                                <span className="font-medium text-foreground">{mod.totalRecords} records</span>
                              </div>
                            </div>
                            <Progress value={(mod.totalRecords / maxRecords) * 100} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Roles Preview */}
              {previewData.roles.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Roles ({previewData.roles.length})</CardTitle>
                      {previewData.unassignedUsers > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {previewData.unassignedUsers} unassigned
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {previewData.roles.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{r.name}</span>
                            {r.isAdmin && <Badge variant="outline" className="text-xs">Admin</Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground">{r.userCount} users</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Export from Preview */}
              <Card className="bg-foreground/[0.02]">
                <CardContent className="py-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm">
                        <span className="font-medium">Ready to export?</span>{' '}
                        <span className="text-muted-foreground">This data snapshot will be included in all reports.</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleGenerate('executive-pdf')} disabled={generating}>
                        <FileText className="h-4 w-4 mr-1" /> PDF
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleGenerate('excel')} disabled={generating}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleGenerate('csv')} disabled={generating}>
                        <Table2 className="h-4 w-4 mr-1" /> CSV
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="space-y-4">
          {history.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                <div className="p-3 rounded-full bg-muted">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No export history</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generated reports will appear here during this session
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Export History</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {history.length} export{history.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {history.map((item) => (
                  <HistoryRow key={item.id} item={item} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
