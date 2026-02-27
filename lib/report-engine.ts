'use client';

/**
 * Report Engine - Generates PDF, PPTX, Excel, CSV reports
 * from live analytics data. Fully metadata-driven, no hardcoded entities.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────
export interface ReportSection {
  title: string;
  type: 'kpi-strip' | 'table' | 'summary' | 'alerts' | 'text';
  data: any;
}

export interface ReportMeta {
  organizationName: string;
  dateRange: string;
  generatedAt: Date;
  generatedBy: string;
  filters?: Record<string, string>;
}

interface KPIItem {
  label: string;
  value: string | number;
  change?: number;
  suffix?: string;
}

// ──────────────────────────────────────────────────
// PDF Colors and Styling
// ──────────────────────────────────────────────────
const BRAND = { r: 15, g: 23, b: 42 };       // slate-900
const ACCENT = { r: 59, g: 130, b: 246 };     // blue-500
const LIGHT_BG = { r: 248, g: 250, b: 252 };  // slate-50
const MUTED = { r: 100, g: 116, b: 139 };     // slate-500
const SUCCESS = { r: 34, g: 197, b: 94 };
const DANGER = { r: 239, g: 68, b: 68 };
const WARNING = { r: 245, g: 158, b: 11 };

function addPageFooter(doc: jsPDF, meta: ReportMeta) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      `${meta.organizationName} | Generated ${meta.generatedAt.toLocaleDateString()} at ${meta.generatedAt.toLocaleTimeString()} | Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }
}

// ──────────────────────────────────────────────────
// Cover Page
// ──────────────────────────────────────────────────
function addCoverPage(doc: jsPDF, meta: ReportMeta, title: string, subtitle: string) {
  const w = doc.internal.pageSize.width;
  const h = doc.internal.pageSize.height;

  // Top bar
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, w, 80, 'F');

  // Accent line
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.rect(0, 80, w, 4, 'F');

  // Organization name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(meta.organizationName, 20, 35);

  // Title
  doc.setFontSize(28);
  doc.text(title, 20, 60);

  // Subtitle below bar
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFontSize(14);
  doc.text(subtitle, 20, 110);

  // Metadata
  doc.setFontSize(10);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  const details = [
    `Period: ${meta.dateRange}`,
    `Generated: ${meta.generatedAt.toLocaleDateString()} ${meta.generatedAt.toLocaleTimeString()}`,
    `Prepared by: ${meta.generatedBy}`,
  ];
  if (meta.filters) {
    Object.entries(meta.filters).forEach(([k, v]) => {
      details.push(`${k}: ${v}`);
    });
  }
  details.forEach((line, i) => {
    doc.text(line, 20, 130 + i * 8);
  });

  // Decorative bottom
  doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
  doc.rect(0, h - 30, w, 30, 'F');
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text('Confidential - For internal use only', w / 2, h - 14, { align: 'center' });
}

// ──────────────────────────────────────────────────
// KPI Strip Section
// ──────────────────────────────────────────────────
function addKPISection(doc: jsPDF, y: number, title: string, kpis: KPIItem[]): number {
  // Section heading
  doc.setFontSize(14);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text(title, 20, y);
  y += 4;

  // Accent underline
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.setLineWidth(0.5);
  doc.line(20, y, 100, y);
  y += 8;

  const w = doc.internal.pageSize.width;
  const cardWidth = (w - 50) / Math.min(kpis.length, 4);
  const rows = Math.ceil(kpis.length / 4);

  for (let row = 0; row < rows; row++) {
    const rowKpis = kpis.slice(row * 4, (row + 1) * 4);
    rowKpis.forEach((kpi, i) => {
      const x = 20 + i * cardWidth;

      // Card bg
      doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
      doc.roundedRect(x, y, cardWidth - 5, 28, 2, 2, 'F');

      // Label
      doc.setFontSize(8);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(kpi.label, x + 5, y + 8);

      // Value
      doc.setFontSize(16);
      doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
      doc.text(`${kpi.value}${kpi.suffix || ''}`, x + 5, y + 20);

      // Growth indicator
      if (kpi.change !== undefined && kpi.change !== 0) {
        const isPos = kpi.change > 0;
        doc.setFontSize(8);
        doc.setTextColor(isPos ? SUCCESS.r : DANGER.r, isPos ? SUCCESS.g : DANGER.g, isPos ? SUCCESS.b : DANGER.b);
        doc.text(`${isPos ? '+' : ''}${kpi.change}%`, x + cardWidth - 25, y + 20);
      }
    });
    y += 34;
  }

  return y;
}

// ──────────────────────────────────────────────────
// Table Section
// ──────────────────────────────────────────────────
function addTableSection(doc: jsPDF, y: number, title: string, data: { headers: string[]; rows: string[][] }): number {
  if (y > doc.internal.pageSize.height - 80) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(14);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text(title, 20, y);
  y += 3;
  doc.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.setLineWidth(0.5);
  doc.line(20, y, 100, y);
  y += 6;

  autoTable(doc, {
    head: [data.headers],
    body: data.rows,
    startY: y,
    margin: { left: 20, right: 20 },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b] },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}

// ──────────────────────────────────────────────────
// Alerts Section
// ──────────────────────────────────────────────────
function addAlertsSection(doc: jsPDF, y: number, alerts: Array<{ severity: string; title: string; description: string }>): number {
  if (alerts.length === 0) return y;

  if (y > doc.internal.pageSize.height - 80) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(14);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text('Smart Alerts', 20, y);
  y += 10;

  alerts.forEach((alert) => {
    if (y > doc.internal.pageSize.height - 30) {
      doc.addPage();
      y = 25;
    }

    const color = alert.severity === 'critical' ? DANGER : alert.severity === 'warning' ? WARNING : ACCENT;

    // Dot
    doc.setFillColor(color.r, color.g, color.b);
    doc.circle(25, y - 1.5, 2, 'F');

    // Title
    doc.setFontSize(10);
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.text(alert.title, 32, y);

    // Desc
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(alert.description, 32, y + 6);

    y += 14;
  });

  return y;
}

// ──────────────────────────────────────────────────
// Text / Summary Section
// ──────────────────────────────────────────────────
function addTextSection(doc: jsPDF, y: number, title: string, lines: string[]): number {
  if (y > doc.internal.pageSize.height - 60) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(14);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text(title, 20, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  lines.forEach((line) => {
    if (y > doc.internal.pageSize.height - 20) {
      doc.addPage();
      y = 25;
    }
    doc.text(line, 25, y);
    y += 5;
  });

  return y + 6;
}

// ══════════════════════════════════════════════════
// PUBLIC: Executive Summary PDF
// ══════════════════════════════════════════════════
export function generateExecutiveSummaryPDF(
  meta: ReportMeta,
  sections: ReportSection[]
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cover page
  addCoverPage(doc, meta, 'Executive Summary', 'Key performance indicators and strategic insights');

  // Content pages
  doc.addPage();
  let y = 25;

  for (const section of sections) {
    switch (section.type) {
      case 'kpi-strip':
        y = addKPISection(doc, y, section.title, section.data);
        break;
      case 'table':
        y = addTableSection(doc, y, section.title, section.data);
        break;
      case 'alerts':
        y = addAlertsSection(doc, y, section.data);
        break;
      case 'summary':
      case 'text':
        y = addTextSection(doc, y, section.title, section.data);
        break;
    }
  }

  addPageFooter(doc, meta);
  return doc;
}

// ══════════════════════════════════════════════════
// PUBLIC: Full Analytics Report PDF
// ══════════════════════════════════════════════════
export function generateFullAnalyticsReportPDF(
  meta: ReportMeta,
  sections: ReportSection[]
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  addCoverPage(doc, meta, 'Full Analytics Report', 'Comprehensive analytics documentation with detailed data tables');

  // Table of Contents
  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text('Table of Contents', 20, 25);
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  sections.forEach((s, i) => {
    doc.text(`${i + 1}. ${s.title}`, 25, 40 + i * 7);
  });

  // Filters metadata
  if (meta.filters && Object.keys(meta.filters).length > 0) {
    const filterY = 40 + sections.length * 7 + 15;
    doc.setFontSize(12);
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.text('Applied Filters', 20, filterY);
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    Object.entries(meta.filters).forEach(([k, v], i) => {
      doc.text(`${k}: ${v}`, 25, filterY + 8 + i * 5);
    });
  }

  // Content sections
  for (const section of sections) {
    doc.addPage();
    let y = 25;

    switch (section.type) {
      case 'kpi-strip':
        y = addKPISection(doc, y, section.title, section.data);
        break;
      case 'table':
        y = addTableSection(doc, y, section.title, section.data);
        break;
      case 'alerts':
        y = addAlertsSection(doc, y, section.data);
        break;
      case 'summary':
      case 'text':
        y = addTextSection(doc, y, section.title, section.data);
        break;
    }
  }

  // Appendix
  doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text('Appendix', 20, 25);
  doc.setFontSize(9);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(`Report contains ${sections.length} sections covering ${meta.dateRange} period.`, 20, 35);
  doc.text(`Data aggregated dynamically from all available modules and forms.`, 20, 42);
  doc.text(`All metrics are organization-scoped and respect role-based access.`, 20, 49);

  addPageFooter(doc, meta);
  return doc;
}

// ══════════════════════════════════════════════════
// PUBLIC: Excel Workbook Export
// ══════════════════════════════════════════════════
export async function generateAnalyticsExcel(
  meta: ReportMeta,
  sections: ReportSection[]
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Organization', meta.organizationName],
    ['Period', meta.dateRange],
    ['Generated', meta.generatedAt.toLocaleString()],
    ['Generated By', meta.generatedBy],
    [''],
  ];
  if (meta.filters) {
    summaryData.push(['--- Filters ---', '']);
    Object.entries(meta.filters).forEach(([k, v]) => {
      summaryData.push([k, v]);
    });
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Report Info');

  // Data sheets from sections
  for (const section of sections) {
    const sheetName = section.title.slice(0, 31).replace(/[\\\/\?\*\[\]]/g, '');

    if (section.type === 'kpi-strip') {
      const kpiData = (section.data as KPIItem[]).map((k) => ({
        Metric: k.label,
        Value: k.value,
        Change: k.change !== undefined ? `${k.change}%` : '-',
      }));
      const sheet = XLSX.utils.json_to_sheet(kpiData);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    } else if (section.type === 'table') {
      const tableData = section.data as { headers: string[]; rows: string[][] };
      const aoa = [tableData.headers, ...tableData.rows];
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    } else if (section.type === 'alerts') {
      const alertData = (section.data as any[]).map((a) => ({
        Severity: a.severity,
        Alert: a.title,
        Details: a.description,
      }));
      const sheet = XLSX.utils.json_to_sheet(alertData);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    } else if (section.type === 'text' || section.type === 'summary') {
      const textData = (section.data as string[]).map((line) => [line]);
      const sheet = XLSX.utils.aoa_to_sheet([[section.title], ...textData]);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    }
  }

  return wb;
}

// ══════════════════════════════════════════════════
// PUBLIC: CSV Multi-section Export
// ══════════════════════════════════════════════════
export function generateAnalyticsCSV(sections: ReportSection[]): string {
  const lines: string[] = [];

  for (const section of sections) {
    lines.push(`# ${section.title}`);

    if (section.type === 'kpi-strip') {
      lines.push('Metric,Value,Change');
      (section.data as KPIItem[]).forEach((k) => {
        lines.push(`"${k.label}","${k.value}","${k.change !== undefined ? k.change + '%' : '-'}"`);
      });
    } else if (section.type === 'table') {
      const td = section.data as { headers: string[]; rows: string[][] };
      lines.push(td.headers.map((h) => `"${h}"`).join(','));
      td.rows.forEach((row) => {
        lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
      });
    } else if (section.type === 'alerts') {
      lines.push('Severity,Alert,Details');
      (section.data as any[]).forEach((a) => {
        lines.push(`"${a.severity}","${a.title}","${a.description}"`);
      });
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ══════════════════════════════════════════════════
// PUBLIC: Widget PNG Export (captures a DOM element)
// ══════════════════════════════════════════════════
export async function exportWidgetAsPNG(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;

  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ══════════════════════════════════════════════════
// PUBLIC: Download helpers
// ══════════════════════════════════════════════════
export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(`${filename}.pdf`);
}

export async function downloadExcel(wb: any, filename: string) {
  const XLSX = await import('xlsx');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
