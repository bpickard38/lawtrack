/**
 * Export Invoice PDF: build PDF from case + activities in date range.
 * Narrative templates (no AI): Zoom/call -> "Client conference", email -> "Client correspondence",
 * Word/doc -> "Drafting/reviewing documents", Dropbox -> "File review/management", Other -> "Case work".
 * Privacy: only template descriptions, no content.
 */
import { jsPDF } from 'jspdf';
import type { Case, Activity } from '../types';

const FIRM_NAME_PLACEHOLDER = '[Firm Name]';

/** Map activity to invoice line description (template only, no content). */
export function getNarrativeDescription(activity: Activity): string {
  const type = activity.type;
  const docName = (activity.document_name || '').toLowerCase();
  const desc = (activity.description || '').toLowerCase();

  if (type === 'call') return 'Client conference';
  if (type === 'email') return 'Client correspondence';
  if (type === 'document') {
    if (/dropbox|file\s*review|file\s*management/.test(docName) || /dropbox/.test(desc)) return 'File review/management';
    return 'Drafting/reviewing documents';
  }
  return 'Case work';
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

interface InvoiceLine {
  date: string;
  description: string;
  durationMinutes: number;
  durationHHMM: string;
}

function activitiesToInvoiceLines(activities: Activity[]): InvoiceLine[] {
  return activities
    .filter(a => a.duration_minutes > 0)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map(a => {
      const d = new Date(a.start_time);
      const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      return {
        date: dateStr,
        description: getNarrativeDescription(a),
        durationMinutes: a.duration_minutes,
        durationHHMM: minutesToHHMM(a.duration_minutes),
      };
    });
}

/** Build PDF and trigger download. */
export function buildAndDownloadInvoicePdf(
  caseData: Case,
  activities: Activity[],
  startDate: string,
  endDate: string
): void {
  const lines = activitiesToInvoiceLines(activities);
  const totalMinutes = lines.reduce((sum, l) => sum + l.durationMinutes, 0);
  const totalHours = totalMinutes / 60;

  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  let y = 20;

  // Header
  doc.setFontSize(16);
  doc.text(FIRM_NAME_PLACEHOLDER, 20, y);
  y += 10;
  doc.setFontSize(11);
  doc.text(`Client: ${caseData.client_name || '[Client name]'}`, 20, y);
  y += 6;
  doc.text(`Matter / Case: ${caseData.name}`, 20, y);
  y += 6;
  doc.text(`Invoice period: ${startDate} to ${endDate}`, 20, y);
  y += 14;

  // Table header
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', 20, y);
  doc.text('Description', 50, y);
  doc.text('Duration', 130, y);
  doc.setFont('helvetica', 'normal');
  y += 8;

  // Group by day for subtotals
  const byDay = new Map<string, { lines: InvoiceLine[]; totalMinutes: number }>();
  for (const line of lines) {
    if (!byDay.has(line.date)) byDay.set(line.date, { lines: [], totalMinutes: 0 });
    const group = byDay.get(line.date)!;
    group.lines.push(line);
    group.totalMinutes += line.durationMinutes;
  }
  const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [date, { lines: dayLines, totalMinutes: dayTotal }] of sortedDays) {
    for (const line of dayLines) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(line.date, 20, y);
      doc.text(line.description, 50, y);
      doc.text(line.durationHHMM, 130, y);
      y += 6;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal ${date}: ${minutesToHHMM(dayTotal)}`, 50, y);
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand total hours: ${totalHours.toFixed(2)}`, 20, y);
  doc.setFont('helvetica', 'normal');

  const filename = `invoice-${caseData.name.replace(/[^a-zA-Z0-9]/g, '-')}-${startDate}-${endDate}.pdf`;
  doc.save(filename);
}
