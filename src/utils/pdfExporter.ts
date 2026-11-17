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
  FoodTempDayBlock,
  FoodTempFormConfig,
  FoodTempSheetType,
  DailyPmRecord,
  FoodCostDayPlan,
  MasterMenuPlan,
  RawMaterialRecapDayConfig,
} from '../types';
import {
  BGN_FREEZER_CHILLER_DEFAULTS,
  SOP_BGN_ROOM_PRESETS,
} from '../constants/temperatureStandards';
import {
  DEFAULT_FOOD_TEMP_COL_LABELS,
  DEFAULT_FREEZER_COL_LABELS,
  DEFAULT_SAMPLE_COLUMN_LABELS,
  DEFAULT_TEMP_TABLE_LABELS,
} from '../services/sppgService';
import {
  formatIndonesianFullDate,
  getDaysInMonth,
  getPeriodeLabel,
  getTodayIso,
  parseMonthKey,
} from './dateUtils';
import {
  computeFoodCostWorksheet,
  computePmSummary,
  computeRawMaterialRecap,
} from './foodCostCalculator';
import { resolveDocumentLogos } from './logoResolver';
import { DEFAULT_MASTER_MENU_ROW_LABELS } from './masterMenuHelper';

function drawScaledLogo(
  doc: jsPDF,
  dataUrl: string | undefined,
  centerX: number,
  centerY: number,
  targetWidthMm: number,
  maxHeightMm: number
): boolean {
  if (!dataUrl) return false;
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = props && props.width > 0 ? props.height / props.width : 1;
    let drawW = Math.max(6, targetWidthMm);
    let drawH = drawW * ratio;
    if (drawH > maxHeightMm) {
      drawH = maxHeightMm;
      drawW = ratio > 0 ? drawH / ratio : targetWidthMm;
    }
    doc.addImage(dataUrl, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
    return true;
  } catch {
    return false;
  }
}

