/**
 * Export utilities for analytics data
 */

export interface ExportOptions {
  filename: string;
  data: any[];
  columns?: string[];
}

/**
 * Export data as CSV
 */
export function exportToCSV(options: ExportOptions & { mimeType?: string }): void {
  const { filename, data, columns, mimeType = 'text/csv;charset=utf-8;' } = options;

  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Use provided columns or extract from first item
  const keys = columns || Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    keys.join(','), // Header
    ...data.map((row) =>
      keys
        .map((key) => {
          const value = row[key];
          // Handle nested objects and arrays
          if (typeof value === 'object') {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          // Escape quotes in strings
          return `"${String(value || '').replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\n');

  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * Export data as XLSX using a simple approach
 */
export async function exportToXLSX(options: ExportOptions): Promise<void> {
  const { filename, data, columns } = options;

  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  try {
    // Dynamic import of xlsx library
    const XLSX = await import('xlsx');

    const keys = columns || Object.keys(data[0]);
    const worksheet = XLSX.utils.json_to_sheet(data, { header: keys });
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Analytics Data');

    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (error) {
    console.error('Error exporting to XLSX:', error);
    // Fallback to CSV if XLSX is not available
    exportToCSV(options);
  }
}

/**
 * Export data as PDF
 */
export async function exportToPDF(options: ExportOptions & { title?: string }): Promise<void> {
  const { filename, data, columns, title } = options;

  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  try {
    // Dynamic import of jsPDF and html2canvas
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const keys = columns || Object.keys(data[0]);

    // Add title
    if (title) {
      doc.setFontSize(16);
      doc.text(title, 14, 22);
    }

    // Add timestamp
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    // Add table
    const rows = data.map((row) =>
      keys.map((key) => {
        const value = row[key];
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value || '');
      })
    );

    autoTable(doc, {
      head: [keys],
      body: rows,
      startY: 40,
      margin: { top: 20, right: 10, bottom: 10, left: 10 },
      styles: {
        fontSize: 9,
        cellPadding: 4,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });

    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    // Fallback to CSV
    exportToCSV(options);
  }
}

/**
 * Helper function to download file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Prepare audit log data for export
 */
export function prepareAuditLogExport(auditLogs: any[]): any[] {
  return auditLogs.map((log) => ({
    'Timestamp': log.timestamp,
    'Action': log.action,
    'Entity Type': log.entityType,
    'Entity ID': log.entityId,
    'User': log.userName || log.userEmail,
    'Email': log.userEmail,
    'IP Address': log.ipAddress || '-',
    'Changes': JSON.stringify(log.changes),
  }));
}

/**
 * Prepare user analytics data for export
 */
export function prepareUserAnalyticsExport(users: any[]): any[] {
  return users.map((user) => ({
    'Email': user.email,
    'Name': user.name,
    'Status': user.status,
    'Login Count': user.loginCount,
    'Joined Date': user.joinedDate,
  }));
}

/**
 * Prepare form metrics data for export
 */
export function prepareFormMetricsExport(formMetrics: any[]): any[] {
  const result: any[] = [];

  formMetrics.forEach((metric) => {
    result.push({
      'Form Module': metric.formModule,
      'Total Submissions': metric.totalSubmissions,
      'Daily Data': metric.dailyBreakdown.length,
    });

    // Add daily breakdown data
    metric.dailyBreakdown.forEach((daily: any) => {
      result.push({
        'Form Module': `${metric.formModule} - Daily`,
        'Date': daily.date,
        'Submissions': daily.submissions,
      });
    });
  });

  return result;
}
