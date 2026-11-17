import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CalendarPlus,
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Utensils,
} from 'lucide-react';
import type {
  DailyMenuEntry,
  FoodTempDayBlock,
  FreezerMachine,
  SamplePertinggalRow,
  SppgUserProfile,
  TempMonitoringRoom,
  WorkspaceTab,
} from '../types';
import {
  getDaysInMonth,
  getPeriodeDisplayName,
  parseMonthKey,
} from '../utils/dateUtils';

interface DashboardCompletionPanelProps {
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  sampleRows: SamplePertinggalRow[];
  tempRooms: TempMonitoringRoom[];
  freezerMachines: FreezerMachine[];
  foodTempBlocks: FoodTempDayBlock[];
  onNavigateTab: (tab: WorkspaceTab) => void;
  onAddNewMenu: () => void;
}

function getWorkingDaysInMonth(year: number, month: number): number {
  const totalDays = getDaysInMonth(year, month);
  let weekdays = 0;
  for (let day = 1; day <= totalDays; day++) {
    const dow = new Date(year, month - 1, day).getDay();
    if (dow !== 0 && dow !== 6) {
      weekdays += 1;
    }
  }
  return weekdays;
}

function getBarColorClass(pct: number): string {
  if (pct >= 90) return 'bg-emerald-600';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-rose-600';
}