function drawOptionalBannerKopHeader(params: {
  doc: jsPDF;
  marginX: number;
  cursorY: number;
  contentWidth: number;
  namaSppg: string;
  leftUrl?: string;
  leftWidthMm: number;
  rightUrl?: string;
  rightWidthMm: number;
}): number {
  const { doc, marginX, cursorY, contentWidth, namaSppg, leftUrl, leftWidthMm, rightUrl, rightWidthMm } = params;
  if (!leftUrl && !rightUrl) return cursorY;

  const kopH = 19;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(marginX, cursorY, contentWidth, kopH, 'FD');

  const maxSlotW = 32;
  const effLeftW = Math.min(maxSlotW, Math.max(7, leftWidthMm));
  const effRightW = Math.min(maxSlotW, Math.max(7, rightWidthMm));

  if (leftUrl) {
    drawScaledLogo(doc, leftUrl, marginX + 2.5 + effLeftW / 2, cursorY + kopH / 2, effLeftW, kopH - 3);
  }
  if (rightUrl) {
    drawScaledLogo(
      doc,
      rightUrl,
      marginX + contentWidth - 2.5 - effRightW / 2,
      cursorY + kopH / 2,
      effRightW,
      kopH - 3
    );
  }

  const centerX = marginX + contentWidth / 2;
  const sidePad = Math.max(leftUrl ? effLeftW : 0, rightUrl ? effRightW : 0) + 8;
  const maxW = Math.max(60, contentWidth - sidePad * 2);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9.5);
  doc.text('BADAN GIZI NASIONAL', centerX, cursorY + 5.8, { align: 'center', maxWidth: maxW });
  doc.setFontSize(9.0);
  doc.text('SATUAN PELAYANAN PEMENUHAN GIZI', centerX, cursorY + 10.5, {
    align: 'center',
    maxWidth: maxW,
  });
  doc.setFontSize(8.8);
  doc.text((namaSppg || 'SPPG').toUpperCase(), centerX, cursorY + 15.2, {
    align: 'center',
    maxWidth: maxW,
  });

  return cursorY + kopH;
}

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

  const rekapanLogos = resolveDocumentLogos(profile, 'rekapan');
  cursorY = drawOptionalBannerKopHeader({
    doc,
    marginX,
    cursorY,
    contentWidth,
    namaSppg: profile.namaSppg || 'SPPG',
    leftUrl: rekapanLogos.leftUrl,
    leftWidthMm: rekapanLogos.leftWidthMm,
    rightUrl: rekapanLogos.rightUrl,
    rightWidthMm: rekapanLogos.rightWidthMm,
  });

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

  cursorY += metaBoxHeight + 3;

  // 2B. Front-Page Executive Summary (Ringkasan Eksekutif Halaman Depan)
  const totalMenus = sortedEntries.length;
  const photoReadyCount = sortedEntries.filter(
    (e) => Boolean(e.photoDataUrl && e.photoDataUrl.length > 0)
  ).length;
  const missingPhotoCount = Math.max(0, totalMenus - photoReadyCount);
  const photoPct = totalMenus > 0 ? Math.round((photoReadyCount / totalMenus) * 100) : 0;
  const daysInMonth = getDaysInMonth(year, month);
  const calendarCoveragePct =
    daysInMonth > 0 ? Math.min(100, Math.round((totalMenus / daysInMonth) * 100)) : 0;
  const nutritionFilledCount = sortedEntries.filter(
    (e) => e.nutritionByCategory && Object.keys(e.nutritionByCategory).length > 0
  ).length;
  const giziPct = totalMenus > 0 ? Math.round((nutritionFilledCount / totalMenus) * 100) : 0;

  const execHeaderH = 5.4;
  const execBodyH = 13.5;

  // Executive header strip
  doc.setFillColor(232, 245, 233);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.28);
  doc.rect(marginX, cursorY, contentWidth, execHeaderH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(6, 78, 59);
  doc.text('RINGKASAN EKSEKUTIF — DOKUMENTASI MENU HARIAN', marginX + 2.5, cursorY + 3.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(51, 65, 85);
  doc.text(`Dicetak: ${formatIndonesianFullDate(getTodayIso())}`, pageWidth - marginX - 2.5, cursorY + 3.8, {
    align: 'right',
  });
  cursorY += execHeaderH;

  // 4-column executive summary KPI strip
  const kpiColW = contentWidth / 4;
  const execCards: Array<{ label: string; value: string; sub: string }> = [
    {
      label: 'TOTAL MENU TERCATAT',
      value: `${totalMenus} Menu / Hari`,
      sub: `${calendarCoveragePct}% dari ${daysInMonth} hari kalender`,
    },
    {
      label: 'DOKUMENTASI FOTO (3:2)',
      value: `${photoReadyCount} / ${totalMenus} (${photoPct}%)`,
      sub:
        totalMenus === 0
          ? 'Belum ada entri menu'
          : missingPhotoCount === 0
          ? 'Seluruh hari sudah berfoto'
          : `${missingPhotoCount} hari belum ada foto`,
    },
    {
      label: 'KELENGKAPAN NILAI GIZI',
      value: `${nutritionFilledCount} / ${totalMenus} (${giziPct}%)`,
      sub: 'Menu terisi di rekap nilai gizi',
    },
    {
      label: 'PERIODE LAPORAN',
      value: periodeText,
      sub: `${profile.idSppg || 'SPPG'} · F4 ${orientation === 'landscape' ? 'Landscape' : 'Portrait'}`,
    },
  ];

  execCards.forEach((card, idx) => {
    const cx = marginX + idx * kpiColW;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.28);
    doc.rect(cx, cursorY, kpiColW, execBodyH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(orientation === 'landscape' ? 6.8 : 6.0);
    doc.setTextColor(71, 85, 105);
    doc.text(card.label, cx + 2.5, cursorY + 3.8, { maxWidth: kpiColW - 5 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(orientation === 'landscape' ? 10.2 : 8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, cx + 2.5, cursorY + 8.6, { maxWidth: kpiColW - 5 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(orientation === 'landscape' ? 6.8 : 5.8);
    doc.setTextColor(71, 85, 105);
    doc.text(card.sub, cx + 2.5, cursorY + 12.1, { maxWidth: kpiColW - 5 });
  });

  cursorY += execBodyH + 3.5;

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

  const giziLogos = resolveDocumentLogos(profile, 'gizi');
  cursorY = drawOptionalBannerKopHeader({
    doc,
    marginX,
    cursorY,
    contentWidth,
    namaSppg: profile.namaSppg || 'SPPG',
    leftUrl: giziLogos.leftUrl,
    leftWidthMm: giziLogos.leftWidthMm,
    rightUrl: giziLogos.rightUrl,
    rightWidthMm: giziLogos.rightWidthMm,
  });

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
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
  minPrintableRows?: number;
}): void {
  const {
    config,
    rows,
    profile,
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

  const logos = resolveDocumentLogos(profile, 'sampel', config);

  // 1. Official 3-Column (or 4-Column with Right Logo) Header Box
  const col1W = orientation === 'landscape' ? 42 : 30;
  const col4W = logos.rightUrl ? (orientation === 'landscape' ? 32 : 24) : 0;
  const col3W = orientation === 'landscape' ? 88 : 62;
  const col2W = contentWidth - col1W - col3W - col4W;
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
  if (col4W > 0) {
    doc.rect(marginX + col1W + col2W + col3W, cursorY, col4W, headerTotalH, 'S');
  }

  // Logo in col1
  const logoCenterX = marginX + col1W / 2;
  const drewLeft = drawScaledLogo(
    doc,
    logos.leftUrl,
    logoCenterX,
    cursorY + 9.5,
    Math.min(col1W - 4, logos.leftWidthMm),
    15
  );
  if (!drewLeft) {
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

  if (col4W > 0 && logos.rightUrl) {
    drawScaledLogo(
      doc,
      logos.rightUrl,
      marginX + col1W + col2W + col3W + col4W / 2,
      cursorY + headerTotalH / 2,
      Math.min(col4W - 4, logos.rightWidthMm),
      headerTotalH - 4
    );
  }

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
  const rightColonX = rightLabelX + (orientation === 'landscape' ? 28 : 23);
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
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { config, sheets, allRoomsForSop, profile, orientation = 'landscape' } = params;
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
  const logos = resolveDocumentLogos(profile, 'suhu', config);

  sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) {
      doc.addPage();
    }

    let cursorY = 8;
    const { room, readings } = sheet;

    // 1. Official 3-Column (or 4-Column with Right Logo) Kop Header
    const col1W = orientation === 'landscape' ? 36 : 27;
    const col4W = logos.rightUrl ? (orientation === 'landscape' ? 28 : 22) : 0;
    const col3W = orientation === 'landscape' ? 74 : 52;
    const col2W = contentWidth - col1W - col3W - col4W;
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
    if (col4W > 0) {
      doc.rect(marginX + col1W + col2W + col3W, cursorY, col4W, headerTotalH, 'S');
    }

    // Logo col1
    const logoCenterX = marginX + col1W / 2;
    const drewLeft = drawScaledLogo(
      doc,
      logos.leftUrl,
      logoCenterX,
      cursorY + 7.5,
      Math.min(col1W - 3, logos.leftWidthMm),
      12.5
    );
    if (!drewLeft) {
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

    if (col4W > 0 && logos.rightUrl) {
      drawScaledLogo(
        doc,
        logos.rightUrl,
        marginX + col1W + col2W + col3W + col4W / 2,
        cursorY + headerTotalH / 2,
        Math.min(col4W - 3, logos.rightWidthMm),
        headerTotalH - 3
      );
    }

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
    const rightColonX = rightLabelX + (orientation === 'landscape' ? 23 : 17);
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
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { config, sheets, profile, orientation = 'landscape' } = params;
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
  const logos = resolveDocumentLogos(profile, 'freezer', config);

  sheets.forEach((sheet, sheetIdx) => {
    if (sheetIdx > 0) {
      doc.addPage();
    }

    const { machine, rows } = sheet;
    let cursorY = 10;

    // 1. Official 3-Column (or 4-Column with Right Logo) Kop Header
    const col1W = orientation === 'landscape' ? 40 : 28;
    const col4W = logos.rightUrl ? (orientation === 'landscape' ? 30 : 22) : 0;
    const col3W = orientation === 'landscape' ? 82 : 56;
    const col2W = contentWidth - col1W - col3W - col4W;
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
    if (col4W > 0) {
      doc.rect(marginX + col1W + col2W + col3W, cursorY, col4W, headerTotalH, 'S');
    }

    // Logo col1
    const logoCenterX = marginX + col1W / 2;
    const drewLeft = drawScaledLogo(
      doc,
      logos.leftUrl,
      logoCenterX,
      cursorY + 8.3,
      Math.min(col1W - 3, logos.leftWidthMm),
      13.5
    );
    if (!drewLeft) {
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

    if (col4W > 0 && logos.rightUrl) {
      drawScaledLogo(
        doc,
        logos.rightUrl,
        marginX + col1W + col2W + col3W + col4W / 2,
        cursorY + headerTotalH / 2,
        Math.min(col4W - 3, logos.rightWidthMm),
        headerTotalH - 3
      );
    }

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
    const rightColonX = rightLabelX + (orientation === 'landscape' ? 27 : 19);
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

export function exportFoodTemperatureToF4Pdf(params: {
  config: FoodTempFormConfig;
  blocks: FoodTempDayBlock[];
  sheetsToExport: FoodTempSheetType[];
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { config, blocks, sheetsToExport, profile, orientation = 'portrait' } = params;
  if (sheetsToExport.length === 0) return;

  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = orientation === 'landscape' ? 16 : 14;
  const contentWidth = pageWidth - marginX * 2;
  const labels = {
    ...DEFAULT_FOOD_TEMP_COL_LABELS,
    ...(config.colLabels || {}),
  };
  const logos = resolveDocumentLogos(profile, 'makanan', config);

  sheetsToExport.forEach((sheetType, sheetIdx) => {
    if (sheetIdx > 0) {
      doc.addPage();
    }

    let cursorY = 12;

    // 1. Official Dual-Logo Kop Surat matching image_019d0cdc.png
    const fallbackSize = orientation === 'landscape' ? 18 : 16;
    const leftLogoW = logos.leftUrl ? Math.min(34, logos.leftWidthMm) : fallbackSize;
    const rightLogoW = logos.rightUrl ? Math.min(34, logos.rightWidthMm) : fallbackSize;
    const maxLogoH = 19;
    const leftLogoX = marginX + 2;
    const rightLogoX = pageWidth - marginX - rightLogoW - 2;
    const logoMidY = cursorY + 9;

    // Left Logo (BGN Emblem)
    const drewLeft = drawScaledLogo(doc, logos.leftUrl, leftLogoX + leftLogoW / 2, logoMidY, leftLogoW, maxLogoH);
    if (!drewLeft) {
      const cx = leftLogoX + leftLogoW / 2;
      const cy = logoMidY;
      doc.setDrawColor(30, 64, 120);
      doc.setLineWidth(0.6);
      doc.circle(cx, cy, fallbackSize * 0.44, 'S');
      doc.setLineWidth(0.25);
      doc.circle(cx, cy, fallbackSize * 0.32, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(30, 64, 120);
      doc.text('BGN', cx, cy + 1.5, { align: 'center' });
    }

    // Right Logo (SPPG / BGN Green Emblem)
    const drewRight = drawScaledLogo(doc, logos.rightUrl, rightLogoX + rightLogoW / 2, logoMidY, rightLogoW, maxLogoH);
    if (!drewRight) {
      const cx = rightLogoX + rightLogoW / 2;
      const cy = logoMidY;
      doc.setDrawColor(22, 101, 52);
      doc.setLineWidth(0.6);
      doc.circle(cx, cy, fallbackSize * 0.44, 'S');
      doc.setLineWidth(0.25);
      doc.circle(cx, cy, fallbackSize * 0.32, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.2);
      doc.setTextColor(22, 101, 52);
      doc.text('SPPG', cx, cy + 1.5, { align: 'center' });
    }

    // Center Kop Lines
    const kopCenterX = pageWidth / 2;
    const kopMaxW = contentWidth - Math.max(leftLogoW, rightLogoW) * 2 - 12;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(orientation === 'landscape' ? 11.5 : 10.2);
    doc.text((config.headerLine1 || 'BADAN GIZI NASIONAL').toUpperCase(), kopCenterX, cursorY + 4.0, {
      align: 'center',
      maxWidth: kopMaxW,
    });
    doc.setFontSize(orientation === 'landscape' ? 11.0 : 9.8);
    doc.text(
      (config.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI').toUpperCase(),
      kopCenterX,
      cursorY + 8.6,
      { align: 'center', maxWidth: kopMaxW }
    );
    doc.setFontSize(orientation === 'landscape' ? 9.5 : 8.6);
    doc.text(
      (config.headerLine3 || '').toUpperCase(),
      kopCenterX,
      cursorY + 13.0,
      { align: 'center', maxWidth: kopMaxW }
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(orientation === 'landscape' ? 7.8 : 7.0);
    doc.setTextColor(71, 85, 105);
    doc.text(config.headerLine4 || '', kopCenterX, cursorY + 17.0, {
      align: 'center',
      maxWidth: kopMaxW,
    });

    cursorY += 20.5;

    // Double horizontal kop line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    doc.setLineWidth(0.25);
    doc.line(marginX, cursorY + 1.1, pageWidth - marginX, cursorY + 1.1);

    cursorY += 7.5;

    // 2. Centered Bold Italic Form Title
    const sheetTitle =
      sheetType === 'masak'
        ? config.titleMasak || 'LAPORAN SUHU MAKANAN MASAK'
        : config.titleOmpreng || 'LAPORAN SUHU MAKANAN MASUK OMPRENG';

    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(orientation === 'landscape' ? 10.8 : 9.8);
    doc.setTextColor(0, 0, 0);
    doc.text(sheetTitle.toUpperCase(), pageWidth / 2, cursorY, { align: 'center' });

    cursorY += 6.5;

    // 3. Bulan : ...
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Bulan : ${config.bulanLabel || '-'}`, marginX + 1, cursorY);
    cursorY += 3;

    // 4. 4-Column Table with rowSpan for Tanggal & Paraf
    const sheetBlocks = blocks
      .filter((b) => b.sheetType === sheetType)
      .sort((a, b) => a.blockOrder - b.blockOrder);

    const effectiveBlocks: FoodTempDayBlock[] =
      sheetBlocks.length > 0
        ? sheetBlocks
        : Array.from({ length: 5 }, (_, idx) => ({
            id: `empty_${idx}`,
            uid: config.uid,
            monthKey: config.monthKey,
            sheetType,
            blockOrder: idx + 1,
            tanggal: '',
            paraf: '',
            items: Array.from({ length: 5 }, () => ({ namaMakanan: '', suhu: '' })),
          }));

    const bodyRows: unknown[][] = [];
    effectiveBlocks.forEach((block) => {
      const items =
        block.items && block.items.length > 0
          ? block.items
          : [{ namaMakanan: '', suhu: '' }];
      const span = items.length;

      items.forEach((item, idx) => {
        if (idx === 0) {
          bodyRows.push([
            {
              content: block.tanggal || '',
              rowSpan: span,
              styles: { halign: 'center', valign: 'middle', fontStyle: 'bold' },
            },
            {
              content: item.namaMakanan || '',
              styles: { halign: 'left', valign: 'middle' },
            },
            {
              content: item.suhu || '',
              styles: { halign: 'center', valign: 'middle' },
            },
            {
              content: block.paraf || '',
              rowSpan: span,
              styles: { halign: 'center', valign: 'middle' },
            },
          ]);
        } else {
          bodyRows.push([
            {
              content: item.namaMakanan || '',
              styles: { halign: 'left', valign: 'middle' },
            },
            {
              content: item.suhu || '',
              styles: { halign: 'center', valign: 'middle' },
            },
          ]);
        }
      });
    });

    const grayBg: [number, number, number] = [217, 217, 217];
    const colWidths =
      orientation === 'landscape'
        ? { tgl: 52, nama: 148, suhu: 50, paraf: 48 }
        : { tgl: 35, nama: 87, suhu: 34, paraf: 31 };

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, top: 12, bottom: 14 },
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 8.8 : 8.0,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.28,
        minCellHeight: 6.8,
        cellPadding: { top: 1.4, right: 2.2, bottom: 1.4, left: 2.2 },
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: grayBg,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
        minCellHeight: 8.5,
      },
      head: [
        [
          labels.tanggal,
          labels.namaMakanan,
          labels.suhuMakanan,
          labels.paraf,
        ],
      ],
      body: bodyRows as never[],
      columnStyles: {
        0: { cellWidth: colWidths.tgl, halign: 'center' },
        1: { cellWidth: colWidths.nama, halign: 'left' },
        2: { cellWidth: colWidths.suhu, halign: 'center' },
        3: { cellWidth: colWidths.paraf, halign: 'center' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalTableY = (doc as any).lastAutoTable?.finalY || cursorY + 80;
    let sigY = finalTableY + 10;
    if (sigY + 30 > pageHeight - 10) {
      doc.addPage();
      sigY = 20;
    }

    const sigX = marginX + contentWidth * 0.62;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(config.signerLine1 || 'Pengawas Gizi', sigX, sigY);
    doc.text(config.signerLine2 || 'SPPG', sigX, sigY + 4.8);
    if (config.signerName) {
      doc.setFont('helvetica', 'bold');
      doc.text(config.signerName, sigX, sigY + 23);
    }
  });

  const safeBulan = (config.bulanLabel || 'BULAN').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  const suffix =
    sheetsToExport.length === 2
      ? 'MASAK_DAN_OMPRENG'
      : sheetsToExport[0] === 'masak'
      ? 'MAKANAN_MASAK'
      : 'MASUK_OMPRENG';
  doc.save(`LAPORAN_SUHU_${suffix}_${safeBulan}.pdf`);
}

function drawBgnStandardKopHeader(params: {
  doc: jsPDF;
  startX: number;
  startY: number;
  width: number;
  logoDataUrl?: string;
  logoLeftWidthMm?: number;
  logoRightDataUrl?: string;
  logoRightWidthMm?: number;
  line1: string;
  line2: string;
  line3: string;
  alamat: string;
}): number {
  const {
    doc,
    startX,
    startY,
    width,
    logoDataUrl,
    logoLeftWidthMm,
    logoRightDataUrl,
    logoRightWidthMm,
    line1,
    line2,
    line3,
    alamat,
  } = params;

  const maxLogoW = 34;
  const maxLogoH = 18.5;
  const leftW = Math.min(maxLogoW, Math.max(7, logoLeftWidthMm || 15));
  const rightW = Math.min(maxLogoW, Math.max(7, logoRightWidthMm || 15));
  const logoMidY = startY + 9.5;

  const drewLeft = drawScaledLogo(doc, logoDataUrl, startX + 2 + leftW / 2, logoMidY, leftW, maxLogoH);
  if (!drewLeft) {
    const cx = startX + 2 + 7.5;
    const cy = logoMidY;
    doc.setDrawColor(30, 64, 120);
    doc.setLineWidth(0.6);
    doc.circle(cx, cy, 6.4, 'S');
    doc.setLineWidth(0.25);
    doc.circle(cx, cy, 4.6, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(30, 64, 120);
    doc.text('BGN', cx, cy + 1.4, { align: 'center' });
  }

  if (logoRightDataUrl) {
    drawScaledLogo(
      doc,
      logoRightDataUrl,
      startX + width - 2 - rightW / 2,
      logoMidY,
      rightW,
      maxLogoH
    );
  }

  const sideReserve = Math.max(leftW, logoRightDataUrl ? rightW : leftW, 15);
  const centerX = startX + width / 2;
  const textMaxW = Math.max(60, width - sideReserve * 2 - 8);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text((line1 || 'BADAN GIZI NASIONAL').toUpperCase(), centerX, startY + 4.5, {
    align: 'center',
    maxWidth: textMaxW,
  });
  doc.setFontSize(10.0);
  doc.text((line2 || 'SATUAN PELAYANAN PEMENUHAN GIZI').toUpperCase(), centerX, startY + 9.0, {
    align: 'center',
    maxWidth: textMaxW,
  });
  doc.setFontSize(9.6);
  doc.text((line3 || 'SPPG').toUpperCase(), centerX, startY + 13.5, {
    align: 'center',
    maxWidth: textMaxW,
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.2);
  const alamatTxt = alamat || 'Alamat : -';
  doc.text(alamatTxt, centerX, startY + 18.0, { align: 'center', maxWidth: textMaxW });
  const textW = Math.min(textMaxW, doc.getTextWidth(alamatTxt));
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(centerX - textW / 2, startY + 18.7, centerX + textW / 2, startY + 18.7);

  return startY + 21.5;
}

function drawVerticalSideStrip(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string
): void {
  doc.setFillColor(255, 255, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, height, 'FD');

  const chars = (label || 'SPPG').replace(/\s+/g, '').split('');
  if (chars.length === 0) return;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  const step = Math.min(9.5, (height - 16) / Math.max(1, chars.length));
  const totalTxtH = step * chars.length;
  let cy = y + (height - totalTxtH) / 2 + step * 0.72;
  chars.forEach((ch) => {
    doc.text(ch, x + width / 2, cy, { align: 'center' });
    cy += step;
  });
}

function fmtPdfRp(val: number): string {
  if (!Number.isFinite(val) || Math.round(val) === 0) return '-';
  return Math.round(val).toLocaleString('id-ID');
}

function fmtPdfNum(val: number, decimals = 1): string {
  if (!Number.isFinite(val) || val === 0) return '';
  return val.toFixed(decimals);
}

export function exportUpdatePmToF4Pdf(params: {
  record: DailyPmRecord;
  viewMode?: 'specific' | 'summary' | 'both';
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { record, viewMode = 'both', profile, orientation = 'portrait' } = params;
  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = orientation === 'landscape' ? 14 : 11;
  const contentWidth = pageWidth - marginX * 2;
  const dateDisplay = formatIndonesianFullDate(record.dateIso);
  const summary = computePmSummary(record);
  const logos = resolveDocumentLogos(profile, 'update_pm', record);

  const greenBg: [number, number, number] = [0, 176, 80];
  const orangeBg: [number, number, number] = [255, 102, 0];
  const yellowBg: [number, number, number] = [255, 255, 0];
  const limeBg: [number, number, number] = [204, 255, 0];

  const renderPmSheetHeader = (sheetTitle: string): number => {
    let y = drawBgnStandardKopHeader({
      doc,
      startX: marginX,
      startY: 10,
      width: contentWidth,
      logoDataUrl: logos.leftUrl,
      logoLeftWidthMm: logos.leftWidthMm,
      logoRightDataUrl: logos.rightUrl,
      logoRightWidthMm: logos.rightWidthMm,
      line1: record.headerLine1,
      line2: record.headerLine2,
      line3: record.headerLine3,
      alamat: record.headerAlamat,
    });
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(sheetTitle.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 2.5;

    doc.setFillColor(limeBg[0], limeBg[1], limeBg[2]);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(marginX, y, contentWidth, 6.5, 'FD');
    doc.setFontSize(9.5);
    doc.text(dateDisplay, pageWidth / 2, y + 4.5, { align: 'center' });
    return y + 6.5;
  };

  const buildPmHead = (): unknown[][] => [
    [
      {
        content: 'DATA PENERIMA KELOMPOK SASARAN',
        colSpan: 2,
        styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      },
      {
        content: 'JUMLAH PENERIMA MANFAAT',
        colSpan: 4,
        styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      },
      {
        content: 'TOTAL PENERIMA\nMANFAAT',
        rowSpan: 3,
        styles: {
          fillColor: greenBg,
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
      },
    ],
    [
      {
        content: 'No.',
        rowSpan: 2,
        styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle' },
      },
      {
        content: 'Kelompok Sasaran',
        rowSpan: 2,
        styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle' },
      },
      {
        content: 'Tanpa Alergi',
        colSpan: 2,
        styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      },
      {
        content: 'Diet/Alergi',
        colSpan: 2,
        styles: { fillColor: orangeBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      },
    ],
    [
      { content: 'Porsi Besar', styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' } },
      { content: 'Porsi Kecil', styles: { fillColor: greenBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' } },
      { content: 'Porsi Besar', styles: { fillColor: orangeBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' } },
      { content: 'Porsi Kecil', styles: { fillColor: orangeBg, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' } },
    ],
  ];

  const colW =
    orientation === 'landscape'
      ? [14, 118, 36, 36, 36, 36, 26]
      : [11, 70, 22, 22, 22, 22, 24];

  let pageStarted = false;

  if (viewMode === 'specific' || viewMode === 'both') {
    pageStarted = true;
    const startY = renderPmSheetHeader(record.titleSpecific || 'UPDATE DATA SPESIFIK');
    const sortedSpecific = [...record.specificRows].sort((a, b) => a.rowOrder - b.rowOrder);

    let specTBesar = 0;
    let specTKecil = 0;
    let specDBesar = 0;
    let specDKecil = 0;

    const specBody: unknown[][] = sortedSpecific.map((r, idx) => {
      const tb = Math.max(0, Math.round(r.tanpaAlergiBesar || 0));
      const tk = Math.max(0, Math.round(r.tanpaAlergiKecil || 0));
      const db = Math.max(0, Math.round(r.dietAlergiBesar || 0));
      const dk = Math.max(0, Math.round(r.dietAlergiKecil || 0));
      specTBesar += tb;
      specTKecil += tk;
      specDBesar += db;
      specDKecil += dk;
      const tot = tb + tk + db + dk;
      return [
        String(idx + 1),
        r.namaSekolah || '',
        tb > 0 ? String(tb) : '',
        tk > 0 ? String(tk) : '',
        db > 0 ? String(db) : '',
        dk > 0 ? String(dk) : '',
        tot > 0 ? String(tot) : '',
      ];
    });

    if (specBody.length === 0) {
      specBody.push(['1', '-', '', '', '', '', '0']);
    }

    const specGrand = specTBesar + specTKecil + specDBesar + specDKecil;
    specBody.push([
      {
        content: 'Sub. Total',
        colSpan: 2,
        styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'center' },
      },
      { content: String(specTBesar), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(specTKecil), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(specDBesar), styles: { fillColor: orangeBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(specDKecil), styles: { fillColor: orangeBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(specGrand), styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'center' } },
    ]);

    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX, top: 10, bottom: 10 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 8.5 : 8.0,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 1.5,
      },
      head: buildPmHead() as never[],
      body: specBody as never[],
      columnStyles: {
        0: { cellWidth: colW[0], halign: 'center' },
        1: { cellWidth: colW[1], halign: 'left' },
        2: { cellWidth: colW[2], halign: 'center' },
        3: { cellWidth: colW[3], halign: 'center' },
        4: { cellWidth: colW[4], halign: 'center' },
        5: { cellWidth: colW[5], halign: 'center' },
        6: { cellWidth: colW[6], halign: 'center' },
      },
    });
  }

  if (viewMode === 'summary' || viewMode === 'both') {
    if (pageStarted) doc.addPage();
    const startY = renderPmSheetHeader(record.titleSummary || 'UPDATE DATA PENERIMA MANFAAT');

    const sumBody: unknown[][] = summary.rows.map((r) => [
      String(r.no),
      r.label,
      r.tanpaAlergiBesar > 0 ? String(r.tanpaAlergiBesar) : '',
      r.tanpaAlergiKecil > 0 ? String(r.tanpaAlergiKecil) : '',
      r.dietAlergiBesar > 0 ? String(r.dietAlergiBesar) : '',
      r.dietAlergiKecil > 0 ? String(r.dietAlergiKecil) : '',
      r.total > 0 ? String(r.total) : '',
    ]);

    sumBody.push([
      {
        content: 'Sub. Total',
        colSpan: 2,
        styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'center' },
      },
      { content: String(summary.subTotal.tanpaAlergiBesar), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(summary.subTotal.tanpaAlergiKecil), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(summary.subTotal.dietAlergiBesar), styles: { fillColor: orangeBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(summary.subTotal.dietAlergiKecil), styles: { fillColor: orangeBg, fontStyle: 'bold', halign: 'center' } },
      { content: String(summary.subTotal.total), styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'center' } },
    ]);

    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX, top: 10, bottom: 10 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 8.8 : 8.2,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 1.8,
      },
      head: buildPmHead() as never[],
      body: sumBody as never[],
      columnStyles: {
        0: { cellWidth: colW[0], halign: 'center' },
        1: { cellWidth: colW[1], halign: 'left' },
        2: { cellWidth: colW[2], halign: 'center' },
        3: { cellWidth: colW[3], halign: 'center' },
        4: { cellWidth: colW[4], halign: 'center' },
        5: { cellWidth: colW[5], halign: 'center' },
        6: { cellWidth: colW[6], halign: 'center' },
      },
    });
  }

  doc.save(`UPDATE_PM_${record.dateIso}.pdf`);
}

export function exportFoodCostNutritionToF4Pdf(params: {
  plan: FoodCostDayPlan;
  pmRecord: DailyPmRecord | null;
  worksheetIds?: string[];
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { plan, pmRecord, worksheetIds, profile, orientation = 'landscape' } = params;
  const worksheets =
    worksheetIds && worksheetIds.length > 0
      ? plan.worksheets.filter((w) => worksheetIds.includes(w.id))
      : plan.worksheets;

  if (worksheets.length === 0) return;

  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 6;
  const marginY = 6;
  const stripW = 9;
  const rightX = marginX + stripW;
  const workW = pageWidth - marginX * 2 - stripW;
  const pmSummary = computePmSummary(pmRecord);
  const dateDisplay = formatIndonesianFullDate(plan.dateIso);
  const logos = resolveDocumentLogos(profile, 'foodcost', plan);

  const greenBg: [number, number, number] = [0, 176, 80];
  const limeBg: [number, number, number] = [204, 255, 0];
  const greyBg: [number, number, number] = [191, 191, 191];
  const peachBg: [number, number, number] = [244, 176, 132];
  const passGreenBg: [number, number, number] = [146, 208, 80];
  const failRedBg: [number, number, number] = [255, 0, 0];

  worksheets.forEach((ws, wsIdx) => {
    if (wsIdx > 0) doc.addPage();
    const computed = computeFoodCostWorksheet(ws, pmSummary);

    // Left yellow strip full height
    drawVerticalSideStrip(
      doc,
      marginX,
      marginY,
      stripW,
      pageHeight - marginY * 2,
      ws.sideLabel || 'SPPG'
    );

    // Top Kop Header
    let y = drawBgnStandardKopHeader({
      doc,
      startX: rightX,
      startY: marginY + 1,
      width: workW,
      logoDataUrl: logos.leftUrl,
      logoLeftWidthMm: logos.leftWidthMm,
      logoRightDataUrl: logos.rightUrl,
      logoRightWidthMm: logos.rightWidthMm,
      line1: plan.headerLine1,
      line2: plan.headerLine2,
      line3: plan.headerLine3,
      alamat: plan.headerAlamat,
    });

    y += 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(0, 0, 0);
    doc.text((ws.title || 'NILAI GIZI DAN FOOD COST').toUpperCase(), rightX + workW / 2, y, {
      align: 'center',
      maxWidth: workW - 4,
    });
    y += 2;

    // Date bar
    doc.setFillColor(limeBg[0], limeBg[1], limeBg[2]);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(rightX, y, workW, 5.5, 'FD');
    doc.setFontSize(8.5);
    doc.text(dateDisplay, rightX + workW / 2, y + 3.9, { align: 'center' });
    y += 5.5;

    // Top AKG & Food Cost summary grid (10 columns matching Excel structure)
    const statusColor = (pct: number): [number, number, number] =>
      pct >= 90 && pct <= 110 ? passGreenBg : failRedBg;

    const scaleW = workW / 303;
    const sw = (n: number) => n * scaleW;

    const summaryBody: unknown[][] = [
      [
        {
          content: 'Nilai Gizi Berdasarkan AKG',
          colSpan: 6,
          styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: 'JUMLAH',
          colSpan: 2,
          styles: { fillColor: greyBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: `Rp   ${fmtPdfRp(computed.subTotalHarga)}`,
          styles: { fillColor: [255, 242, 204], fontStyle: 'bold', halign: 'right' },
        },
      ],
      [
        {
          content: 'NILAI GIZI MENU',
          styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' },
        },
        { content: computed.nutritionTotals.energi.toFixed(1), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: computed.nutritionTotals.protein.toFixed(1), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: computed.nutritionTotals.lemak.toFixed(1), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: computed.nutritionTotals.kh.toFixed(1), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: computed.nutritionTotals.serat.toFixed(1), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        {
          content: `BUMBU  ${ws.bumbuPercent}%`,
          colSpan: 2,
          styles: { fillColor: greyBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: `Rp   ${fmtPdfRp(computed.bumbuAmount)}`,
          styles: { fillColor: greyBg, fontStyle: 'bold', halign: 'right' },
        },
      ],
      [
        {
          content:
            ws.portionScope === 'kecil'
              ? 'RUJUKAN AKG PORSI KECIL 20-25%'
              : ws.portionScope === 'besar'
              ? 'RUJUKAN AKG PORSI BESAR 30-35%'
              : 'RUJUKAN AKG SASARAN',
          styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' },
        },
        { content: String(Math.round(computed.akgRef.energi)), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: String(Math.round(computed.akgRef.protein)), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: String(Math.round(computed.akgRef.lemak)), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: String(Math.round(computed.akgRef.karbohidrat)), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        { content: String(Math.round(computed.akgRef.serat)), styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' } },
        {
          content: `JUMLAH + BUMBU ${ws.bumbuPercent}%`,
          colSpan: 2,
          styles: { fillColor: greyBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: `Rp   ${fmtPdfRp(computed.totalWithBumbu)}`,
          styles: { fillColor: greyBg, fontStyle: 'bold', halign: 'right' },
        },
      ],
      [
        {
          content: '% KEBUTUHAN 90-110%',
          styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: computed.percentNeeds.energi.toFixed(0),
          styles: { fillColor: statusColor(computed.percentNeeds.energi), fontStyle: 'bold', halign: 'center' },
        },
        {
          content: computed.percentNeeds.protein.toFixed(0),
          styles: { fillColor: statusColor(computed.percentNeeds.protein), fontStyle: 'bold', halign: 'center' },
        },
        {
          content: computed.percentNeeds.lemak.toFixed(0),
          styles: { fillColor: statusColor(computed.percentNeeds.lemak), fontStyle: 'bold', halign: 'center' },
        },
        {
          content: computed.percentNeeds.kh.toFixed(0),
          styles: { fillColor: statusColor(computed.percentNeeds.kh), fontStyle: 'bold', halign: 'center' },
        },
        {
          content: computed.percentNeeds.serat.toFixed(0),
          styles: { fillColor: statusColor(computed.percentNeeds.serat), fontStyle: 'bold', halign: 'center' },
        },
        {
          content: 'HARGA PER PORSI',
          colSpan: 2,
          styles: { fillColor: greyBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: `Rp   ${fmtPdfRp(computed.hargaPerPorsi)}`,
          styles: { fillColor: failRedBg, fontStyle: 'bold', halign: 'right' },
        },
      ],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: rightX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 7.4 : 6.0,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22,
        cellPadding: 1.0,
      },
      body: summaryBody as never[],
      columnStyles: {
        0: { cellWidth: sw(102) },
        1: { cellWidth: sw(11) },
        2: { cellWidth: sw(11) },
        3: { cellWidth: sw(11) },
        4: { cellWidth: sw(11) },
        5: { cellWidth: sw(11) },
        6: { cellWidth: sw(60) },
        7: { cellWidth: sw(56) },
        8: { cellWidth: sw(30) },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterSummaryY = (doc as any).lastAutoTable?.finalY || y + 22;

    // 20-column Ingredients Table matching Image 1
    const cols20 = [
      32, 42, 13, 15, 11, 11, 11, 11, 11, 10, 12, 14, 15, 12, 12, 10, 11, 10, 20, 26,
    ].map((w) => sw(w));

    const ingBody: unknown[][] = computed.rows.map((cr) => [
      { content: cr.row.menuName || '', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: cr.row.bahanMakanan || '', styles: { halign: 'left' } },
      { content: cr.row.beratBb ? String(cr.row.beratBb) : '', styles: { halign: 'center' } },
      { content: cr.row.urt || '', styles: { halign: 'center' } },
      { content: cr.energi.toFixed(1), styles: { halign: 'center' } },
      { content: cr.protein.toFixed(1), styles: { halign: 'center' } },
      { content: cr.lemak.toFixed(1), styles: { halign: 'center' } },
      { content: cr.kh.toFixed(1), styles: { halign: 'center' } },
      { content: cr.serat.toFixed(1), styles: { halign: 'center' } },
      { content: String(cr.bddPercent), styles: { halign: 'center' } },
      { content: cr.bkGram.toFixed(1), styles: { halign: 'center' } },
      { content: String(cr.jumlahManfaat), styles: { halign: 'center' } },
      { content: cr.totalGram.toFixed(1), styles: { halign: 'center' } },
      { content: cr.totalKg.toFixed(1), styles: { halign: 'center' } },
      { content: cr.potong !== null ? cr.potong.toFixed(1) : '', styles: { halign: 'center' } },
      { content: cr.ekor !== null ? cr.ekor.toFixed(1) : '', styles: { halign: 'center' } },
      { content: cr.lembar !== null ? cr.lembar.toFixed(1) : '', styles: { halign: 'center' } },
      { content: cr.rak !== null ? cr.rak.toFixed(1) : '', styles: { halign: 'center' } },
      { content: cr.row.hargaSatuan > 0 ? `Rp ${fmtPdfRp(cr.row.hargaSatuan)}` : '', styles: { halign: 'right' } },
      { content: `Rp ${fmtPdfRp(cr.hargaTotal)}`, styles: { halign: 'right' } },
    ]);

    const minPad = Math.max(0, 14 - ingBody.length);
    for (let i = 0; i < minPad; i += 1) {
      ingBody.push(Array(20).fill(''));
    }

    autoTable(doc, {
      startY: afterSummaryY,
      margin: { left: rightX, right: marginX, top: 8, bottom: 8 },
      theme: 'grid',
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 6.5 : 5.2,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        cellPadding: 0.9,
        valign: 'middle',
      },
      headStyles: {
        fillColor: peachBg,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      head: [
        [
          'MENU',
          'BAHAN MAKANAN',
          'BERAT\n(BB)',
          'URT',
          'ENERGI\n(kkal)',
          'PROTEIN\n(g)',
          'LEMAK\n(g)',
          'KH\n(g)',
          'SERAT\n(g)',
          'BDD\n(%)',
          'BK (gr)',
          'Jumlah\nManfaat',
          'Gram',
          'Kg',
          'Potong',
          'Ekor',
          'Lembar',
          'Rak',
          'Harga Satuan',
          'Harga Total',
        ],
      ],
      body: ingBody as never[],
      columnStyles: Object.fromEntries(cols20.map((w, idx) => [idx, { cellWidth: w }])),
    });
  });

  doc.save(`NILAI_GIZI_FOOD_COST_${plan.dateIso}.pdf`);
}

export function exportRawMaterialAndPoToF4Pdf(params: {
  recapConfig: RawMaterialRecapDayConfig;
  foodCostPlan: FoodCostDayPlan | null;
  pmRecord: DailyPmRecord | null;
  mode?: 'rekap' | 'po' | 'both';
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { recapConfig, foodCostPlan, pmRecord, mode = 'both', profile, orientation = 'landscape' } = params;
  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pmSummary = computePmSummary(pmRecord);
  const recap = computeRawMaterialRecap(foodCostPlan, pmSummary, recapConfig);
  const dateDisplay = formatIndonesianFullDate(recapConfig.dateIso);
  const recapLogos = resolveDocumentLogos(profile, 'rekap_bahan', recapConfig);
  const poLogos = resolveDocumentLogos(profile, 'po_bahan', recapConfig);

  const limeBg: [number, number, number] = [204, 255, 0];
  const passGreenBg: [number, number, number] = [146, 208, 80];
  const failRedBg: [number, number, number] = [255, 0, 0];
  const peachBg: [number, number, number] = [244, 176, 132];
  const yellowBg: [number, number, number] = [255, 255, 0];
  const poBlueBg: [number, number, number] = [183, 222, 232];

  let pageStarted = false;

  if (mode === 'rekap' || mode === 'both') {
    pageStarted = true;
    const marginX = 6;
    const marginY = 6;
    const stripW = 9;
    const rightX = marginX + stripW;
    const workW = pageWidth - marginX * 2 - stripW;

    drawVerticalSideStrip(
      doc,
      marginX,
      marginY,
      stripW,
      pageHeight - marginY * 2,
      recapConfig.sideLabel || 'REKAPAN / PO'
    );

    let y = drawBgnStandardKopHeader({
      doc,
      startX: rightX,
      startY: marginY + 1,
      width: workW,
      logoDataUrl: recapLogos.leftUrl,
      logoLeftWidthMm: recapLogos.leftWidthMm,
      logoRightDataUrl: recapLogos.rightUrl,
      logoRightWidthMm: recapLogos.rightWidthMm,
      line1: recapConfig.headerLine1,
      line2: recapConfig.headerLine2,
      line3: recapConfig.headerLine3,
      alamat: recapConfig.headerAlamat,
    });

    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text(
      (recapConfig.recapTitle || 'REKAPAN TOTAL KEBUTUHAN BAHAN BAKU KESELURUHAN').toUpperCase(),
      rightX + workW / 2,
      y,
      { align: 'center', maxWidth: workW - 4 }
    );
    y += 2.2;

    doc.setFillColor(limeBg[0], limeBg[1], limeBg[2]);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(rightX, y, workW, 5.8, 'FD');
    doc.setFontSize(8.8);
    doc.text(dateDisplay, rightX + workW / 2, y + 4.1, { align: 'center' });
    y += 5.8;

    const sw = (n: number) => (n * workW) / 302;
    const selisihBg = recap.selisihRab >= 0 ? passGreenBg : failRedBg;
    const selisihPrefix = recap.selisihRab < 0 ? '-Rp ' : 'Rp ';

    const topSummaryBody: unknown[][] = [
      [
        { content: 'TOTAL PENERIMA MANFAAT', colSpan: 2, styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: 'PORSI\nKECIL', styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: 'PORSI\nBESAR', styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: `BUMBU ${recap.bumbuPercent}%`, colSpan: 2, styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: 'RAB PORSI KECIL', colSpan: 2, styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: 'RAB PORSI BESAR', colSpan: 2, styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: 'TOTAL RAB', styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
        { content: 'SELISIH', styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'center' } },
      ],
      [
        { content: String(recap.totalPenerimaManfaat), colSpan: 2, styles: { fontStyle: 'bold', halign: 'center' } },
        { content: String(recap.porsiKecilCount), styles: { fontStyle: 'bold', halign: 'center' } },
        { content: String(recap.porsiBesarCount), styles: { fontStyle: 'bold', halign: 'center' } },
        { content: `Rp  ${fmtPdfRp(recap.bumbuTotalRp)}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `Rp  ${fmtPdfRp(recap.rabPorsiKecilTotal)}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `Rp  ${fmtPdfRp(recap.rabPorsiBesarTotal)}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: `Rp  ${fmtPdfRp(recap.totalRab)}`, styles: { fillColor: passGreenBg, fontStyle: 'bold', halign: 'right' } },
        { content: `${selisihPrefix}${fmtPdfRp(Math.abs(recap.selisihRab))}`, styles: { fillColor: selisihBg, fontStyle: 'bold', halign: 'right' } },
      ],
      [
        {
          content: 'TOTAL BELANJA KEBUTUHAN BAHAN BAKU',
          colSpan: 11,
          styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'center' },
        },
        {
          content: `Rp  ${fmtPdfRp(recap.totalBelanjaBahanBaku)}`,
          styles: { fillColor: yellowBg, fontStyle: 'bold', halign: 'right' },
        },
      ],
    ];

    const colW12 = [58, 22, 22, 18, 17, 17, 18, 18, 20, 22, 32, 38].map(sw);

    autoTable(doc, {
      startY: y,
      margin: { left: rightX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 7.4 : 5.8,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22,
        cellPadding: 1.1,
        valign: 'middle',
      },
      body: topSummaryBody as never[],
      columnStyles: Object.fromEntries(colW12.map((w, idx) => [idx, { cellWidth: w }])),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterTopY = (doc as any).lastAutoTable?.finalY || y + 20;

    const recapBody: unknown[][] = recap.rows.map((r) => [
      { content: r.bahanMakanan, styles: { halign: 'left' } },
      { content: fmtPdfNum(r.totalPo, 1), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: fmtPdfNum(r.estimasiUsed, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.kg, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.potong, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.ekor, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.lembar, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.rak, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.bufferAmount, 1), styles: { halign: 'center' } },
      { content: fmtPdfNum(r.jumlahPlusBuffer, 1), styles: { halign: 'center' } },
      { content: r.hargaSatuan > 0 ? `Rp  ${fmtPdfRp(r.hargaSatuan)}` : 'Rp  -', styles: { halign: 'right' } },
      { content: r.hargaTotal > 0 ? `Rp  ${fmtPdfRp(r.hargaTotal)}` : 'Rp  -', styles: { halign: 'right', fontStyle: 'bold' } },
    ]);

    const padCount = Math.max(0, 16 - recapBody.length);
    for (let i = 0; i < padCount; i += 1) {
      recapBody.push(Array(12).fill(''));
    }

    autoTable(doc, {
      startY: afterTopY,
      margin: { left: rightX, right: marginX, top: 8, bottom: 8 },
      theme: 'grid',
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 7.6 : 6.0,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22,
        cellPadding: 1.2,
        valign: 'middle',
      },
      headStyles: {
        fillColor: peachBg,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      head: [
        [
          'BAHAN MAKANAN',
          'Total PO',
          'Estimasi\nBuffer',
          'Kg',
          'Potong',
          'Ekor',
          'Lembar',
          'Rak',
          `Buffer ${recapConfig.bufferPercent}%`,
          'Jumlah +\nBuffer',
          'Harga Satuan',
          'Harga Total',
        ],
      ],
      body: recapBody as never[],
      columnStyles: Object.fromEntries(colW12.map((w, idx) => [idx, { cellWidth: w }])),
    });
  }

  if (mode === 'po' || mode === 'both') {
    if (pageStarted) doc.addPage();
    const marginX = orientation === 'landscape' ? 14 : 11;
    const contentWidth = pageWidth - marginX * 2;
    let y = 8;

    // Yellow-lime PO Title Banner
    doc.setFillColor(limeBg[0], limeBg[1], limeBg[2]);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(marginX, y, contentWidth, 9.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(
      (recapConfig.poJudul || `NOTA PESANAN HARI ${recapConfig.hariKe}`).toUpperCase(),
      pageWidth / 2,
      y + 6.6,
      { align: 'center' }
    );
    y += 11.5;

    y = drawBgnStandardKopHeader({
      doc,
      startX: marginX,
      startY: y,
      width: contentWidth,
      logoDataUrl: poLogos.leftUrl,
      logoLeftWidthMm: poLogos.leftWidthMm,
      logoRightDataUrl: poLogos.rightUrl,
      logoRightWidthMm: poLogos.rightWidthMm,
      line1: recapConfig.headerLine1,
      line2: recapConfig.headerLine2,
      line3: recapConfig.headerLine3,
      alamat: recapConfig.headerAlamat,
    });

    y += 3;
    const metaRows: Array<[string, string]> = [
      ['Dari', recapConfig.poDari || recapConfig.headerLine3 || 'SPPG'],
      ['Kepada', recapConfig.poKepada || ''],
      ['Alamat', recapConfig.poAlamat || ''],
      ['Tanggal', dateDisplay],
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    metaRows.forEach(([label, val]) => {
      doc.text(label, marginX + 1, y);
      doc.text(':', marginX + 20, y);
      doc.text(val, marginX + 24, y, { maxWidth: contentWidth - 26 });
      y += 5.2;
    });

    y += 2;
    const poRows: unknown[][] = recap.rows.map((r, idx) => [
      { content: String(idx + 1), styles: { halign: 'center' } },
      { content: r.bahanMakanan, styles: { halign: 'left' } },
      { content: fmtPdfNum(r.totalPo, 1), styles: { halign: 'center' } },
      { content: r.satuanPo, styles: { halign: 'center' } },
      { content: r.hargaSatuan > 0 ? `Rp  ${fmtPdfRp(r.hargaSatuan)}` : 'Rp  -', styles: { halign: 'right' } },
      { content: r.hargaTotal > 0 ? `Rp  ${fmtPdfRp(r.hargaTotal)}` : 'Rp  -', styles: { halign: 'right' } },
    ]);

    const poPad = Math.max(0, 16 - poRows.length);
    for (let i = 0; i < poPad; i += 1) {
      poRows.push([
        { content: String(poRows.length + 1), styles: { halign: 'center' } },
        '',
        '',
        '',
        '',
        '',
      ]);
    }

    poRows.push([
      {
        content: 'TOTAL BELANJA',
        colSpan: 5,
        styles: { halign: 'center', fontStyle: 'bold' },
      },
      {
        content: `Rp  ${fmtPdfRp(recap.totalBelanjaBahanBaku)}`,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
    ]);

    const poColW =
      orientation === 'landscape'
        ? [16, 130, 32, 32, 46, 46]
        : [12, 74, 22, 22, 31, 32];

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX, top: 10, bottom: 16 },
      theme: 'grid',
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 8.8 : 8.2,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 1.5,
        valign: 'middle',
      },
      headStyles: {
        fillColor: poBlueBg,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.28,
        minCellHeight: 8,
      },
      head: [['No.', 'Uraian Jenis Bahan Makanan', 'Jumlah', 'Satuan', 'Harga', 'Total']],
      body: poRows as never[],
      columnStyles: Object.fromEntries(poColW.map((w, idx) => [idx, { cellWidth: w }])),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterPoY = (doc as any).lastAutoTable?.finalY || y + 100;
    let sigY = afterPoY + 10;
    if (sigY + 30 > pageHeight - 10) {
      doc.addPage();
      sigY = 20;
    }

    const sigX = marginX + contentWidth * 0.56;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(recapConfig.poSignerLabel1 || 'Mengetahui,', sigX, sigY);
    doc.text(
      recapConfig.poSignerLabel2 || 'Kepala Satuan Pelayanan Pemenuhan Gizi',
      sigX,
      sigY + 5.2
    );

    if (recapConfig.poSignerName) {
      const nameY = sigY + 25;
      doc.setFont('helvetica', 'bold');
      doc.text(recapConfig.poSignerName, sigX, nameY);
      const nw = doc.getTextWidth(recapConfig.poSignerName);
      doc.setLineWidth(0.35);
      doc.line(sigX, nameY + 0.8, sigX + nw, nameY + 0.8);
    }
  }

  doc.save(`REKAP_BAHAN_BAKU_PO_${recapConfig.dateIso}.pdf`);
}

export function exportMasterMenuToF4Pdf(params: {
  plan: MasterMenuPlan;
  profile?: SppgUserProfile;
  orientation?: PdfOrientation;
}): void {
  const { plan, profile, orientation = 'landscape' } = params;
  const f4Format: [number, number] =
    orientation === 'landscape' ? [330, 215] : [215, 330];

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: f4Format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 8;
  const contentWidth = pageWidth - marginX * 2;
  const logos = resolveDocumentLogos(profile, 'master_menu', plan);
  const rowLabels = {
    ...DEFAULT_MASTER_MENU_ROW_LABELS,
    ...(plan.rowLabels || {}),
  };

  let cursorY = 8;

  // Kop border box + Kop Header
  const kopStartY = cursorY;
  const kopEndY = drawBgnStandardKopHeader({
    doc,
    startX: marginX,
    startY: kopStartY + 1,
    width: contentWidth,
    logoDataUrl: logos.leftUrl,
    logoLeftWidthMm: logos.leftWidthMm,
    logoRightDataUrl: logos.rightUrl,
    logoRightWidthMm: logos.rightWidthMm,
    line1: plan.headerLine1 || 'BADAN GIZI NASIONAL',
    line2: plan.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI',
    line3: plan.headerLine3 || profile?.namaSppg || 'SPPG',
    alamat: plan.headerAlamat || (profile?.alamat ? `Alamat : ${profile.alamat}` : 'Alamat : -'),
  });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(marginX, kopStartY, contentWidth, kopEndY - kopStartY, 'S');
  cursorY = kopEndY;

  // Full-width Green Master Menu Banner (#00B050)
  const bannerH = 8.5;
  doc.setFillColor(0, 176, 80);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(marginX, cursorY, contentWidth, bannerH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(orientation === 'landscape' ? 12.5 : 10.5);
  doc.setTextColor(0, 0, 0);
  doc.text((plan.title || 'MASTER MENU').toUpperCase(), pageWidth / 2, cursorY + 5.8, {
    align: 'center',
    maxWidth: contentWidth - 4,
  });
  cursorY += bannerH;

  const labelColW = orientation === 'landscape' ? 46 : 32;
  const dayColW = (contentWidth - labelColW) / 5;
  const yellowBg: [number, number, number] = [255, 255, 0];
  const greenBg: [number, number, number] = [0, 176, 80];

  (plan.weeks || []).forEach((week, idx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startY = idx === 0 ? cursorY : ((doc as any).lastAutoTable?.finalY || cursorY);
    const days = week.days || [];

    const bodyRows: unknown[][] = [
      [
        { content: rowLabels.makananPokok, styles: { fontStyle: 'bold', halign: 'left' } },
        ...days.map((d) => ({ content: d.makananPokok || '', styles: { fontStyle: 'bold', halign: 'center' } })),
      ],
      [
        { content: rowLabels.laukHewani, styles: { fontStyle: 'bold', halign: 'left' } },
        ...days.map((d) => ({ content: d.laukHewani || '', styles: { fontStyle: 'bold', halign: 'center' } })),
      ],
      [
        { content: rowLabels.laukNabati, styles: { fontStyle: 'bold', halign: 'left' } },
        ...days.map((d) => ({ content: d.laukNabati || '', styles: { fontStyle: 'bold', halign: 'center' } })),
      ],
      [
        { content: rowLabels.sayuran, styles: { fontStyle: 'bold', halign: 'left' } },
        ...days.map((d) => ({ content: d.sayuran || '', styles: { fontStyle: 'bold', halign: 'center' } })),
      ],
      [
        { content: rowLabels.buah, styles: { fontStyle: 'bold', halign: 'left' } },
        ...days.map((d) => ({ content: d.buah || '', styles: { fontStyle: 'bold', halign: 'center' } })),
      ],
      [
        { content: rowLabels.susu, styles: { fontStyle: 'bold', halign: 'left' } },
        ...days.map((d) => ({ content: d.susu || '', styles: { fontStyle: 'bold', halign: 'center' } })),
      ],
      [
        {
          content: week.weekLabel || `Minggu Ke- ${week.weekNumber}`,
          styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' },
        },
        ...days.map((d) => ({
          content: `MENU ${d.menuNumber}`,
          styles: { fillColor: greenBg, fontStyle: 'bold', halign: 'center' },
        })),
      ],
    ];

    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX, top: 8, bottom: 10 },
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'landscape' ? 7.6 : 6.0,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        valign: 'middle',
        cellPadding: { top: 1.0, right: 1.4, bottom: 1.0, left: 1.4 },
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: yellowBg,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.28,
      },
      head: [
        [
          rowLabels.kelompokHeader || 'Kelompok Bahan Makanan',
          ...days.map((d) => d.dayLabel || formatIndonesianFullDate(d.dateIso)),
        ],
      ],
      body: bodyRows as never[],
      columnStyles: {
        0: { cellWidth: labelColW },
        1: { cellWidth: dayColW },
        2: { cellWidth: dayColW },
        3: { cellWidth: dayColW },
        4: { cellWidth: dayColW },
        5: { cellWidth: dayColW },
      },
    });
  });

  const safeTitle = (plan.title || 'MASTER_MENU')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  doc.save(`MASTER_MENU_${safeTitle}_${plan.monthKey}.pdf`);
}



