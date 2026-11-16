import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyMenuEntry, PdfOrientation, SppgUserProfile } from '../types';
import { formatIndonesianFullDate, getPeriodeLabel, parseMonthKey } from './dateUtils';

export function exportRekapanToF4Pdf(params: {
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  orientation?: PdfOrientation;
  includeYearInPeriod?: boolean;
}): void {
  const {
    profile,
    monthKey,
    entries,
    orientation = 'landscape',
    includeYearInPeriod = false,
  } = params;

  const { year, month } = parseMonthKey(monthKey);
  const periodeText = getPeriodeLabel(year, month, includeYearInPeriod);
  const sortedEntries = [...entries].sort(
    (a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso)
  );

  // Indonesian F4 / Folio exact dimensions in millimeters: 215mm x 330mm
  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 10;

  // 1. Top Vibrant Green Title Banner (#00B050)
  const bannerHeight = 9.5;
  doc.setFillColor(0, 176, 80);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(marginX, cursorY, contentWidth, bannerHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(0, 0, 0);
  doc.text((profile.reportTitle || 'REKAPAN MENU SMP').toUpperCase(), pageWidth / 2, cursorY + 6.3, {
    align: 'center',
  });
  cursorY += bannerHeight;

  // 2. SPPG Identity Metadata Block
  const metaRows: Array<[string, string]> = [
    ['Nama SPPG', profile.namaSppg || '-'],
    ['ID SPPG', profile.idSppg || '-'],
    ['Alamat', profile.alamat || '-'],
    ['Kab/Kota', profile.kabKota || '-'],
    ['Provinsi', profile.provinsi || '-'],
    ['Nama SPPI/AG', profile.namaSppi || '-'],
    ['Nomor Handphone', profile.nomorHp || '-'],
    ['Periode/Bulan', periodeText],
  ];

  const lineH = 4.6;
  const metaPaddingTop = 2.2;
  const metaPaddingBottom = 2.0;
  const metaBoxHeight = metaPaddingTop + metaRows.length * lineH + metaPaddingBottom;

  doc.setFillColor(255, 255, 255);
  doc.rect(marginX, cursorY, contentWidth, metaBoxHeight, 'FD');

  const labelX = marginX + 2.5;
  const colonX = orientation === 'landscape' ? marginX + 102 : marginX + 58;
  const valueX = colonX + 3.5;

  doc.setFontSize(8.8);
  doc.setTextColor(0, 0, 0);

  metaRows.forEach(([label, val], idx) => {
    const y = cursorY + metaPaddingTop + (idx + 1) * lineH - 1.1;
    doc.setFont('helvetica', 'bold');
    doc.text(label, labelX, y);
    doc.text(':', colonX, y);
    doc.text(val, valueX, y, { maxWidth: contentWidth - (valueX - marginX) - 2 });
  });

  cursorY += metaBoxHeight;

  // 3. Column widths calibrated cleanly for F4 Landscape (310mm usable) or F4 Portrait (195mm usable)
  const colWidths =
    orientation === 'landscape'
      ? {
          hariKe: 16,
          namaSppg: 74,
          idSppg: 26,
          tanggal: 52,
          namaMenu: 92,
          foto: 50,
        }
      : {
          hariKe: 13,
          namaSppg: 43,
          idSppg: 20,
          tanggal: 34,
          namaMenu: 47,
          foto: 38,
        };

  const photoCellMinHeight = orientation === 'landscape' ? 31 : 25;
  const photoBoxW = orientation === 'landscape' ? 43 : 33;
  const photoBoxH = Math.round((photoBoxW * 2) / 3 * 10) / 10; // exact 3:2 ratio

  const bodyData = sortedEntries.map((entry) => [
    String(entry.hariKe),
    profile.namaSppg || '-',
    profile.idSppg || '-',
    formatIndonesianFullDate(entry.dateIso),
    entry.namaMenu || '-',
    '', // Photo drawn in didDrawCell
  ]);

  const redBg: [number, number, number] = [234, 67, 53];
  const blueBg: [number, number, number] = [141, 180, 226];

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, top: 10, bottom: 12 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: orientation === 'landscape' ? 8.5 : 7.4,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.28,
      valign: 'middle',
      cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
      overflow: 'linebreak',
    },
    headStyles: {
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    head: [
      [
        { content: 'Hari\nKe', rowSpan: 2, styles: { fillColor: redBg } },
        { content: 'IDENTITAS SPPG', colSpan: 2, styles: { fillColor: redBg } },
        { content: 'Hari / Tanggal', rowSpan: 2, styles: { fillColor: blueBg } },
        { content: 'Nama Menu', rowSpan: 2, styles: { fillColor: blueBg } },
        { content: 'FOTO MENU', rowSpan: 2, styles: { fillColor: blueBg } },
      ],
      [
        { content: 'Nama SPPG', styles: { fillColor: redBg } },
        { content: 'ID SPPG', styles: { fillColor: redBg } },
      ],
    ],
    body: bodyData,
    columnStyles: {
      0: { cellWidth: colWidths.hariKe, halign: 'center' },
      1: { cellWidth: colWidths.namaSppg, halign: 'left' },
      2: { cellWidth: colWidths.idSppg, halign: 'center' },
      3: { cellWidth: colWidths.tanggal, halign: 'left' },
      4: { cellWidth: colWidths.namaMenu, halign: 'left' },
      5: { cellWidth: colWidths.foto, halign: 'center', minCellHeight: photoCellMinHeight },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        data.cell.styles.minCellHeight = photoCellMinHeight;
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const entry = sortedEntries[data.row.index];
        if (!entry?.photoDataUrl) return;

        const imgX = data.cell.x + (data.cell.width - photoBoxW) / 2;
        const imgY = data.cell.y + (data.cell.height - photoBoxH) / 2;

        try {
          doc.addImage(entry.photoDataUrl, 'JPEG', imgX, imgY, photoBoxW, photoBoxH, undefined, 'FAST');
          doc.setDrawColor(60, 60, 60);
          doc.setLineWidth(0.18);
          doc.rect(imgX, imgY, photoBoxW, photoBoxH, 'S');
        } catch {
          // Ignore malformed data URL gracefully
        }
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      const footerY = doc.internal.pageSize.getHeight() - 5;
      doc.text(
        `${profile.namaSppg || 'SPPG'} · ${periodeText} · Format F4 (${orientation === 'landscape' ? '330×215 mm' : '215×330 mm'})`,
        marginX,
        footerY
      );
      doc.text(`Halaman ${data.pageNumber} / ${pageCount}`, pageWidth - marginX, footerY, {
        align: 'right',
      });
    },
  });

  const safeTitle = (profile.reportTitle || 'REKAPAN_MENU')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const safeId = (profile.idSppg || 'SPPG').replace(/[^a-zA-Z0-9]+/g, '_');
  const safePeriod = getPeriodeLabel(year, month, true).replace(/\s+/g, '_');

  doc.save(`${safeTitle}_${safePeriod}_${safeId}.pdf`);
}