function getStatusTextClass(pct: number): string {
  if (pct >= 90) return 'text-emerald-700';
  if (pct >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

export const DashboardCompletionPanel: React.FC<DashboardCompletionPanelProps> = ({
  profile,
  monthKey,
  entries,
  sampleRows,
  tempRooms,
  freezerMachines,
  foodTempBlocks,
  onNavigateTab,
  onAddNewMenu,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const metrics = useMemo(() => {
    const { year, month } = parseMonthKey(monthKey);
    const daysInMonth = getDaysInMonth(year, month);
    const workingDaysCount = getWorkingDaysInMonth(year, month);

    const totalMenus = entries.length;
    const photoReadyCount = entries.filter(
      (e) => Boolean(e.photoDataUrl && e.photoDataUrl.length > 0)
    ).length;
    const missingPhotoCount = Math.max(0, totalMenus - photoReadyCount);

    const nutritionFilledCount = entries.filter(
      (e) => e.nutritionByCategory && Object.keys(e.nutritionByCategory).length > 0
    ).length;

    const menuPct =
      workingDaysCount > 0
        ? Math.min(100, Math.round((totalMenus / workingDaysCount) * 100))
        : 0;
    const photoPct =
      totalMenus > 0 ? Math.round((photoReadyCount / totalMenus) * 100) : 0;
    const giziPct =
      totalMenus > 0 ? Math.round((nutritionFilledCount / totalMenus) * 100) : 0;

    const foodTempFilledCount = foodTempBlocks.filter(
      (b) =>
        b.tanggal.trim().length > 0 ||
        b.items.some((item) => item.namaMakanan.trim().length > 0 || item.suhu.trim().length > 0)
    ).length;

    const activeFormModules = [
      sampleRows.length > 0,
      tempRooms.length > 0,
      freezerMachines.length > 0,
      foodTempFilledCount > 0,
    ].filter(Boolean).length;

    const opsPct = Math.round((activeFormModules / 4) * 100);

    // Overall readiness weighted across core documentation pillars
    const overallPct = Math.round(
      menuPct * 0.3 + photoPct * 0.3 + giziPct * 0.2 + opsPct * 0.2
    );

    const overallStatusLabel =
      overallPct >= 90
        ? 'Dokumentasi Lengkap'
        : overallPct >= 60
        ? 'Pengisian Berjalan'
        : overallPct > 0
        ? 'Perlu Dilengkapi'
        : 'Belum Terisi';

    return {
      daysInMonth,
      workingDaysCount,
      totalMenus,
      photoReadyCount,
      missingPhotoCount,
      nutritionFilledCount,
      menuPct,
      photoPct,
      giziPct,
      foodTempFilledCount,
      activeFormModules,
      opsPct,
      overallPct,
      overallStatusLabel,
    };
  }, [entries, foodTempBlocks, freezerMachines.length, monthKey, sampleRows.length, tempRooms.length]);

  const periodeName = getPeriodeDisplayName(monthKey);

  return (
    <section
      aria-label="Panel persentase pengisian dashboard"
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Top Executive Summary Strip */}
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Ringkasan Kepatuhan Pengisian</span>
            <span aria-hidden="true">·</span>
            <span>{periodeName}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{profile.namaSppg || 'SPPG'}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Persentase Kelengkapan Dokumen SPPG
            </h2>
            <span
              className={`font-mono-num text-xs font-semibold ${getStatusTextClass(
                metrics.overallPct
              )}`}
            >
              {metrics.overallStatusLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="w-40 sm:w-48">
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-slate-500">Skor Kesiapan Bulan</span>
              <span className="font-mono-num font-bold text-slate-900 text-sm">
                {metrics.overallPct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all duration-300 ${getBarColorClass(
                  metrics.overallPct
                )}`}
                style={{ width: `${metrics.overallPct}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Tampilkan Detail
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Ringkas
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4-Column Real Metrics Strip */}
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* 1. Menu Harian Tercatat */}
          <div className="p-4 sm:px-5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Menu Harian Tercatat</span>
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <div className="font-mono-num text-2xl font-bold text-slate-900">
                  {metrics.menuPct}%
                </div>
                <div className="font-mono-num text-xs text-slate-600">
                  {metrics.totalMenus} / {metrics.workingDaysCount} hari kerja
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${getBarColorClass(
                    metrics.menuPct
                  )}`}
                  style={{ width: `${metrics.menuPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Total {metrics.totalMenus} menu tercatat dari {metrics.daysInMonth} hari kalender.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onAddNewMenu}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Tambah Menu
              </button>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigateTab('kalender')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Cek Kalender
              </button>
            </div>
          </div>

          {/* 2. Foto Dokumentasi Ompreng */}
          <div className="p-4 sm:px-5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Foto Dokumentasi (3:2)</span>
                <Camera className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <div className="font-mono-num text-2xl font-bold text-slate-900">
                  {metrics.photoPct}%
                </div>
                <div className="font-mono-num text-xs text-slate-600">
                  {metrics.photoReadyCount} / {metrics.totalMenus} menu
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${getBarColorClass(
                    metrics.photoPct
                  )}`}
                  style={{ width: `${metrics.photoPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {metrics.totalMenus === 0
                  ? 'Belum ada menu tercatat pada bulan ini.'
                  : metrics.missingPhotoCount === 0
                  ? 'Seluruh hari tercatat sudah memiliki foto ompreng.'
                  : `${metrics.missingPhotoCount} menu belum memiliki foto dokumentasi.`}
              </p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab('rekapan')}
                className={`text-xs font-semibold hover:underline whitespace-nowrap ${getStatusTextClass(
                  metrics.photoPct
                )}`}
              >
                {metrics.totalMenus > 0 && metrics.missingPhotoCount === 0
                  ? 'Siap Cetak PDF →'
                  : 'Lengkapi Foto Baris →'}
              </button>
            </div>
          </div>

          {/* 3. Kelengkapan Nilai Gizi */}
          <div className="p-4 sm:px-5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Rekapan Nilai Gizi</span>
                <Activity className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <div className="font-mono-num text-2xl font-bold text-slate-900">
                  {metrics.giziPct}%
                </div>
                <div className="font-mono-num text-xs text-slate-600">
                  {metrics.nutritionFilledCount} / {metrics.totalMenus} menu
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${getBarColorClass(
                    metrics.giziPct
                  )}`}
                  style={{ width: `${metrics.giziPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Sinkron otomatis antara nama menu harian dengan kalkulasi rata-rata AKG.
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab('gizi')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                Buka Rekapan Nilai Gizi →
              </button>
            </div>
          </div>

          {/* 4. Formulir Keamanan Pangan & Suhu */}
          <div className="p-4 sm:px-5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Form Keamanan Pangan & Suhu</span>
                <ClipboardCheck className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <div className="font-mono-num text-2xl font-bold text-slate-900">
                  {metrics.opsPct}%
                </div>
                <div className="font-mono-num text-xs text-slate-600">
                  {metrics.activeFormModules} / 4 form aktif
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${getBarColorClass(
                    metrics.opsPct
                  )}`}
                  style={{ width: `${metrics.opsPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 font-mono-num">
                Sampel ({sampleRows.length}) · Ruang ({tempRooms.length}) · Freezer ({freezerMachines.length}) · Makanan ({metrics.foodTempFilledCount})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab('makanan')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
              >
                <Utensils className="h-3 w-3" />
                Suhu Makanan
              </button>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigateTab('sampel')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Sampel
              </button>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigateTab('suhu')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Suhu Ruang
              </button>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onNavigateTab('freezer')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Freezer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
