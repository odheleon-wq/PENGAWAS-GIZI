import React, { useMemo, useState } from 'react';
import { CalendarPlus, Check, Edit3, RotateCcw, Settings2 } from 'lucide-react';
import {
  TARGET_CATEGORIES,
  computeMonthlyNutritionSummary,
  getCombinedCategoryTitle,
  getDefaultCombinedAkg,
} from '../constants/nutritionCategories';
import type {
  AkgTargetsConfig,
  DailyMenuEntry,
  SppgUserProfile,
  TargetCategoryId,
} from '../types';
import {
  formatIndonesianFullDate,
  getPeriodeLabel,
  parseMonthKey,
} from '../utils/dateUtils';
import { resolveDocumentLogos } from '../utils/logoResolver';

interface RekapanGiziViewProps {
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  includeYearInPeriod: boolean;
  selectedCategories: TargetCategoryId[];
  akgTargets?: AkgTargetsConfig;
  onChangeCategories: (next: TargetCategoryId[]) => void;
  onSaveAkgTargets: (nextAkg: AkgTargetsConfig) => Promise<void>;
  onEditEntryNutrition: (entry: DailyMenuEntry) => void;
  onAddNewMenu: () => void;
}

export const RekapanGiziView: React.FC<RekapanGiziViewProps> = ({
  profile,
  monthKey,
  entries,
  includeYearInPeriod,
  selectedCategories,
  akgTargets,
  onChangeCategories,
  onSaveAkgTargets,
  onEditEntryNutrition,
  onAddNewMenu,
}) => {
  const [showAkgEditor, setShowAkgEditor] = useState(false);
  const [savingAkg, setSavingAkg] = useState(false);

  const defaultCombinedAkg = useMemo(
    () => getDefaultCombinedAkg(selectedCategories),
    [selectedCategories]
  );

  const [draftAkg, setDraftAkg] = useState<AkgTargetsConfig>(() => ({
    energi: akgTargets?.energi ?? defaultCombinedAkg.energi,
    protein: akgTargets?.protein ?? defaultCombinedAkg.protein,
    lemak: akgTargets?.lemak ?? defaultCombinedAkg.lemak,
    karbohidrat: akgTargets?.karbohidrat ?? defaultCombinedAkg.karbohidrat,
    serat: akgTargets?.serat ?? defaultCombinedAkg.serat,
    targetOrang: akgTargets?.targetOrang ?? 0,
    customTitle: akgTargets?.customTitle || '',
  }));

  const summary = useMemo(
    () => computeMonthlyNutritionSummary(entries, selectedCategories, akgTargets),
    [entries, selectedCategories, akgTargets]
  );

  const categoryTitle = useMemo(
    () => getCombinedCategoryTitle(selectedCategories, akgTargets?.customTitle),
    [selectedCategories, akgTargets?.customTitle]
  );

  const { year, month } = parseMonthKey(monthKey);
  const periodeText = getPeriodeLabel(year, month, includeYearInPeriod);

  const toggleCategory = (id: TargetCategoryId) => {
    const exists = selectedCategories.includes(id);
    if (exists) {
      if (selectedCategories.length === 1) return; // minimal 1 kategori aktif
      onChangeCategories(selectedCategories.filter((c) => c !== id));
    } else {
      onChangeCategories([...selectedCategories, id]);
    }
  };

  const handleOpenAkgEditor = () => {
    setDraftAkg({
      energi: akgTargets?.energi ?? defaultCombinedAkg.energi,
      protein: akgTargets?.protein ?? defaultCombinedAkg.protein,
      lemak: akgTargets?.lemak ?? defaultCombinedAkg.lemak,
      karbohidrat: akgTargets?.karbohidrat ?? defaultCombinedAkg.karbohidrat,
      serat: akgTargets?.serat ?? defaultCombinedAkg.serat,
      targetOrang: akgTargets?.targetOrang ?? summary.targetOrang,
      customTitle: akgTargets?.customTitle || '',
    });
    setShowAkgEditor((v) => !v);
  };

  const handleSaveAkg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAkg(true);
    try {
      await onSaveAkgTargets(draftAkg);
      setShowAkgEditor(false);
    } finally {
      setSavingAkg(false);
    }
  };

  const handleResetAkgToDefault = async () => {
    const fresh = getDefaultCombinedAkg(selectedCategories);
    const next: AkgTargetsConfig = {
      ...fresh,
      targetOrang: 0,
      customTitle: '',
    };
    setDraftAkg(next);
    setSavingAkg(true);
    try {
      await onSaveAkgTargets(next);
      setShowAkgEditor(false);
    } finally {
      setSavingAkg(false);
    }
  };

  const fmt1 = (n: number) => n.toFixed(1);
  const resolvedLogos = useMemo(() => resolveDocumentLogos(profile, 'gizi'), [profile]);
  const metaRows: Array<[string, string]> = [
    ['Nama SPPG', profile.namaSppg || 'Belum diisi'],
    ['ID SPPG', profile.idSppg || 'Belum diisi'],
    ['Alamat', profile.alamat || 'Belum diisi'],
    ['Kab/Kota', profile.kabKota || 'Belum diisi'],
    ['Provinsi', profile.provinsi || 'Belum diisi'],
    ['Nama SPPI/AG', profile.namaSppi || 'Belum diisi'],
    ['Nomor Handphone', profile.nomorHp || 'Belum diisi'],
    ['Periode/Bulan', periodeText],
  ];

  const getComplianceStyle = (pct: number): React.CSSProperties => {
    if (pct >= 90 && pct <= 110) {
      return { backgroundColor: '#92D050', color: '#000000' };
    }
    return { backgroundColor: '#FF0000', color: '#000000' };
  };

  return (
    <div className="space-y-5">
      {/* Kelompok Sasaran Selector & Free Combiner Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pilih & Gabungkan Kelompok Sasaran (Otomatis Hitung Rata-Rata)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Centang 1 kategori atau gabungkan beberapa kategori sekaligus sesuai kebutuhan. Tabel di bawah otomatis tersinkron dengan Nama Menu dan menghitung rata-rata nilai gizi gabungan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onChangeCategories(TARGET_CATEGORIES.map((c) => c.id))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Gabung Semua (12)
            </button>
            <button
              type="button"
              onClick={handleOpenAkgEditor}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings2 className="h-3.5 w-3.5 text-emerald-600" />
              Atur AKG & Judul
            </button>
          </div>
        </div>

        {/* 12 Kelompok Sasaran Multi-Select Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {TARGET_CATEGORIES.map((cat) => {
            const active = selectedCategories.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Live Average Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-slate-100 pt-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Rata-Rata Energi</div>
            <div className="font-mono-num text-sm font-bold text-slate-900">
              {fmt1(summary.averages.energi)} <span className="text-xs font-normal text-slate-500">kkal</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Rata-Rata Protein</div>
            <div className="font-mono-num text-sm font-bold text-slate-900">
              {fmt1(summary.averages.protein)} <span className="text-xs font-normal text-slate-500">g</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Rata-Rata Lemak</div>
            <div className="font-mono-num text-sm font-bold text-slate-900">
              {fmt1(summary.averages.lemak)} <span className="text-xs font-normal text-slate-500">g</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Rata-Rata Karbo</div>
            <div className="font-mono-num text-sm font-bold text-slate-900">
              {fmt1(summary.averages.karbohidrat)} <span className="text-xs font-normal text-slate-500">g</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Rata-Rata Serat</div>
            <div className="font-mono-num text-sm font-bold text-slate-900">
              {fmt1(summary.averages.serat)} <span className="text-xs font-normal text-slate-500">g</span>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-slate-500">Hari Terisi Gizi</div>
            <div className="font-mono-num text-sm font-bold text-emerald-700">
              {summary.dayCounts.energi} / {summary.rows.length} Hari
            </div>
          </div>
        </div>

        {/* Inline AKG & Custom Title Settings */}
        {showAkgEditor && (
          <form
            onSubmit={handleSaveAkg}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Pengaturan Rujukan AKG 20-25% & Judul Laporan Gizi
              </h3>
              <button
                type="button"
                onClick={handleResetAkgToDefault}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Standar Kategori
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Judul Kategori Kustom (Opsional — kosongkan untuk otomatis)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={draftAkg.customTitle || ''}
                  onChange={(e) => setDraftAkg((p) => ({ ...p, customTitle: e.target.value }))}
                  placeholder="Misal: BALITA 12-23 BULAN/BALITA atau GABUNGAN SD & SMP"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Target Manfaat (Orang)
                </label>
                <input
                  type="number"
                  min={0}
                  value={draftAkg.targetOrang || ''}
                  placeholder="Otomatis"
                  onChange={(e) =>
                    setDraftAkg((p) => ({ ...p, targetOrang: Math.max(0, Number(e.target.value)) }))
                  }
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Energi (kkal)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={draftAkg.energi}
                  onChange={(e) =>
                    setDraftAkg((p) => ({ ...p, energi: Math.max(0, Number(e.target.value)) }))
                  }
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Protein (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={draftAkg.protein}
                  onChange={(e) =>
                    setDraftAkg((p) => ({ ...p, protein: Math.max(0, Number(e.target.value)) }))
                  }
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Lemak (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={draftAkg.lemak}
                  onChange={(e) =>
                    setDraftAkg((p) => ({ ...p, lemak: Math.max(0, Number(e.target.value)) }))
                  }
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Karbohidrat (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={draftAkg.karbohidrat}
                  onChange={(e) =>
                    setDraftAkg((p) => ({
                      ...p,
                      karbohidrat: Math.max(0, Number(e.target.value)),
                    }))
                  }
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Serat (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={draftAkg.serat}
                  onChange={(e) =>
                    setDraftAkg((p) => ({ ...p, serat: Math.max(0, Number(e.target.value)) }))
                  }
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAkgEditor(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={savingAkg}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingAkg ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Exact Spreadsheet Format Preview Matching image_de80e8df.png */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto p-4 sm:p-6">
          <div className="min-w-[960px] border border-black bg-white text-black">
            {(resolvedLogos.leftUrl || resolvedLogos.rightUrl) && (
              <div className="relative border-b border-black bg-white px-4 py-2.5 text-center min-h-[72px] flex flex-col justify-center">
                {resolvedLogos.leftUrl && (
                  <img
                    src={resolvedLogos.leftUrl}
                    alt="Logo Kiri"
                    style={{ width: `${resolvedLogos.leftWidthPx}px`, height: 'auto', maxHeight: '68px' }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
                  />
                )}
                {resolvedLogos.rightUrl && (
                  <img
                    src={resolvedLogos.rightUrl}
                    alt="Logo Kanan"
                    style={{ width: `${resolvedLogos.rightWidthPx}px`, height: 'auto', maxHeight: '68px' }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
                  />
                )}
                <div className="px-20">
                  <div className="text-[11px] font-bold uppercase text-black">BADAN GIZI NASIONAL</div>
                  <div className="text-[11px] font-bold uppercase text-black">
                    SATUAN PELAYANAN PEMENUHAN GIZI
                  </div>
                  <div className="text-[11px] font-bold uppercase text-black">
                    {profile.namaSppg || 'SPPG'}
                  </div>
                </div>
              </div>
            )}

            {/* Green Banner */}
            <div
              style={{ backgroundColor: '#00B050' }}
              className="border-b border-black px-4 py-2 text-center text-[15px] font-bold tracking-wide text-black uppercase"
            >
              REKAPAN NILAI GIZI {categoryTitle.toUpperCase()}
            </div>

            {/* Metadata Block */}
            <div className="border-b border-black bg-white px-2.5 py-2 text-[12.5px] leading-[1.45] font-bold text-black">
              {metaRows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[210px_14px_1fr] items-baseline">
                  <span>{label}</span>
                  <span>:</span>
                  <span className="break-words">{value}</span>
                </div>
              ))}
            </div>

            {/* Nutrition Table */}
            <table className="w-full border-collapse text-[12px] text-black">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="w-[175px] border-r border-b border-black px-2 py-1.5 text-center font-bold"
                  >
                    Hari / Tanggal
                  </th>
                  <th
                    rowSpan={2}
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="border-r border-b border-black px-3 py-1.5 text-center font-bold"
                  >
                    Nama Menu
                  </th>
                  <th
                    colSpan={5}
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="border-r border-b border-black px-2 py-1 text-center font-bold"
                  >
                    Data Nilai Gizi {categoryTitle}
                  </th>
                  <th
                    rowSpan={2}
                    style={{ backgroundColor: '#00B050' }}
                    className="w-[92px] border-r border-b border-black px-2 py-1.5 text-center font-bold leading-tight"
                  >
                    Jumlah
                    <br />
                    Manfaat
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[68px] border-b border-black bg-slate-100 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-600"
                  >
                    Isi Gizi
                  </th>
                </tr>
                <tr>
                  <th
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="w-[74px] border-r border-b border-black px-1.5 py-1 text-center font-bold leading-tight"
                  >
                    Energi
                    <br />
                    (kkal)
                  </th>
                  <th
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="w-[74px] border-r border-b border-black px-1.5 py-1 text-center font-bold leading-tight"
                  >
                    Protein
                    <br />
                    (gram)
                  </th>
                  <th
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="w-[74px] border-r border-b border-black px-1.5 py-1 text-center font-bold leading-tight"
                  >
                    Lemak
                    <br />
                    (gram)
                  </th>
                  <th
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="w-[82px] border-r border-b border-black px-1.5 py-1 text-center font-bold leading-tight"
                  >
                    Karbohidrat
                    <br />
                    (gram)
                  </th>
                  <th
                    style={{ backgroundColor: '#8AB4F8' }}
                    className="w-[70px] border-r border-b border-black px-1.5 py-1 text-center font-bold leading-tight"
                  >
                    Serat
                    <br />
                    (gram)
                  </th>
                </tr>
              </thead>

              <tbody>
                {summary.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <div className="mx-auto flex max-w-md flex-col items-center">
                        <CalendarPlus className="mb-2.5 h-8 w-8 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">
                          Belum ada daftar menu pada bulan {periodeText}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Tambahkan menu harian terlebih dahulu — nama menu dan tanggal akan otomatis muncul di tabel Nilai Gizi ini.
                        </p>
                        <button
                          type="button"
                          onClick={onAddNewMenu}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Tambah Menu Pertama
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {summary.rows.map(({ entry, values }) => (
                      <tr
                        key={entry.id}
                        onClick={() => onEditEntryNutrition(entry)}
                        className="cursor-pointer border-b border-black transition-colors hover:bg-emerald-50/40"
                      >
                        <td className="border-r border-black px-2.5 py-2.5 text-left align-middle">
                          {formatIndonesianFullDate(entry.dateIso)}
                        </td>
                        <td className="border-r border-black px-2.5 py-2.5 text-left align-middle leading-snug whitespace-pre-line">
                          {entry.namaMenu}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-2.5 text-center align-middle">
                          {fmt1(values.energi)}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-2.5 text-center align-middle">
                          {fmt1(values.protein)}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-2.5 text-center align-middle">
                          {fmt1(values.lemak)}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-2.5 text-center align-middle">
                          {fmt1(values.karbohidrat)}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-2.5 text-center align-middle">
                          {fmt1(values.serat)}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-2.5 text-center align-middle">
                          {Math.round(values.jumlahManfaat)}
                        </td>
                        <td className="bg-slate-50/70 px-2 py-2 text-center align-middle">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditEntryNutrition(entry);
                            }}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
                            title="Input / Ubah Nilai Gizi"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* Summary Footer Row 1: Total Nilai Gizi */}
                    <tr className="border-b border-black font-bold">
                      <td
                        colSpan={2}
                        style={{ backgroundColor: '#00B050' }}
                        className="border-r border-black px-2.5 py-1.5 text-left"
                      >
                        Total Nilai Gizi
                      </td>
                      <td
                        style={{ backgroundColor: '#00B050' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.totals.energi)}
                      </td>
                      <td
                        style={{ backgroundColor: '#00B050' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.totals.protein)}
                      </td>
                      <td
                        style={{ backgroundColor: '#00B050' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.totals.lemak)}
                      </td>
                      <td
                        style={{ backgroundColor: '#00B050' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.totals.karbohidrat)}
                      </td>
                      <td
                        style={{ backgroundColor: '#00B050' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.totals.serat)}
                      </td>
                      <td className="font-mono-num border-r border-black bg-white px-2 py-1.5 text-center">
                        {Math.round(summary.totals.jumlahManfaat)}
                      </td>
                      <td className="bg-slate-100" rowSpan={5} />
                    </tr>

                    {/* Summary Footer Row 2: Jumlah Hari */}
                    <tr
                      style={{ backgroundColor: '#92D050' }}
                      className="border-b border-black font-bold"
                    >
                      <td colSpan={2} className="border-r border-black px-2.5 py-1.5 text-left">
                        Jumlah Hari
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1.5 text-center">
                        {summary.dayCounts.energi} Hari
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1.5 text-center">
                        {summary.dayCounts.protein} Hari
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1.5 text-center">
                        {summary.dayCounts.lemak} Hari
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1.5 text-center">
                        {summary.dayCounts.karbohidrat} Hari
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1.5 text-center">
                        {summary.dayCounts.serat} Hari
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1.5 text-center">
                        {summary.dayCounts.jumlahManfaat} Hari
                      </td>
                    </tr>

                    {/* Summary Footer Row 3: Nilai Rata-Rata */}
                    <tr className="border-b border-black font-bold">
                      <td
                        colSpan={2}
                        style={{ backgroundColor: '#FFFF00' }}
                        className="border-r border-black px-2.5 py-1.5 text-left"
                      >
                        Nilai Rata-Rata
                      </td>
                      <td
                        style={{ backgroundColor: '#FFFF00' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.averages.energi)}
                      </td>
                      <td
                        style={{ backgroundColor: '#FFFF00' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.averages.protein)}
                      </td>
                      <td
                        style={{ backgroundColor: '#FFFF00' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.averages.lemak)}
                      </td>
                      <td
                        style={{ backgroundColor: '#FFFF00' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.averages.karbohidrat)}
                      </td>
                      <td
                        style={{ backgroundColor: '#FFFF00' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {fmt1(summary.averages.serat)}
                      </td>
                      <td
                        rowSpan={3}
                        style={{ backgroundColor: '#92D050' }}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center align-middle"
                      >
                        {summary.targetOrang} Orang
                      </td>
                    </tr>

                    {/* Summary Footer Row 4: Rujukan AKG 20-25% */}
                    <tr className="border-b border-black font-bold">
                      <td
                        colSpan={2}
                        style={{ backgroundColor: '#92D050' }}
                        className="border-r border-black px-2.5 py-1.5 text-left"
                      >
                        Rujukan AKG 20-25%
                      </td>
                      <td className="font-mono-num border-r border-black bg-white px-2 py-1.5 text-center">
                        {fmt1(summary.akgRef.energi)}
                      </td>
                      <td className="font-mono-num border-r border-black bg-white px-2 py-1.5 text-center">
                        {fmt1(summary.akgRef.protein)}
                      </td>
                      <td className="font-mono-num border-r border-black bg-white px-2 py-1.5 text-center">
                        {fmt1(summary.akgRef.lemak)}
                      </td>
                      <td className="font-mono-num border-r border-black bg-white px-2 py-1.5 text-center">
                        {fmt1(summary.akgRef.karbohidrat)}
                      </td>
                      <td className="font-mono-num border-r border-black bg-white px-2 py-1.5 text-center">
                        {fmt1(summary.akgRef.serat)}
                      </td>
                    </tr>

                    {/* Summary Footer Row 5: % Kebutuhan 90-110% */}
                    <tr className="font-bold">
                      <td
                        colSpan={2}
                        style={{ backgroundColor: '#92D050' }}
                        className="border-r border-black px-2.5 py-1.5 text-left"
                      >
                        % Kebutuhan 90-110%
                      </td>
                      <td
                        style={getComplianceStyle(summary.percentAkg.energi)}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {Math.round(summary.percentAkg.energi)}%
                      </td>
                      <td
                        style={getComplianceStyle(summary.percentAkg.protein)}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {Math.round(summary.percentAkg.protein)}%
                      </td>
                      <td
                        style={getComplianceStyle(summary.percentAkg.lemak)}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {Math.round(summary.percentAkg.lemak)}%
                      </td>
                      <td
                        style={getComplianceStyle(summary.percentAkg.karbohidrat)}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {Math.round(summary.percentAkg.karbohidrat)}%
                      </td>
                      <td
                        style={getComplianceStyle(summary.percentAkg.serat)}
                        className="font-mono-num border-r border-black px-2 py-1.5 text-center"
                      >
                        {Math.round(summary.percentAkg.serat)}%
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
