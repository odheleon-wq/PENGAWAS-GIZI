import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DailyMenuEntry,
  PdfOrientation,
  SampleFormConfig,
  SamplePertinggalRow,
  SppgUserProfile,
  TempDayReading,
  TempFormConfig,
  TempMonitoringRoom,
  FreezerFormConfig,
  FreezerLogRow,
  FreezerMachine,
} from '../types';
import {
  BGN_FREEZER_CHILLER_DEFAULTS,
  SOP_BGN_ROOM_PRESETS,
} from '../constants/temperatureStandards';
import {
  DEFAULT_FREEZER_COL_LABELS,
  DEFAULT_SAMPLE_COLUMN_LABELS,
  DEFAULT_TEMP_TABLE_LABELS,
} from '../services/sppgService';
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

export function exportNutritionToF4Pdf(params: {
  profile: SppgUserProfile;
  monthKey: string;
  categoryLabel: string;
  summary: {
    rows: Array<{
      entry: DailyMenuEntry;
      values: {
        energi: number;
        protein: number;
        lemak: number;
        karbohidrat: number;
        serat: number;
        jumlahManfaat: number;
      };
    }>;
    totals: {
      energi: number;
      protein: number;
      lemak: number;
      karbohidrat: number;
      serat: number;
      jumlahManfaat: number;
    };
    dayCounts: {
      energi: number;
      protein: number;
      lemak: number;
      karbohidrat: number;
      serat: number;
      jumlahManfaat: number;
    };
    averages: {
      energi: number;
      protein: number;
      lemak: number;
      karbohidrat: number;
      serat: number;
    };
    akgRef: {
      energi: number;
      protein: number;
      lemak: number;
      karbohidrat: number;
      serat: number;
    };
    percentAkg: {
      energi: number;
      protein: number;
      lemak: number;
      karbohidrat: number;
      serat: number;
    };
    targetOrang: number;
  };
  orientation?: PdfOrientation;
  includeYearInPeriod?: boolean;
}): void {
  const {
    profile,
    monthKey,
    categoryLabel,
    summary,
    orientation = 'portrait',
    includeYearInPeriod = true,
  } = params;

  const { year, month } = parseMonthKey(monthKey);
  const periodeText = getPeriodeLabel(year, month, includeYearInPeriod);
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

  // 1. Green Banner
  const bannerHeight = 9;
  doc.setFillColor(0, 176, 80);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(marginX, cursorY, contentWidth, bannerHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`REKAPAN NILAI GIZI ${categoryLabel.toUpperCase()}`, pageWidth / 2, cursorY + 6, {
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

  const lineH = 4.3;
  const metaPaddingTop = 2.0;
  const metaPaddingBottom = 1.8;
  const metaBoxHeight = metaPaddingTop + metaRows.length * lineH + metaPaddingBottom;

  doc.setFillColor(255, 255, 255);
  doc.rect(marginX, cursorY, contentWidth, metaBoxHeight, 'FD');

  const labelX = marginX + 2.5;
  const colonX = orientation === 'landscape' ? marginX + 90 : marginX + 46;
  const valueX = colonX + 3.5;

  doc.setFontSize(8.2);
  doc.setTextColor(0, 0, 0);
  metaRows.forEach(([label, val], idx) => {
    const y = cursorY + metaPaddingTop + (idx + 1) * lineH - 1.0;
    doc.setFont('helvetica', 'bold');
    doc.text(label, labelX, y);
    doc.text(':', colonX, y);
    doc.text(val, valueX, y, { maxWidth: contentWidth - (valueX - marginX) - 2 });
  });

  cursorY += metaBoxHeight;

  const blueBg: [number, number, number] = [141, 180, 226];
  const greenBg: [number, number, number] = [0, 176, 80];
  const lightGreenBg: [number, number, number] = [146, 208, 80];
  const yellowBg: [number, number, number] = [255, 255, 0];
  const redBg: [number, number, number] = [255, 0, 0];

  const fmt1 = (n: number) => n.toFixed(1);
  const pctBadgeColor = (pct: number): [number, number, number] =>
    pct >= 90 && pct <= 110 ? lightGreenBg : redBg;

  const bodyRows: unknown[] = summary.rows.map((row) => [
    formatIndonesianFullDate(row.entry.dateIso),
    row.entry.namaMenu || '-',
    fmt1(row.values.energi),
    fmt1(row.values.protein),
    fmt1(row.values.lemak),
    fmt1(row.values.karbohidrat),
    fmt1(row.values.serat),
    String(Math.round(row.values.jumlahManfaat)),
  ]);

  // 5 Summary Footer Rows matching image_de80e8df.png
  bodyRows.push([
    { content: 'Total Nilai Gizi', colSpan: 2, styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'left' } },
    { content: fmt1(summary.totals.energi), styles: { fillColor: greenBg, fontStyle: 'bold' } },
    { content: fmt1(summary.totals.protein), styles: { fillColor: greenBg, fontStyle: 'bold' } },
    { content: fmt1(summary.totals.lemak), styles: { fillColor: greenBg, fontStyle: 'bold' } },
    { content: fmt1(summary.totals.karbohidrat), styles: { fillColor: greenBg, fontStyle: 'bold' } },
    { content: fmt1(summary.totals.serat), styles: { fillColor: greenBg, fontStyle: 'bold' } },
    { content: String(Math.round(summary.totals.jumlahManfaat)), styles: { fillColor: [255, 255, 255], fontStyle: 'bold' } },
  ]);

  bodyRows.push([
    { content: 'Jumlah Hari', colSpan: 2, styles: { fillColor: lightGreenBg, fontStyle: 'bold', halign: 'left' } },
    { content: `${summary.dayCounts.energi} Hari`, styles: { fillColor: lightGreenBg, fontStyle: 'bold' } },
    { content: `${summary.dayCounts.protein} Hari`, styles: { fillColor: lightGreenBg, fontStyle: 'bold' } },
    { content: `${summary.dayCounts.lemak} Hari`, styles: { fillColor: lightGreenBg, fontStyle: 'bold' } },
    { content: `${summary.dayCounts.karbohidrat} Hari`, styles: { fillColor: lightGreenBg, fontStyle: 'bold' } },
    { content: `${summary.dayCounts.serat} Hari`, styles: { fillColor: lightGreenBg, fontStyle: 'bold' } },
    { content: `${summary.dayCounts.jumlahManfaat} Hari`, styles: { fillColor: lightGreenBg, fontStyle: 'bold' } },
  ]);

  bodyRows.push([
    { content: 'Nilai Rata-Rata', colSpan: 2, styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'left' } },
    { content: fmt1(summary.averages.energi), styles: { fillColor: yellowBg, fontStyle: 'bold' } },
    { content: fmt1(summary.averages.protein), styles: { fillColor: yellowBg, fontStyle: 'bold' } },
    { content: fmt1(summary.averages.lemak), styles: { fillColor: yellowBg, fontStyle: 'bold' } },
    { content: fmt1(summary.averages.karbohidrat), styles: { fillColor: yellowBg, fontStyle: 'bold' } },
    { content: fmt1(summary.averages.serat), styles: { fillColor: yellowBg, fontStyle: 'bold' } },
    {
      content: `${summary.targetOrang} Orang`,
      rowSpan: 3,
      styles: { fillColor: lightGreenBg, fontStyle: 'bold', valign: 'middle' },
    },
  ]);

  bodyRows.push([
    { content: 'Rujukan AKG 20-25%', colSpan: 2, styles: { fillColor: lightGreenBg, fontStyle: 'bold', halign: 'left' } },
    { content: fmt1(summary.akgRef.energi), styles: { fillColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: fmt1(summary.akgRef.protein), styles: { fillColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: fmt1(summary.akgRef.lemak), styles: { fillColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: fmt1(summary.akgRef.karbohidrat), styles: { fillColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: fmt1(summary.akgRef.serat), styles: { fillColor: [255, 255, 255], fontStyle: 'bold' } },
  ]);

  bodyRows.push([
    { content: '% Kebutuhan 90-110%', colSpan: 2, styles: { fillColor: lightGreenBg, fontStyle: 'bold', halign: 'left' } },
    { content: `${Math.round(summary.percentAkg.energi)}%`, styles: { fillColor: pctBadgeColor(summary.percentAkg.energi), fontStyle: 'bold' } },
    { content: `${Math.round(summary.percentAkg.protein)}%`, styles: { fillColor: pctBadgeColor(summary.percentAkg.protein), fontStyle: 'bold' } },
    { content: `${Math.round(summary.percentAkg.lemak)}%`, styles: { fillColor: pctBadgeColor(summary.percentAkg.lemak), fontStyle: 'bold' } },
    { content: `${Math.round(summary.percentAkg.karbohidrat)}%`, styles: { fillColor: pctBadgeColor(summary.percentAkg.karbohidrat), fontStyle: 'bold' } },
    { content: `${Math.round(summary.percentAkg.serat)}%`, styles: { fillColor: pctBadgeColor(summary.percentAkg.serat), fontStyle: 'bold' } },
  ]);

  const colWidths =
    orientation === 'landscape'
      ? { tgl: 48, menu: 102, num: 27, manfaat: 25 }
      : { tgl: 35, menu: 50, num: 18, manfaat: 20 };

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, top: 10, bottom: 12 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: orientation === 'landscape' ? 8.2 : 7.0,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.28,
      valign: 'middle',
      cellPadding: { top: 2.0, right: 2.0, bottom: 2.0, left: 2.0 },
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
        { content: 'Hari / Tanggal', rowSpan: 2, styles: { fillColor: blueBg } },
        { content: 'Nama Menu', rowSpan: 2, styles: { fillColor: blueBg } },
        { content: `Data Nilai Gizi ${categoryLabel}`, colSpan: 5, styles: { fillColor: blueBg } },
        { content: 'Jumlah\nManfaat', rowSpan: 2, styles: { fillColor: greenBg } },
      ],
      [
        { content: 'Energi\n(kkal)', styles: { fillColor: blueBg } },
        { content: 'Protein\n(gram)', styles: { fillColor: blueBg } },
        { content: 'Lemak\n(gram)', styles: { fillColor: blueBg } },
        { content: 'Karbohidrat\n(gram)', styles: { fillColor: blueBg } },
        { content: 'Serat\n(gram)', styles: { fillColor: blueBg } },
      ],
    ],
    body: bodyRows as never[],
    columnStyles: {
      0: { cellWidth: colWidths.tgl, halign: 'left' },
      1: { cellWidth: colWidths.menu, halign: 'left' },
      2: { cellWidth: colWidths.num, halign: 'center' },
      3: { cellWidth: colWidths.num, halign: 'center' },
      4: { cellWidth: colWidths.num, halign: 'center' },
      5: { cellWidth: colWidths.num, halign: 'center' },
      6: { cellWidth: colWidths.num, halign: 'center' },
      7: { cellWidth: colWidths.manfaat, halign: 'center' },
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      const footerY = doc.internal.pageSize.getHeight() - 5;
      doc.text(
        `${profile.namaSppg || 'SPPG'} · Nilai Gizi ${categoryLabel} · Format F4 (${orientation === 'landscape' ? '330×215 mm' : '215×330 mm'})`,
        marginX,
        footerY
      );
      doc.text(`Halaman ${data.pageNumber} / ${pageCount}`, pageWidth - marginX, footerY, {
        align: 'right',
      });
    },
  });

  const safeCat = categoryLabel
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const safeId = (profile.idSppg || 'SPPG').replace(/[^a-zA-Z0-9]+/g, '_');
  const safePeriod = getPeriodeLabel(year, month, true).replace(/\s+/g, '_');

  doc.save(`REKAPAN_NILAI_GIZI_${safeCat}_${safePeriod}_${safeId}.pdf`);
}

