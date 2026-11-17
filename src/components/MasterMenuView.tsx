import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  ImagePlus,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Trash2,
} from 'lucide-react';
import { TARGET_CATEGORIES } from '../constants/nutritionCategories';
import type {
  MasterMenuCycleMode,
  MasterMenuDayCell,
  MasterMenuPlan,
  MasterMenuRowLabels,
  SppgUserProfile,
  TargetCategoryId,
} from '../types';
import { formatIndonesianFullDate, INDONESIAN_MONTHS, parseMonthKey } from '../utils/dateUtils';
import { resolveDocumentLogos } from '../utils/logoResolver';
import {
  DEFAULT_MASTER_MENU_ROW_LABELS,
  formatMasterMenuDefaultTitle,
  generateMasterMenuWeeks,
} from '../utils/masterMenuHelper';
import { getDefaultMasterMenuPlan } from '../services/sppgService';
import { LogoUploadModal } from './LogoUploadModal';

interface MasterMenuViewProps {
  uid: string;
  monthKey: string;
  profile: SppgUserProfile;
  plans: MasterMenuPlan[];
  onSavePlan: (
    plan: Omit<MasterMenuPlan, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string>;
  onDeletePlan: (planId: string) => Promise<void>;
  onSendDaysToFoodCost: (
    plan: MasterMenuPlan,
    days: MasterMenuDayCell[]
  ) => Promise<number>;
  onSyncToRekapan: (plan: MasterMenuPlan) => Promise<number>;
  onExportPdf: (plan: MasterMenuPlan) => void;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
}

const CYCLE_OPTIONS: Array<{ id: MasterMenuCycleMode; label: string; desc: string }> = [
  { id: '1_minggu', label: '1 Minggu', desc: '5 Hari' },
  { id: '2_minggu', label: '2 Minggu', desc: '10 Hari' },
  { id: '3_minggu', label: '3 Minggu', desc: '15 Hari' },
  { id: '4_minggu', label: '4 Minggu', desc: '20 Hari' },
  { id: 'bulanan', label: 'Bulanan (Gabung 4+ Minggu)', desc: '1 Bulan Penuh' },
];

type DishFieldKey =
  | 'makananPokok'
  | 'laukHewani'
  | 'laukNabati'
  | 'sayuran'
  | 'buah'
  | 'susu';

const DISH_ROWS: Array<{
  field: DishFieldKey;
  labelKey: keyof MasterMenuRowLabels;
  placeholder: string;
}> = [
  { field: 'makananPokok', labelKey: 'makananPokok', placeholder: 'Nasi Putih' },
  { field: 'laukHewani', labelKey: 'laukHewani', placeholder: 'Ayam Goreng Kecap / Telur' },
  { field: 'laukNabati', labelKey: 'laukNabati', placeholder: 'Tempe Bacem / Tahu' },
  { field: 'sayuran', labelKey: 'sayuran', placeholder: 'Oseng Kol + Wortel' },
  { field: 'buah', labelKey: 'buah', placeholder: 'Semangka / Pisang' },
  { field: 'susu', labelKey: 'susu', placeholder: 'Susu (opsional)' },
];

export const MasterMenuView: React.FC<MasterMenuViewProps> = ({
  uid,
  monthKey,
  profile,
  plans,
  onSavePlan,
  onDeletePlan,
  onSendDaysToFoodCost,
  onSyncToRekapan,
  onExportPdf,
  onSyncGlobalLeftLogo,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [draft, setDraft] = useState<MasterMenuPlan>(() =>
    getDefaultMasterMenuPlan(uid, monthKey, profile, ['sd_1_3'], '4_minggu')
  );
  const [showKopEditor, setShowKopEditor] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingFoodCost, setSendingFoodCost] = useState(false);
  const [syncingRekapan, setSyncingRekapan] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { year, month } = parseMonthKey(monthKey);
  const monthName = INDONESIAN_MONTHS[month - 1] || 'November';

  useEffect(() => {
    setConfirmDelete(false);
    if (plans.length === 0) {
      setSelectedPlanId('');
      setDraft(getDefaultMasterMenuPlan(uid, monthKey, profile, ['sd_1_3'], '4_minggu'));
      return;
    }
    const existing = plans.find((p) => p.id === selectedPlanId) || plans[0];
    setSelectedPlanId(existing.id);
    setDraft({
      ...existing,
      rowLabels: {
        ...DEFAULT_MASTER_MENU_ROW_LABELS,
        ...(existing.rowLabels || {}),
      },
    });
  }, [plans, monthKey, uid]);

  const resolvedLogos = useMemo(
    () =>
      resolveDocumentLogos(profile, 'master_menu', {
        logoDataUrl: draft.logoDataUrl,
        logoWidthPx: draft.logoWidthPx,
        logoRightDataUrl: draft.logoRightDataUrl,
        logoRightWidthPx: draft.logoRightWidthPx,
        followGlobalLeftLogo: draft.followGlobalLeftLogo,
        followGlobalRightLogo: draft.followGlobalRightLogo,
      }),
    [profile, draft]
  );

  const handleSelectPlan = (id: string) => {
    setConfirmDelete(false);
    setNoticeMsg(null);
    setErrorMsg(null);
    const found = plans.find((p) => p.id === id);
    if (found) {
      setSelectedPlanId(found.id);
      setDraft({
        ...found,
        rowLabels: {
          ...DEFAULT_MASTER_MENU_ROW_LABELS,
          ...(found.rowLabels || {}),
        },
      });
    }
  };

  const handleCreateNewDraft = () => {
    setConfirmDelete(false);
    setNoticeMsg(null);
    setErrorMsg(null);
    const next = getDefaultMasterMenuPlan(uid, monthKey, profile, ['sd_1_3'], '4_minggu');
    setSelectedPlanId(next.id);
    setDraft(next);
  };

  const handleCycleChange = (newMode: MasterMenuCycleMode) => {
    setDraft((prev) => {
      const nextWeeks = generateMasterMenuWeeks(monthKey, newMode, prev.weeks);
      const nextTitle = formatMasterMenuDefaultTitle(prev.categoryIds, newMode, monthKey);
      return {
        ...prev,
        cycleMode: newMode,
        title: nextTitle,
        weeks: nextWeeks,
      };
    });
  };

  const handleToggleCategory = (catId: TargetCategoryId) => {
    setDraft((prev) => {
      const exists = prev.categoryIds.includes(catId);
      let nextCats = exists
        ? prev.categoryIds.filter((id) => id !== catId)
        : [...prev.categoryIds, catId];
      if (nextCats.length === 0) {
        nextCats = [catId];
      }
      return {
        ...prev,
        categoryIds: nextCats,
        title: formatMasterMenuDefaultTitle(nextCats, prev.cycleMode, monthKey),
      };
    });
  };

  const handleSelectAllCategories = () => {
    const allIds = TARGET_CATEGORIES.map((c) => c.id);
    setDraft((prev) => ({
      ...prev,
      categoryIds: allIds,
      title: formatMasterMenuDefaultTitle(allIds, prev.cycleMode, monthKey),
    }));
  };

  const handleRegenerateDates = () => {
    setDraft((prev) => ({
      ...prev,
      weeks: generateMasterMenuWeeks(monthKey, prev.cycleMode, prev.weeks),
    }));
    setNoticeMsg(`Tanggal hari kerja (Senin–Jumat) untuk ${monthName} ${year} berhasil disusun ulang.`);
  };

  const handleUpdateCell = (
    weekIdx: number,
    dayIdx: number,
    patch: Partial<MasterMenuDayCell>
  ) => {
    setDraft((prev) => {
      const nextWeeks = prev.weeks.map((w, wi) => {
        if (wi !== weekIdx) return w;
        return {
          ...w,
          days: w.days.map((d, di) => (di !== dayIdx ? d : { ...d, ...patch })),
        };
      });
      return { ...prev, weeks: nextWeeks };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNoticeMsg(null);
    setErrorMsg(null);
    try {
      const savedId = await onSavePlan({
        id: draft.id,
        title: draft.title,
        categoryIds: draft.categoryIds,
        cycleMode: draft.cycleMode,
        headerLine1: draft.headerLine1,
        headerLine2: draft.headerLine2,
        headerLine3: draft.headerLine3,
        headerAlamat: draft.headerAlamat,
        logoDataUrl: draft.logoDataUrl,
        logoWidthPx: draft.logoWidthPx,
        logoRightDataUrl: draft.logoRightDataUrl,
        logoRightWidthPx: draft.logoRightWidthPx,
        followGlobalLeftLogo: draft.followGlobalLeftLogo,
        followGlobalRightLogo: draft.followGlobalRightLogo,
        rowLabels: draft.rowLabels,
        weeks: draft.weeks,
      });
      setSelectedPlanId(savedId);
      setDraft((prev) => ({ ...prev, id: savedId }));
      setNoticeMsg('Master Menu berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan Master Menu.');
    } finally {
      setSaving(false);
    }
  };

  const allDays = useMemo(() => {
    const out: MasterMenuDayCell[] = [];
    draft.weeks.forEach((w) => {
      w.days.forEach((d) => out.push(d));
    });
    return out;
  }, [draft.weeks]);

  const filledDaysCount = useMemo(
    () =>
      allDays.filter(
        (d) =>
          d.makananPokok.trim() ||
          d.laukHewani.trim() ||
          d.laukNabati.trim() ||
          d.sayuran.trim() ||
          d.buah.trim() ||
          d.susu.trim()
      ).length,
    [allDays]
  );

  const handleSendAllToFoodCost = async () => {
    const targets = allDays.filter(
      (d) =>
        d.dateIso &&
        (d.makananPokok.trim() ||
          d.laukHewani.trim() ||
          d.laukNabati.trim() ||
          d.sayuran.trim() ||
          d.buah.trim() ||
          d.susu.trim())
    );
    if (targets.length === 0) {
      setErrorMsg('Isi minimal satu hari menu terlebih dahulu sebelum mengirim ke Nilai Gizi & Food Cost.');
      return;
    }
    setSendingFoodCost(true);
    setNoticeMsg(null);
    setErrorMsg(null);
    try {
      const savedId = await onSavePlan({
        id: draft.id,
        title: draft.title,
        categoryIds: draft.categoryIds,
        cycleMode: draft.cycleMode,
        headerLine1: draft.headerLine1,
        headerLine2: draft.headerLine2,
        headerLine3: draft.headerLine3,
        headerAlamat: draft.headerAlamat,
        logoDataUrl: draft.logoDataUrl,
        logoWidthPx: draft.logoWidthPx,
        logoRightDataUrl: draft.logoRightDataUrl,
        logoRightWidthPx: draft.logoRightWidthPx,
        followGlobalLeftLogo: draft.followGlobalLeftLogo,
        followGlobalRightLogo: draft.followGlobalRightLogo,
        rowLabels: draft.rowLabels,
        weeks: draft.weeks,
      });
      const updatedPlan = { ...draft, id: savedId };
      setSelectedPlanId(savedId);
      setDraft(updatedPlan);
      const count = await onSendDaysToFoodCost(updatedPlan, targets);
      setNoticeMsg(
        `${count} lembar kerja harian berhasil dikirim ke panel Nilai Gizi & Food Cost dengan rujukan TKPI 2020 otomatis.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim ke Nilai Gizi & Food Cost.');
    } finally {
      setSendingFoodCost(false);
    }
  };

  const handleSendSingleDayToFoodCost = async (day: MasterMenuDayCell) => {
    setSendingFoodCost(true);
    setNoticeMsg(null);
    setErrorMsg(null);
    try {
      const count = await onSendDaysToFoodCost(draft, [day]);
      setNoticeMsg(
        `Menu ${day.dayLabel || day.dateIso} (MENU ${day.menuNumber}) berhasil dikirim ke Nilai Gizi & Food Cost (${count} hari diperbarui).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim hari ke Nilai Gizi & Food Cost.');
    } finally {
      setSendingFoodCost(false);
    }
  };

  const handleSyncRekapan = async () => {
    setSyncingRekapan(true);
    setNoticeMsg(null);
    setErrorMsg(null);
    try {
      const count = await onSyncToRekapan(draft);
      setNoticeMsg(`${count} hari menu berhasil disinkronkan ke tabel Rekapan Menu.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal sinkron ke Rekapan Menu.');
    } finally {
      setSyncingRekapan(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!draft.id || draft.id.startsWith('mm_draft_')) return;
    await onDeletePlan(draft.id);
    setConfirmDelete(false);
    setNoticeMsg('Master Menu dihapus.');
  };

  return (
    <div className="space-y-4">
      {/* Control Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Master Menu ({monthName} {year})
            </h2>
            <p className="text-xs text-slate-500">
              Susun Master Menu 1–4 minggu atau gabungan bulanan per kelompok sasaran, lalu kirim otomatis ke Nilai Gizi &amp; Food Cost atau Rekapan Menu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {plans.length > 0 && (
              <select
                value={selectedPlanId}
                onChange={(e) => handleSelectPlan(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 max-w-[260px]"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleCreateNewDraft}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-600" />
              Buat Master Menu Baru
            </button>

            {!draft.id.startsWith('mm_draft_') && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus
              </button>
            )}

            {confirmDelete && (
              <div className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs">
                <span className="text-rose-800 font-medium">Yakin hapus?</span>
                <button
                  type="button"
                  onClick={handleDeleteCurrent}
                  className="rounded bg-rose-600 px-2 py-0.5 text-white font-semibold hover:bg-rose-700"
                >
                  Ya
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded bg-white px-2 py-0.5 text-slate-700 border border-slate-300"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cycle + Title + Actions Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          <div className="lg:col-span-5 space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Pilih Siklus Master Menu
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CYCLE_OPTIONS.map((opt) => {
                const active = draft.cycleMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleCycleChange(opt.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Judul Banner Master Menu
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder="MASTER MENU 20 HARI 1-3 SD"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-3 flex items-end gap-2">
            <button
              type="button"
              onClick={handleRegenerateDates}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
              Susun Tgl Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => setShowKopEditor((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                showKopEditor
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Kop &amp; Logo
            </button>
          </div>
        </div>

        {/* Beneficiary Target Categories Multi-select */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Kategori Kelompok Sasaran Penerima Manfaat (Pilih Bebas / Gabung)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllCategories}
                className="text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                Gabungkan Semua Kategori
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    title: formatMasterMenuDefaultTitle(prev.categoryIds, prev.cycleMode, monthKey),
                  }))
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
              >
                <RefreshCw className="h-3 w-3" />
                Reset Judul Sesuai Kategori
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TARGET_CATEGORIES.map((cat) => {
              const selected = draft.categoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleToggleCategory(cat.id)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {selected && <Check className="h-3 w-3 text-emerald-600" />}
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kop & Logo Editor Drawer */}
        {showKopEditor && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Baris Kop 1
                </label>
                <input
                  type="text"
                  value={draft.headerLine1}
                  onChange={(e) => setDraft((p) => ({ ...p, headerLine1: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Baris Kop 2
                </label>
                <input
                  type="text"
                  value={draft.headerLine2}
                  onChange={(e) => setDraft((p) => ({ ...p, headerLine2: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Baris Kop 3 (Nama SPPG)
                </label>
                <input
                  type="text"
                  value={draft.headerLine3}
                  onChange={(e) => setDraft((p) => ({ ...p, headerLine3: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Alamat Kop
                </label>
                <input
                  type="text"
                  value={draft.headerAlamat}
                  onChange={(e) => setDraft((p) => ({ ...p, headerAlamat: e.target.value }))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              {/* Left Logo Control */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-800">
                    Logo Kiri (BGN · {resolvedLogos.leftWidthPx}px)
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.followGlobalLeftLogo !== false}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, followGlobalLeftLogo: e.target.checked }))
                      }
                      className="rounded accent-emerald-600"
                    />
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3 w-3 text-emerald-600" />
                      Ikut Logo BGN Pusat
                    </span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setLogoModalSide('left')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Atur Logo Kiri
                </button>
              </div>

              {/* Right Logo Control */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-800">
                    Logo Kanan (Unit · {resolvedLogos.rightWidthPx}px)
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.followGlobalRightLogo !== false}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, followGlobalRightLogo: e.target.checked }))
                      }
                      className="rounded accent-emerald-600"
                    />
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3 w-3 text-emerald-600" />
                      Ikut Logo Kanan Pusat
                    </span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setLogoModalSide('right')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Atur Logo Kanan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Primary Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
          <div className="text-xs text-slate-600">
            Terisi{' '}
            <span className="font-mono-num font-bold text-slate-900">
              {filledDaysCount} / {allDays.length}
            </span>{' '}
            hari menu · Sasaran:{' '}
            <span className="font-semibold text-emerald-700">
              {draft.categoryIds.length} kategori
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={sendingFoodCost}
              onClick={handleSendAllToFoodCost}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              {sendingFoodCost ? 'Mengirim...' : 'Kirim Semua ke Nilai Gizi & Food Cost'}
            </button>

            <button
              type="button"
              disabled={syncingRekapan}
              onClick={handleSyncRekapan}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {syncingRekapan ? 'Menyinkron...' : 'Sinkron ke Rekapan Menu'}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Master Menu'}
            </button>

            <button
              type="button"
              onClick={() => onExportPdf(draft)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <FileDown className="h-3.5 w-3.5" />
              Unduh PDF F4
            </button>
          </div>
        </div>

        {noticeMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            {noticeMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Spreadsheet Preview & Inline Editor matching image_5acc1d6b.png */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5 overflow-x-auto">
        <div className="min-w-[980px] border border-black bg-white text-black">
          {/* Kop Header */}
          <div className="relative flex items-center justify-center px-16 py-3 border-b border-black bg-white min-h-[82px]">
            {resolvedLogos.leftUrl ? (
              <img
                src={resolvedLogos.leftUrl}
                alt="Logo Kiri"
                style={{ width: `${resolvedLogos.leftWidthPx}px`, height: 'auto', maxHeight: '74px' }}
                className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
              />
            ) : (
              <div
                style={{
                  width: `${resolvedLogos.leftWidthPx}px`,
                  height: `${resolvedLogos.leftWidthPx}px`,
                  maxHeight: '64px',
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border-2 border-blue-900 flex items-center justify-center text-[10px] font-bold text-blue-900"
              >
                BGN
              </div>
            )}

            <div className="text-center leading-tight space-y-0.5">
              <div className="text-sm font-bold uppercase tracking-wide">
                {draft.headerLine1 || 'BADAN GIZI NASIONAL'}
              </div>
              <div className="text-sm font-bold uppercase tracking-wide">
                {draft.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI'}
              </div>
              <div className="text-sm font-bold uppercase tracking-wide">
                {draft.headerLine3 || profile.namaSppg || 'SPPG'}
              </div>
              <div className="text-xs italic underline">
                {draft.headerAlamat || `Alamat : ${profile.alamat || '-'}`}
              </div>
            </div>

            {resolvedLogos.rightUrl && (
              <img
                src={resolvedLogos.rightUrl}
                alt="Logo Kanan"
                style={{ width: `${resolvedLogos.rightWidthPx}px`, height: 'auto', maxHeight: '74px' }}
                className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
          </div>

          {/* Vibrant Green Master Menu Banner */}
          <div className="bg-[#00B050] border-b border-black px-3 py-2 text-center">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              className="w-full bg-transparent text-center text-base font-bold uppercase text-black focus:outline-none"
            />
          </div>

          {/* Stacked Week Tables */}
          {draft.weeks.map((week, weekIdx) => (
            <table key={week.id} className="w-full border-collapse table-fixed text-xs">
              <thead>
                <tr className="bg-[#FFFF00] border-b border-black">
                  <th className="w-[155px] border-r border-black px-2 py-1.5 text-center font-bold">
                    <input
                      type="text"
                      value={draft.rowLabels.kelompokHeader}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          rowLabels: { ...p.rowLabels, kelompokHeader: e.target.value },
                        }))
                      }
                      className="w-full bg-transparent text-center font-bold text-black focus:outline-none"
                    />
                  </th>
                  {week.days.map((day, dayIdx) => (
                    <th
                      key={day.id}
                      className="border-r last:border-r-0 border-black px-1.5 py-1 text-center font-bold align-middle"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="text"
                          value={day.dayLabel}
                          onChange={(e) =>
                            handleUpdateCell(weekIdx, dayIdx, { dayLabel: e.target.value })
                          }
                          className="w-full bg-transparent text-center font-bold text-black focus:outline-none text-[11px]"
                        />
                        <div className="flex items-center justify-center gap-1 print:hidden">
                          <input
                            type="date"
                            value={day.dateIso}
                            onChange={(e) => {
                              const newIso = e.target.value;
                              handleUpdateCell(weekIdx, dayIdx, {
                                dateIso: newIso,
                                dayLabel: newIso ? formatIndonesianFullDate(newIso) : day.dayLabel,
                              });
                            }}
                            className="font-mono-num rounded border border-amber-400/70 bg-amber-50/80 px-1 py-0 text-[10px] font-normal text-slate-700"
                            title="Ubah tanggal"
                          />
                          <button
                            type="button"
                            onClick={() => handleSendSingleDayToFoodCost(day)}
                            disabled={sendingFoodCost}
                            title="Kirim menu hari ini ke Nilai Gizi & Food Cost"
                            className="inline-flex items-center gap-0.5 rounded bg-emerald-700 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Send className="h-2.5 w-2.5" />
                            Food Cost
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {DISH_ROWS.map((rowMeta) => (
                  <tr key={rowMeta.field} className="border-b border-black bg-white">
                    <td className="border-r border-black px-2 py-1 font-bold text-left align-middle">
                      <input
                        type="text"
                        value={draft.rowLabels[rowMeta.labelKey]}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            rowLabels: {
                              ...p.rowLabels,
                              [rowMeta.labelKey]: e.target.value,
                            },
                          }))
                        }
                        className="w-full bg-transparent font-bold text-black focus:outline-none text-[11px]"
                      />
                    </td>
                    {week.days.map((day, dayIdx) => (
                      <td
                        key={`${day.id}_${rowMeta.field}`}
                        className="border-r last:border-r-0 border-black p-0 align-middle"
                      >
                        <textarea
                          rows={1}
                          value={day[rowMeta.field]}
                          onChange={(e) =>
                            handleUpdateCell(weekIdx, dayIdx, {
                              [rowMeta.field]: e.target.value,
                            })
                          }
                          placeholder={rowMeta.placeholder}
                          className="w-full min-h-[26px] resize-none bg-transparent px-1.5 py-1 text-center text-[11px] font-semibold text-black placeholder:text-slate-300 placeholder:font-normal focus:bg-emerald-50/50 focus:outline-none leading-tight"
                        />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Green Footer Row: Minggu Ke- N | MENU 1..5 */}
                <tr className="bg-[#00B050] border-b border-black font-bold">
                  <td className="border-r border-black px-2 py-1.5 text-center">
                    <input
                      type="text"
                      value={week.weekLabel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((p) => ({
                          ...p,
                          weeks: p.weeks.map((w, wi) =>
                            wi === weekIdx ? { ...w, weekLabel: val } : w
                          ),
                        }));
                      }}
                      className="w-full bg-transparent text-center font-bold text-black focus:outline-none text-[11px]"
                    />
                  </td>
                  {week.days.map((day, dayIdx) => (
                    <td
                      key={`${day.id}_footer`}
                      className="border-r last:border-r-0 border-black px-2 py-1.5 text-center"
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-black">
                        <span>MENU</span>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={day.menuNumber}
                          onChange={(e) =>
                            handleUpdateCell(weekIdx, dayIdx, {
                              menuNumber: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="font-mono-num w-9 bg-transparent text-center font-bold text-black focus:outline-none"
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          ))}
        </div>
      </div>

      {/* Pre-Apply Width Logo Modal */}
      <LogoUploadModal
        open={logoModalSide !== null}
        side={logoModalSide || 'left'}
        title={
          logoModalSide === 'left'
            ? 'Atur Logo Kiri (BGN) — Master Menu'
            : 'Atur Logo Kanan — Master Menu'
        }
        initialDataUrl={
          logoModalSide === 'left'
            ? resolvedLogos.leftUrl
            : resolvedLogos.rightUrl
        }
        initialWidthPx={
          logoModalSide === 'left'
            ? resolvedLogos.leftWidthPx
            : resolvedLogos.rightWidthPx
        }
        headerLine1={draft.headerLine1}
        headerLine2={draft.headerLine2}
        headerLine3={draft.headerLine3}
        allowSyncGlobal={logoModalSide === 'left' && Boolean(onSyncGlobalLeftLogo)}
        onClose={() => setLogoModalSide(null)}
        onApply={async ({ dataUrl, widthPx, syncAsGlobalBgn }) => {
          if (logoModalSide === 'left') {
            if (syncAsGlobalBgn && onSyncGlobalLeftLogo) {
              await onSyncGlobalLeftLogo(dataUrl, widthPx);
              setDraft((p) => ({
                ...p,
                logoDataUrl: dataUrl,
                logoWidthPx: widthPx,
                followGlobalLeftLogo: true,
              }));
              setNoticeMsg(`Logo BGN (${widthPx}px) disinkronkan ke seluruh lembar kerja yang terhubung.`);
            } else {
              setDraft((p) => ({
                ...p,
                logoDataUrl: dataUrl,
                logoWidthPx: widthPx,
                followGlobalLeftLogo: false,
              }));
            }
          } else if (logoModalSide === 'right') {
            setDraft((p) => ({
              ...p,
              logoRightDataUrl: dataUrl,
              logoRightWidthPx: widthPx,
              followGlobalRightLogo: false,
            }));
          }
        }}
      />
    </div>
  );
};