export function exportSamplePertinggalToF4Pdf(params: {
  config: SampleFormConfig;
  rows: SamplePertinggalRow[];
  orientation?: PdfOrientation;
  minPrintableRows?: number;
}): void {
  const {
    config,
    rows,
    orientation = 'landscape',
    minPrintableRows = 10,
  } = params;

  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let cursorY = 14;

  // 1. Official 3-Column Header Box
  const col1W = orientation === 'landscape' ? 42 : 30;
  const col3W = orientation === 'landscape' ? 92 : 66;
  const col2W = contentWidth - col1W - col3W;
  const rowH = 8.5;
  const headerTotalH = rowH * 3;

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);

  // Outer & inner boxes
  doc.rect(marginX, cursorY, col1W, headerTotalH, 'S');
  doc.rect(marginX + col1W, cursorY, col2W, rowH, 'S');
  doc.rect(marginX + col1W, cursorY + rowH, col2W, rowH, 'S');
  doc.rect(marginX + col1W, cursorY + rowH * 2, col2W, rowH, 'S');
  doc.rect(marginX + col1W + col2W, cursorY, col3W, rowH, 'S');
  doc.rect(marginX + col1W + col2W, cursorY + rowH, col3W, rowH, 'S');
  doc.rect(marginX + col1W + col2W, cursorY + rowH * 2, col3W, rowH, 'S');

  // Logo in col1
  const logoCenterX = marginX + col1W / 2;
  if (config.logoDataUrl) {
    try {
      const imgSize = 15;
      doc.addImage(
        config.logoDataUrl,
        logoCenterX - imgSize / 2,
        cursorY + 2,
        imgSize,
        imgSize
      );
    } catch {
      doc.setDrawColor(70, 95, 130);
      doc.circle(logoCenterX, cursorY + 10, 6.5, 'S');
    }
  } else {
    doc.setDrawColor(70, 95, 130);
    doc.setLineWidth(0.5);
    doc.circle(logoCenterX, cursorY + 10, 6.5, 'S');
    doc.setLineWidth(0.25);
    doc.circle(logoCenterX, cursorY + 10, 4.7, 'S');
  }
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.text(config.logoCaption || 'Badan Gizi Nasional', logoCenterX, cursorY + 22.5, {
    align: 'center',
    maxWidth: col1W - 3,
  });

  // Middle column text
  const midCenterX = marginX + col1W + col2W / 2;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(40, 40, 40);
  doc.text(config.unitName || '-', midCenterX, cursorY + 5.8, {
    align: 'center',
    maxWidth: col2W - 4,
  });
  doc.text(config.formLabel || 'FORM', midCenterX, cursorY + rowH + 5.8, {
    align: 'center',
  });
  doc.text(config.formTitle || 'SAMPEL PERTINGGAL', midCenterX, cursorY + rowH * 2 + 5.8, {
    align: 'center',
  });

  // Right column metadata
  const rightLabelX = marginX + col1W + col2W + 3;
  const rightColonX = rightLabelX + (orientation === 'landscape' ? 30 : 25);
  const rightValX = rightColonX + 3.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  const rightMeta: Array<[string, string]> = [
    ['No. Dokumen', config.docNumber || '-'],
    ['Revisi', config.revision || '-'],
    ['Tanggal Berlaku', config.effectiveDate || '-'],
  ];
  rightMeta.forEach(([k, v], idx) => {
    const ty = cursorY + idx * rowH + 5.6;
    doc.text(k, rightLabelX, ty);
    doc.text(':', rightColonX, ty);
    doc.text(v, rightValX, ty, { maxWidth: col3W - (rightValX - (marginX + col1W + col2W)) - 2 });
  });

  cursorY += headerTotalH + 7;

  // 2. Bulan & Tahun Row
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Bulan: ${config.bulanLabel || '-'}`, marginX + 2, cursorY);
  doc.text(`Tahun: ${config.tahunLabel || '-'}`, marginX + (orientation === 'landscape' ? 76 : 54), cursorY);
  cursorY += 5.5;

  // 3. Main Sample Table
  const labels = config.colLabels || DEFAULT_SAMPLE_COLUMN_LABELS;
  const sortedRows = [...rows].sort((a, b) => a.rowOrder - b.rowOrder);
  const totalRowCount = Math.max(sortedRows.length, minPrintableRows);

  const bodyData: string[][] = [];
  for (let i = 0; i < totalRowCount; i++) {
    const r = sortedRows[i];
    if (r) {
      bodyData.push([
        r.kodeIdentitas || '',
        r.jumlahSampel || '',
        r.kondisiOk || '',
        r.kondisiNok || '',
        r.penanggungJawab || '',
        r.masukTanggal || '',
        r.masukJam || '',
        r.keluarTanggal || '',
        r.keluarJam || '',
      ]);
    } else {
      bodyData.push(['', '', '', '', '', '', '', '', '']);
    }
  }

  const grayBg: [number, number, number] = [217, 217, 217];
  const colWidths =
    orientation === 'landscape'
      ? { kode: 36, jml: 26, ok: 16, nok: 16, pj: 66, tgl: 44, jam: 27 }
      : { kode: 24, jml: 18, ok: 11, nok: 11, pj: 41, tgl: 26, jam: 16 };

  let finalTableY = cursorY;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX, top: 12, bottom: 16 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: orientation === 'landscape' ? 8.8 : 7.3,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.28,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 6.8,
      cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
    },
    headStyles: {
      fillColor: grayBg,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    head: [
      [
        { content: labels.kodeIdentitas, rowSpan: 2 },
        { content: labels.jumlahSampel, rowSpan: 2 },
        { content: labels.kondisiSampel, colSpan: 2 },
        { content: labels.penanggungJawab, rowSpan: 2 },
        { content: labels.masukChiler, colSpan: 2 },
        { content: labels.keluarChiler, colSpan: 2 },
      ],
      [
        { content: labels.ok },
        { content: labels.nok },
        { content: labels.tanggal },
        { content: labels.jam },
        { content: labels.tanggal },
        { content: labels.jam },
      ],
    ],
    body: bodyData,
    columnStyles: {
      0: { cellWidth: colWidths.kode },
      1: { cellWidth: colWidths.jml },
      2: { cellWidth: colWidths.ok },
      3: { cellWidth: colWidths.nok },
      4: { cellWidth: colWidths.pj },
      5: { cellWidth: colWidths.tgl },
      6: { cellWidth: colWidths.jam },
      7: { cellWidth: colWidths.tgl },
      8: { cellWidth: colWidths.jam },
    },
    didDrawPage: () => {
      // Track final table height on last page
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalTableY = (doc as any).lastAutoTable?.finalY || cursorY + 60;

  // 4. Signature Block below the right half of table
  const pageHeight = doc.internal.pageSize.getHeight();
  let sigY = finalTableY + 11;
  if (sigY + 30 > pageHeight - 10) {
    doc.addPage();
    sigY = 20;
  }

  const sigCenterX = marginX + contentWidth * 0.72;
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(config.verifierLine1 || 'Diverifikasi Oleh,', sigCenterX, sigY, { align: 'center' });
  doc.text(config.verifierLine2 || 'Pengawas Gizi', sigCenterX, sigY + 5, { align: 'center' });
  doc.text(config.verifierName || '', sigCenterX, sigY + 24, { align: 'center' });

  const safeMonth = (config.bulanLabel || 'BULAN').replace(/[^a-zA-Z0-9]+/g, '_');
  const safeYear = (config.tahunLabel || '2026').replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`FORM_SAMPEL_PERTINGGAL_${safeMonth}_${safeYear}.pdf`);
}

export function exportTemperatureMonitoringToF4Pdf(params: {
  config: TempFormConfig;
  sheets: Array<{
    room: TempMonitoringRoom;
    readings: TempDayReading[];
  }>;
  allRoomsForSop?: TempMonitoringRoom[];
  orientation?: PdfOrientation;
}): void {
  const { config, sheets, allRoomsForSop, orientation = 'landscape' } = params;
  if (sheets.length === 0) return;

  // F4 Landscape (330x215mm) is optimal for 33-column monitoring sheets
  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = orientation === 'landscape' ? 8 : 6;
  const contentWidth = pageWidth - marginX * 2;
  const labels = {
    ...DEFAULT_TEMP_TABLE_LABELS,
    ...(config.tableLabels || {}),
  };

  sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) {
      doc.addPage();
    }

    let cursorY = 8;
    const { room, readings } = sheet;

    // 1. Official 3-Column Kop Header
    const col1W = orientation === 'landscape' ? 34 : 26;
    const col3W = orientation === 'landscape' ? 76 : 54;
    const col2W = contentWidth - col1W - col3W;
    const rowH = 6.8;
    const headerTotalH = rowH * 3;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.28);

    doc.rect(marginX, cursorY, col1W, headerTotalH, 'S');
    doc.rect(marginX + col1W, cursorY, col2W, rowH, 'S');
    doc.rect(marginX + col1W, cursorY + rowH, col2W, rowH, 'S');
    doc.rect(marginX + col1W, cursorY + rowH * 2, col2W, rowH, 'S');
    doc.rect(marginX + col1W + col2W, cursorY, col3W, rowH, 'S');
    doc.rect(marginX + col1W + col2W, cursorY + rowH, col3W, rowH, 'S');
    doc.rect(marginX + col1W + col2W, cursorY + rowH * 2, col3W, rowH, 'S');

    // Logo col1
    const logoCenterX = marginX + col1W / 2;
    if (config.logoDataUrl) {
      try {
        const imgSize = 12;
        doc.addImage(
          config.logoDataUrl,
          logoCenterX - imgSize / 2,
          cursorY + 1.5,
          imgSize,
          imgSize
        );
      } catch {
        doc.setDrawColor(40, 60, 90);
        doc.circle(logoCenterX, cursorY + 7.5, 5.2, 'S');
      }
    } else {
      doc.setDrawColor(40, 60, 90);
      doc.setLineWidth(0.45);
      doc.circle(logoCenterX, cursorY + 7.5, 5.2, 'S');
      doc.setLineWidth(0.22);
      doc.circle(logoCenterX, cursorY + 7.5, 3.8, 'S');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(0, 0, 0);
    doc.text(config.logoCaption || 'Badan Gizi Nasional', logoCenterX, cursorY + 17.8, {
      align: 'center',
      maxWidth: col1W - 2,
    });

    // Middle col2
    const midCenterX = marginX + col1W + col2W / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(orientation === 'landscape' ? 9.5 : 8.2);
    doc.text((config.unitName || 'SPPG').toUpperCase(), midCenterX, cursorY + 4.7, {
      align: 'center',
      maxWidth: col2W - 4,
    });
    doc.text(config.formLabel || 'FORM', midCenterX, cursorY + rowH + 4.7, {
      align: 'center',
    });
    doc.setFontSize(orientation === 'landscape' ? 9.0 : 7.6);
    doc.text(
      (config.formTitle || 'MONITORING SUHU & KELEMBAPAN RUANGAN').toUpperCase(),
      midCenterX,
      cursorY + rowH * 2 + 4.7,
      { align: 'center', maxWidth: col2W - 4 }
    );

    // Right col3
    const rightLabelX = marginX + col1W + col2W + 2.5;
    const rightColonX = rightLabelX + (orientation === 'landscape' ? 24 : 18);
    const rightValX = rightColonX + 2.5;
    doc.setFontSize(orientation === 'landscape' ? 7.8 : 6.8);
    const metaPairs: Array<[string, string]> = [
      ['No. Dokumen', config.docNumber || 'FR/PK/23'],
      ['Revisi', config.revision || '00'],
      ['Tanggal Berlaku', config.effectiveDate || '-'],
    ];
    metaPairs.forEach(([k, v], idx) => {
      const ty = cursorY + idx * rowH + 4.5;
      doc.setFont('helvetica', 'bold');
      doc.text(k, rightLabelX, ty);
      doc.text(':', rightColonX, ty);
      doc.setFont('helvetica', 'normal');
      doc.text(v, rightValX, ty, {
        maxWidth: col3W - (rightValX - (marginX + col1W + col2W)) - 1.5,
      });
    });

    cursorY += headerTotalH + 4;

    // 2. Periode & Lokasi
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Periode', marginX + 1, cursorY);
    doc.text(':', marginX + 15, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(config.periodeLabel || '-', marginX + 18, cursorY);

    cursorY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.text('Lokasi', marginX + 1, cursorY);
    doc.text(':', marginX + 15, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(room.roomName || '-', marginX + 18, cursorY);

    cursorY += 3;

    // 3. 33-Column Daily Monitoring Grid (1..31)
    const dayMap: Record<number, TempDayReading> = {};
    readings.forEach((r) => {
      dayMap[r.day] = r;
    });

    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const numColW = orientation === 'landscape' ? 5.5 : 4.2;
    const labelColW = orientation === 'landscape' ? 24 : 18;
    const dayColW = (contentWidth - numColW - labelColW) / 31;

    const iceBlue: [number, number, number] = [221, 235, 247];

    const colStyles: Record<number, { cellWidth: number; halign?: 'center' | 'left' | 'right' }> = {
      0: { cellWidth: numColW, halign: 'center' },
      1: { cellWidth: labelColW, halign: 'center' },
    };
    days.forEach((d) => {
      colStyles[d + 1] = { cellWidth: dayColW, halign: 'center' };
    });

    const bodyRows: unknown[][] = [
      [
        {
          content: labels.jam,
          colSpan: 2,
          styles: { halign: 'right', fontStyle: 'bold', minCellHeight: 6 },
        },
        ...days.map((d) => dayMap[d]?.jam || ''),
      ],
      [
        { content: '1', styles: { halign: 'center', minCellHeight: 11 } },
        { content: labels.suhu, styles: { halign: 'center', minCellHeight: 11 } },
        ...days.map((d) => dayMap[d]?.suhu || ''),
      ],
      [
        { content: '2', styles: { halign: 'center', minCellHeight: 11 } },
        { content: labels.rh, styles: { halign: 'center', minCellHeight: 11 } },
        ...days.map((d) => dayMap[d]?.rh || ''),
      ],
      [
        {
          content: labels.paraf,
          colSpan: 2,
          styles: { halign: 'center', fontStyle: 'bold', minCellHeight: 9 },
        },
        ...days.map((d) => dayMap[d]?.paraf || ''),
      ],
      [
        {
          content: labels.namaPetugas,
          colSpan: 2,
          styles: { halign: 'center', fontStyle: 'bold', minCellHeight: 11 },
        },
        ...days.map((d) => ({
          content: dayMap[d]?.namaPetugas || '',
          styles: { fontSize: orientation === 'landscape' ? 5.2 : 4.2 },
        })),
      ],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, top: 8, bottom: 10 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 6.4 : 4.8,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22,
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: 0.8, right: 0.5, bottom: 0.8, left: 0.5 },
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: iceBlue,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      head: [
        [
          { content: labels.kegiatan, colSpan: 2, rowSpan: 2 },
          { content: labels.tanggal, colSpan: 31 },
        ],
        days.map((d) => String(d)),
      ],
      body: bodyRows as never[],
      columnStyles: colStyles as never,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let afterGridY = ((doc as any).lastAutoTable?.finalY || cursorY + 60) + 5;

    // 4. Standar Suhu Berdasarkan SOP BGN Pusat Table Below
    const sopRoomsSource = allRoomsForSop && allRoomsForSop.length > 0 ? allRoomsForSop : [room];
    const existingNames = new Set(sopRoomsSource.map((r) => r.roomName.trim().toLowerCase()));
    const sopBody: string[][] = [
      ...sopRoomsSource.map((r, i) => [
        String(i + 1),
        r.roomName + (r.id === room.id ? ' (Lokasi Aktif)' : ''),
        r.standardSuhu,
        r.standardRh,
        r.sopNote,
      ]),
      ...SOP_BGN_ROOM_PRESETS.filter((p) => !existingNames.has(p.label.toLowerCase())).map(
        (p, idx) => [
          String(sopRoomsSource.length + idx + 1),
          p.label,
          p.standardSuhu,
          p.standardRh,
          p.sopNote,
        ]
      ),
    ];

    if (afterGridY + 35 > pageHeight - 10) {
      doc.addPage();
      afterGridY = 12;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(
      (config.sopTitle || 'STANDAR SUHU & KELEMBAPAN RUANGAN BERDASARKAN SOP BGN PUSAT').toUpperCase(),
      marginX,
      afterGridY
    );
    afterGridY += 3.5;

    autoTable(doc, {
      startY: afterGridY,
      margin: { left: marginX, right: marginX, top: 8, bottom: 10 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 6.8 : 6.0,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        valign: 'middle',
        cellPadding: { top: 1.0, right: 1.8, bottom: 1.0, left: 1.8 },
      },
      headStyles: {
        fillColor: iceBlue,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.22,
      },
      head: [
        ['No', 'Lokasi / Ruangan', 'Standar Suhu (°C) — SOP BGN Pusat', 'Standar RH (%)', 'Keterangan SOP'],
      ],
      body: sopBody,
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: orientation === 'landscape' ? 48 : 34, halign: 'left' },
        2: { cellWidth: orientation === 'landscape' ? 76 : 52, halign: 'left' },
        3: { cellWidth: orientation === 'landscape' ? 32 : 24, halign: 'center' },
        4: { cellWidth: 'auto', halign: 'left' },
      },
    });
  });

  const safeLokasi =
    sheets.length === 1
      ? sheets[0].room.roomName.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()
      : 'SEMUA_RUANGAN';
  const safePeriode = (config.periodeLabel || 'BULAN').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  doc.save(`MONITORING_SUHU_${safeLokasi}_${safePeriode}.pdf`);
}

export function exportFreezerChillerToF4Pdf(params: {
  config: FreezerFormConfig;
  sheets: Array<{
    machine: FreezerMachine;
    rows: FreezerLogRow[];
  }>;
  orientation?: PdfOrientation;
}): void {
  const { config, sheets, orientation = 'landscape' } = params;
  if (sheets.length === 0) return;

  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = orientation === 'landscape' ? 12 : 8;
  const contentWidth = pageWidth - marginX * 2;
  const labels = {
    ...DEFAULT_FREEZER_COL_LABELS,
    ...(config.colLabels || {}),
  };

  sheets.forEach((sheet, sheetIdx) => {
    if (sheetIdx > 0) {
      doc.addPage();
    }

    const { machine, rows } = sheet;
    let cursorY = 10;

    // 1. Official 3-Column Kop Header
    const col1W = orientation === 'landscape' ? 40 : 28;
    const col3W = orientation === 'landscape' ? 86 : 58;
    const col2W = contentWidth - col1W - col3W;
    const rowH = 7.4;
    const headerTotalH = rowH * 3;

    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.28);

    doc.rect(marginX, cursorY, col1W, headerTotalH, 'S');
    doc.rect(marginX + col1W, cursorY, col2W, rowH, 'S');
    doc.rect(marginX + col1W, cursorY + rowH, col2W, rowH, 'S');
    doc.rect(marginX + col1W, cursorY + rowH * 2, col2W, rowH, 'S');
    doc.rect(marginX + col1W + col2W, cursorY, col3W, rowH, 'S');
    doc.rect(marginX + col1W + col2W, cursorY + rowH, col3W, rowH, 'S');
    doc.rect(marginX + col1W + col2W, cursorY + rowH * 2, col3W, rowH, 'S');

    // Logo col1
    const logoCenterX = marginX + col1W / 2;
    if (config.logoDataUrl) {
      try {
        const imgSize = 13;
        doc.addImage(
          config.logoDataUrl,
          logoCenterX - imgSize / 2,
          cursorY + 1.8,
          imgSize,
          imgSize
        );
      } catch {
        doc.setDrawColor(70, 95, 130);
        doc.circle(logoCenterX, cursorY + 8.5, 5.8, 'S');
      }
    } else {
      doc.setDrawColor(70, 95, 130);
      doc.setLineWidth(0.45);
      doc.circle(logoCenterX, cursorY + 8.5, 5.8, 'S');
      doc.setLineWidth(0.22);
      doc.circle(logoCenterX, cursorY + 8.5, 4.2, 'S');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(60, 60, 60);
    doc.text(config.logoCaption || 'Badan Gizi Nasional', logoCenterX, cursorY + 19.5, {
      align: 'center',
      maxWidth: col1W - 2,
    });

    // Middle col2
    const midCenterX = marginX + col1W + col2W / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(orientation === 'landscape' ? 10 : 8.5);
    doc.setTextColor(70, 70, 70);
    doc.text(config.unitName || '-', midCenterX, cursorY + 5.2, {
      align: 'center',
      maxWidth: col2W - 4,
    });
    doc.text(config.formLabel || 'FORM', midCenterX, cursorY + rowH + 5.2, {
      align: 'center',
    });
    doc.setFontSize(orientation === 'landscape' ? 9.5 : 7.8);
    doc.text(
      (config.formTitle || 'PENCATATAN SUHU FREEZER & CHILLER').toUpperCase(),
      midCenterX,
      cursorY + rowH * 2 + 5.2,
      { align: 'center', maxWidth: col2W - 4 }
    );

    // Right col3
    const rightLabelX = marginX + col1W + col2W + 3;
    const rightColonX = rightLabelX + (orientation === 'landscape' ? 28 : 20);
    const rightValX = rightColonX + 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(orientation === 'landscape' ? 8.2 : 7.0);
    const metaPairs: Array<[string, string]> = [
      ['No. Dokumen', config.docNumber || 'FR/JM/06'],
      ['Revisi', config.revision || '00'],
      ['Tanggal Berlaku', config.effectiveDate || '-'],
    ];
    metaPairs.forEach(([k, v], idx) => {
      const ty = cursorY + idx * rowH + 5.0;
      doc.text(k, rightLabelX, ty);
      doc.text(':', rightColonX, ty);
      doc.text(v, rightValX, ty, {
        maxWidth: col3W - (rightValX - (marginX + col1W + col2W)) - 2,
      });
    });

    cursorY += headerTotalH + 4.5;

    // 2. Machine Identity Table (Nama Mesin, Merk, No. Mesin, Lokasi, Periode, Standar Suhu BGN)
    const metaRows = [
      [labels.namaMesin, ':', `${machine.namaMesin} (${machine.machineType === 'freezer' ? 'Freezer' : 'Chiller'})`],
      [labels.merk, ':', machine.merk || '-'],
      [labels.noMesin, ':', machine.noMesin || '-'],
      [labels.lokasi, ':', machine.lokasi || '-'],
      [labels.periode, ':', config.periodeLabel || '-'],
      ['Standar Suhu Normal BGN', ':', machine.normalSuhuBgn],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 8.2 : 7.2,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: { top: 1.0, right: 2, bottom: 1.0, left: 2 },
      },
      body: metaRows,
      columnStyles: {
        0: { cellWidth: orientation === 'landscape' ? 52 : 38 },
        1: { cellWidth: 5, halign: 'center' },
        2: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.row.index === 5) {
          data.cell.styles.fillColor = [232, 244, 252];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 30) + 4.5;

    // 3. 12-Column Gray Header Log Table + Conclusion Footer Row
    const sortedRows = [...rows].sort((a, b) => a.rowOrder - b.rowOrder);
    const bodyData: unknown[][] = sortedRows.map((r) => [
      r.noLabel || '',
      r.tanggal || '',
      r.jamCek1 || '',
      r.suhu1 || '',
      r.pic1 || '',
      r.jamCek2 || '',
      r.suhu2 || '',
      r.pic2 || '',
      r.jamCek3 || '',
      r.suhu3 || '',
      r.pic3 || '',
      r.keterangan || '',
    ]);

    // Append merged Conclusion Footer Row matching image_8ee12d59.png
    const conclusionText = `${machine.conclusionHeader}\n${machine.repairPrompt}\n${machine.repairNote}`;
    bodyData.push([
      {
        content: conclusionText,
        colSpan: 12,
        styles: {
          halign: 'left',
          fontStyle: 'bold',
          minCellHeight: 14,
          cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
        },
      },
    ]);

    const grayBg: [number, number, number] = [191, 191, 191];
    const colWidths =
      orientation === 'landscape'
        ? {
            no: 11,
            tgl: 28,
            jam: 20,
            suhu: 18,
            pic: 22,
            ket: 87,
          }
        : {
            no: 8,
            tgl: 20,
            jam: 13,
            suhu: 12,
            pic: 14,
            ket: 54,
          };

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, top: 10, bottom: 14 },
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 8.0 : 6.4,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        halign: 'center',
        valign: 'middle',
        minCellHeight: 6.2,
        cellPadding: { top: 1.2, right: 1.5, bottom: 1.2, left: 1.5 },
      },
      headStyles: {
        fillColor: grayBg,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.28,
      },
      head: [
        [
          labels.no,
          labels.tanggal,
          labels.jamCek1,
          labels.suhu1,
          labels.pic1,
          labels.jamCek2,
          labels.suhu2,
          labels.pic2,
          labels.jamCek3,
          labels.suhu3,
          labels.pic3,
          labels.keterangan,
        ],
      ],
      body: bodyData as never[],
      columnStyles: {
        0: { cellWidth: colWidths.no },
        1: { cellWidth: colWidths.tgl },
        2: { cellWidth: colWidths.jam },
        3: { cellWidth: colWidths.suhu },
        4: { cellWidth: colWidths.pic },
        5: { cellWidth: colWidths.jam },
        6: { cellWidth: colWidths.suhu },
        7: { cellWidth: colWidths.pic },
        8: { cellWidth: colWidths.jam },
        9: { cellWidth: colWidths.suhu },
        10: { cellWidth: colWidths.pic },
        11: { cellWidth: colWidths.ket, halign: 'left' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let afterTableY = ((doc as any).lastAutoTable?.finalY || cursorY + 50) + 5;
    if (afterTableY + 26 > pageHeight - 10) {
      doc.addPage();
      afterTableY = 12;
    }

    // 4. Lampiran Standar Suhu Normal Freezer & Chiller Sesuai SOP BGN Pusat
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(
      'LAMPIRAN STANDAR SUHU NORMAL FREEZER & CHILLER SESUAI SOP BGN PUSAT',
      marginX,
      afterTableY
    );
    afterTableY += 3;

    autoTable(doc, {
      startY: afterTableY,
      margin: { left: marginX, right: marginX, top: 10, bottom: 10 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 7.2 : 6.2,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22,
        valign: 'middle',
        cellPadding: { top: 1.2, right: 2, bottom: 1.2, left: 2 },
      },
      headStyles: {
        fillColor: [221, 235, 247],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.24,
      },
      head: [['Jenis / Unit', 'Suhu Normal BGN (°C)', 'Ketentuan SOP BGN Pusat']],
      body: [
        [
          `Freezer${machine.machineType === 'freezer' ? ` (${machine.namaMesin})` : ''}`,
          machine.machineType === 'freezer'
            ? machine.normalSuhuBgn
            : BGN_FREEZER_CHILLER_DEFAULTS.freezer.normalSuhuBgn,
          machine.machineType === 'freezer'
            ? machine.bgnSopNote
            : BGN_FREEZER_CHILLER_DEFAULTS.freezer.bgnSopNote,
        ],
        [
          `Chiller${machine.machineType === 'chiller' ? ` (${machine.namaMesin})` : ''}`,
          machine.machineType === 'chiller'
            ? machine.normalSuhuBgn
            : BGN_FREEZER_CHILLER_DEFAULTS.chiller.normalSuhuBgn,
          machine.machineType === 'chiller'
            ? machine.bgnSopNote
            : BGN_FREEZER_CHILLER_DEFAULTS.chiller.bgnSopNote,
        ],
      ],
      columnStyles: {
        0: { cellWidth: orientation === 'landscape' ? 56 : 38 },
        1: { cellWidth: orientation === 'landscape' ? 68 : 48 },
        2: { cellWidth: 'auto' },
      },
    });
  });

  const safeUnit =
    sheets.length === 1
      ? sheets[0].machine.namaMesin.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()
      : 'SEMUA_LAMPIRAN';
  const safePeriode = (config.periodeLabel || 'BULAN').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  doc.save(`PENCATATAN_SUHU_FREEZER_CHILLER_${safeUnit}_${safePeriode}.pdf`);
}
