import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Edit3,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { TARGET_CATEGORIES } from '../constants/nutritionCategories';
import { getDefaultDailyPmRecord } from '../services/sppgService';
import type {
  DailyMenuEntry,
  DailyPmRecord,
  PmCategoryOrSampleId,
  PmSpecificRow,
  SppgUserProfile,
  TargetCategoryId,
} from '../types';
import { formatIndonesianFullDate, getTodayIso } from '../utils/dateUtils';
import { computePmSummary } from '../utils/foodCostCalculator';
import { resolveDocumentLogos } from '../utils/logoResolver';
import { useAutoSave } from '../hooks/useAutoSave';
import {
  clearScopedDraftBackup,
  loadScopedDraftBackup,
} from '../utils/sessionStorage';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';

interface UpdatePmViewProps {
  uid: string;
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  pmRecords: DailyPmRecord[];
  activeDateIso: string;
  onChangeDateIso: (dateIso: string) => void;
  onSaveRecord: (
    record: Omit<DailyPmRecord, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
  onExportPdf: (record: DailyPmRecord, viewMode: 'specific' | 'summary' | 'both') => void;
}

function guessCategoriesForSchool(nama: string): {
  besar: TargetCategoryId;
  kecil: TargetCategoryId;
} {
  const upper = nama.toUpperCase();
  if (upper.includes('SMA') || upper.includes('SMK') || upper.includes('MA ')) {
    return { besar: 'sma_smk', kecil: 'sd_1_3' };
  }
  if (upper.includes('SMP') || upper.includes('MTS')) {
    return { besar: 'smp_mts', kecil: 'sd_1_3' };
  }
  if (upper.includes('PAUD') || upper.includes('TK') || upper.includes('KB ')) {
    return { besar: 'sd_4_6', kecil: 'tk_paud_lb' };
  }
  if (upper.includes('SD') || upper.includes('MI ')) {
    return { besar: 'sd_4_6', kecil: 'sd_1_3' };
  }
  if (upper.includes('BALITA')) {
    return { besar: 'sd_4_6', kecil: 'anak_balita' };
  }
  return { besar: 'sd_4_6', kecil: 'tk_paud_lb' };
}

function serializePmRecord(r: DailyPmRecord): string {
  return JSON.stringify({
    dateIso: r.dateIso,
    hariKe: r.hariKe,
    headerLine1: r.headerLine1,
    headerLine2: r.headerLine2,
    headerLine3: r.headerLine3,
    headerAlamat: r.headerAlamat,
    titleSpecific: r.titleSpecific,
    titleSummary: r.titleSummary,
    logoDataUrl: r.logoDataUrl,
    logoWidthPx: r.logoWidthPx,
    logoRightDataUrl: r.logoRightDataUrl,
    logoRightWidthPx: r.logoRightWidthPx,
    followGlobalLeftLogo: r.followGlobalLeftLogo,
    followGlobalRightLogo: r.followGlobalRightLogo,
    specificRows: r.specificRows,
    summaryOverrides: r.summaryOverrides,
  });
}

export const UpdatePmView: React.FC<UpdatePmViewProps> = ({
  uid,
  profile,
  monthKey,
  entries,
  pmRecords,
  activeDateIso,
  onChangeDateIso,
  onSaveRecord,
  onSyncGlobalLeftLogo,
  onExportPdf,
}) => {
  const subViewStorageKey = `sppg_pm_subview_v1:${uid}`;
  const [subView, setSubView] = useState<'specific' | 'summary' | 'both'>(() => {
    try {
      const saved = window.localStorage.getItem(`sppg_pm_subview_v1:${uid}`);
      if (saved === 'specific' || saved === 'summary' || saved === 'both') {
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return 'specific';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(subViewStorageKey, subView);
    } catch {
      // Ignore storage error
    }
  }, [subViewStorageKey, subView]);

  const [showHeaderEdit, setShowHeaderEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);

  const matchedEntry = useMemo(
    () => entries.find((e) => e.dateIso === activeDateIso) || null,
    [entries, activeDateIso]
  );

  const existingRecord = useMemo(
    () => pmRecords.find((r) => r.dateIso === activeDateIso) || null,
    [pmRecords, activeDateIso]
  );

  const serverBase = useMemo(
    () =>
      existingRecord ||
      getDefaultDailyPmRecord(
        uid,
        monthKey,
        activeDateIso,
        matchedEntry?.hariKe || 1,
        profile
      ),
    [existingRecord, uid, monthKey, activeDateIso, matchedEntry?.hariKe, profile]
  );

  const serverHash = useMemo(() => serializePmRecord(serverBase), [serverBase]);
  const scopeKey = `update_pm:${monthKey}:${activeDateIso}`;

  const [draft, setDraft] = useState<DailyPmRecord>(() => {
    const recovered = loadScopedDraftBackup<DailyPmRecord>(uid, scopeKey);
    return recovered || serverBase;
  });

  const lastScopeRef = useRef<string>(scopeKey);
  const lastServerHashRef = useRef<string>(serverHash);
  const currentDraftRef = useRef<DailyPmRecord>(draft);
  currentDraftRef.current = draft;

  useEffect(() => {
    const scopeChanged = lastScopeRef.current !== scopeKey;
    if (scopeChanged) {
      lastScopeRef.current = scopeKey;
      const recovered = loadScopedDraftBackup<DailyPmRecord>(uid, scopeKey);
      setDraft(recovered || serverBase);
      lastServerHashRef.current = serverHash;
      return;
    }

    const isClean = serializePmRecord(currentDraftRef.current) === lastServerHashRef.current;
    if (isClean) {
      setDraft(serverBase);
    }
    lastServerHashRef.current = serverHash;
  }, [scopeKey, uid, serverBase, serverHash]);

  const {
    status: autoSaveStatus,
    lastSavedAtLabel,
    errorMessage: autoSaveError,
    markSynced,
  } = useAutoSave<DailyPmRecord>({
    value: draft,
    serverHash,
    scopeKey,
    uid,
    serialize: serializePmRecord,
    onSave: async (val) => {
      await onSaveRecord({
        dateIso: val.dateIso,
        hariKe: val.hariKe,
        headerLine1: val.headerLine1,
        headerLine2: val.headerLine2,
        headerLine3: val.headerLine3,
        headerAlamat: val.headerAlamat,
        titleSpecific: val.titleSpecific,
        titleSummary: val.titleSummary,
        logoDataUrl: val.logoDataUrl,
        logoWidthPx: val.logoWidthPx,
        logoRightDataUrl: val.logoRightDataUrl,
        logoRightWidthPx: val.logoRightWidthPx,
        followGlobalLeftLogo: val.followGlobalLeftLogo,
        followGlobalRightLogo: val.followGlobalRightLogo,
        specificRows: val.specificRows,
        summaryOverrides: val.summaryOverrides,
      });
    },
  });

  const pmSummary = useMemo(() => computePmSummary(draft), [draft]);

  const resolvedLogos = useMemo(
    () => resolveDocumentLogos(profile, 'update_pm', draft),
    [profile, draft]
  );

  const latestOtherRecord = useMemo(() => {
    const others = pmRecords.filter(
      (r) => r.dateIso !== activeDateIso && (r.specificRows.length > 0 || Object.keys(r.summaryOverrides || {}).length > 0)
    );
    return others[others.length - 1] || null;
  }, [pmRecords, activeDateIso]);

  const persistDraft = async (next: DailyPmRecord) => {
    setDraft(next);
    setSaving(true);
    try {
      await onSaveRecord({
        dateIso: next.dateIso,
        hariKe: next.hariKe,
        headerLine1: next.headerLine1,
        headerLine2: next.headerLine2,
        headerLine3: next.headerLine3,
        headerAlamat: next.headerAlamat,
        titleSpecific: next.titleSpecific,
        titleSummary: next.titleSummary,
        logoDataUrl: next.logoDataUrl,
        logoWidthPx: next.logoWidthPx,
        logoRightDataUrl: next.logoRightDataUrl,
        logoRightWidthPx: next.logoRightWidthPx,
        followGlobalLeftLogo: next.followGlobalLeftLogo,
        followGlobalRightLogo: next.followGlobalRightLogo,
        specificRows: next.specificRows,
        summaryOverrides: next.summaryOverrides,
      });
      markSynced(serializePmRecord(next));
      clearScopedDraftBackup(uid, scopeKey);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSpecificRow = () => {
    const nextOrder = draft.specificRows.length + 1;
    const newRow: PmSpecificRow = {
      id: `pmr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      rowOrder: nextOrder,
      namaSekolah: '',
      porsiBesarCategoryId: 'sd_4_6',
      porsiKecilCategoryId: 'sd_1_3',
      tanpaAlergiBesar: 0,
      tanpaAlergiKecil: 0,
      dietAlergiBesar: 0,
      dietAlergiKecil: 0,
    };
    const next = { ...draft, specificRows: [...draft.specificRows, newRow] };
    void persistDraft(next);
  };

  const handleUpdateSpecificRow = (rowId: string, patch: Partial<PmSpecificRow>) => {
    const nextRows = draft.specificRows.map((row) => {
      if (row.id !== rowId) return row;
      const updated = { ...row, ...patch };
      if (patch.namaSekolah !== undefined && !row.namaSekolah) {
        const g = guessCategoriesForSchool(patch.namaSekolah);
        updated.porsiBesarCategoryId = g.besar;
        updated.porsiKecilCategoryId = g.kecil;
      }
      return updated;
    });
    setDraft({ ...draft, specificRows: nextRows });
  };

  const handleBlurSpecificSave = () => {
    void persistDraft(draft);
  };

  const handleDeleteSpecificRow = (rowId: string) => {
    const filtered = draft.specificRows
      .filter((r) => r.id !== rowId)
      .map((r, i) => ({ ...r, rowOrder: i + 1 }));
    void persistDraft({ ...draft, specificRows: filtered });
  };

  const handleUpdateSummaryOverride = (
    catId: PmCategoryOrSampleId,
    field: 'tanpaAlergiBesar' | 'tanpaAlergiKecil' | 'dietAlergiBesar' | 'dietAlergiKecil',
    rawValue: string
  ) => {
    const trimmed = rawValue.trim();
    const nextOverrides = { ...(draft.summaryOverrides || {}) };
    const currentCat = { ...(nextOverrides[catId] || {}) };
    if (trimmed === '') {
      delete currentCat[field];
    } else {
      const n = Math.max(0, Math.round(Number(trimmed) || 0));
      currentCat[field] = n;
    }
    if (Object.keys(currentCat).length === 0) {
      delete nextOverrides[catId];
    } else {
      nextOverrides[catId] = currentCat;
    }
    setDraft({ ...draft, summaryOverrides: nextOverrides });
  };

  const handleResetCategoryOverride = (catId: PmCategoryOrSampleId) => {
    const nextOverrides = { ...(draft.summaryOverrides || {}) };
    delete nextOverrides[catId];
    void persistDraft({ ...draft, summaryOverrides: nextOverrides });
  };

  const handleCopyFromPreviousDay = () => {
    if (!latestOtherRecord) return;
    const next: DailyPmRecord = {
      ...draft,
      specificRows: latestOtherRecord.specificRows.map((r, idx) => ({
        ...r,
        id: `pmr_${Date.now().toString(36)}_${idx}`,
        rowOrder: idx + 1,
      })),
      summaryOverrides: { ...latestOtherRecord.summaryOverrides },
    };
    void persistDraft(next);
  };

  const handleApplyLogoModal = async ({
    dataUrl,
    widthPx,
    syncAsGlobalBgn,
  }: {
    dataUrl: string;
    widthPx: number;
    syncAsGlobalBgn?: boolean;
  }) => {
    if (logoModalSide === 'left') {
      if (syncAsGlobalBgn && onSyncGlobalLeftLogo) {
        await onSyncGlobalLeftLogo(dataUrl, widthPx);
      }
      await persistDraft({
        ...draft,
        logoDataUrl: dataUrl,
        logoWidthPx: widthPx,
        followGlobalLeftLogo: syncAsGlobalBgn ? true : false,
      });
    } else if (logoModalSide === 'right') {
      await persistDraft({
        ...draft,
        logoRightDataUrl: dataUrl,
        logoRightWidthPx: widthPx,
        followGlobalRightLogo: false,
      });
    }
  };

  const specTotals = useMemo(() => {
    return draft.specificRows.reduce(
      (acc, r) => {
        const b1 = Number(r.tanpaAlergiBesar) || 0;
        const k1 = Number(r.tanpaAlergiKecil) || 0;
        const b2 = Number(r.dietAlergiBesar) || 0;
        const k2 = Number(r.dietAlergiKecil) || 0;
        acc.b1 += b1;
        acc.k1 += k1;
        acc.b2 += b2;
        acc.k2 += k2;
        acc.total += b1 + k1 + b2 + k2;
        return acc;
      },
      { b1: 0, k1: 0, b2: 0, k2: 0, total: 0 }
    );
  }, [draft.specificRows]);

  const dateChoices = useMemo(() => {
    const set = new Set<string>(entries.map((e) => e.dateIso));
    pmRecords.forEach((r) => set.add(r.dateIso));
    if (activeDateIso) set.add(activeDateIso);
    return Array.from(set).sort();
  }, [entries, pmRecords, activeDateIso]);

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Update PM (Data Spesifik & Rekap Penerima Manfaat)
            </h2>
            <p className="text-xs text-slate-500">
              Isi daftar sekolah/lembaga per tanggal. Sistem otomatis merekap ke 13 kelompok sasaran & menyuplai Jumlah Manfaat ke menu Nilai Gizi & Food Cost serta PO Bahan Baku.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AutoSaveIndicator
              status={autoSaveStatus}
              lastSavedAtLabel={lastSavedAtLabel}
              errorMessage={autoSaveError}
            />
            <button
              type="button"
              onClick={() => setShowHeaderEdit((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="h-3.5 w-3.5 text-emerald-600" />
              Edit Kop & Judul
            </button>
            <button
              type="button"
              onClick={() => persistDraft(draft)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Data PM'}
            </button>
            <button
              type="button"
              onClick={() => onExportPdf(draft, subView)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Cetak PDF F4
            </button>
          </div>
        </div>

        {/* Date Picker & View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-700">Tanggal:</label>
            <input
              type="date"
              value={activeDateIso}
              onChange={(e) => e.target.value && onChangeDateIso(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
            />
            {dateChoices.length > 0 && (
              <select
                value={activeDateIso}
                onChange={(e) => onChangeDateIso(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              >
                {dateChoices.map((d) => {
                  const ent = entries.find((x) => x.dateIso === d);
                  return (
                    <option key={d} value={d}>
                      {ent ? `Hari ${ent.hariKe} · ` : ''}
                      {formatIndonesianFullDate(d)}
                    </option>
                  );
                })}
              </select>
            )}
            {latestOtherRecord && (
              <button
                type="button"
                onClick={handleCopyFromPreviousDay}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Copy className="h-3.5 w-3.5" />
                Salin dari {formatIndonesianFullDate(latestOtherRecord.dateIso)}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSubView('specific')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                subView === 'specific' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Update Data Spesifik
            </button>
            <button
              type="button"
              onClick={() => setSubView('summary')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                subView === 'summary' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Rekap 13 Kelompok Sasaran
            </button>
            <button
              type="button"
              onClick={() => setSubView('both')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                subView === 'both' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tampilkan Keduanya
            </button>
          </div>
        </div>

        {/* Editable Kop & Header Panel */}
        {showHeaderEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Baris Kop 1
              </label>
              <input
                type="text"
                value={draft.headerLine1}
                onChange={(e) => setDraft({ ...draft, headerLine1: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Baris Kop 2
              </label>
              <input
                type="text"
                value={draft.headerLine2}
                onChange={(e) => setDraft({ ...draft, headerLine2: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Baris Kop 3 (Nama SPPG)
              </label>
              <input
                type="text"
                value={draft.headerLine3}
                onChange={(e) => setDraft({ ...draft, headerLine3: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Alamat Kop
              </label>
              <input
                type="text"
                value={draft.headerAlamat}
                onChange={(e) => setDraft({ ...draft, headerAlamat: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Pengaturan Logo Kiri &amp; Kanan
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLogoModalSide('left')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3 w-3 text-emerald-600" />
                  Kiri ({resolvedLogos.leftWidthPx}px)
                </button>
                <button
                  type="button"
                  onClick={() => setLogoModalSide('right')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3 w-3 text-blue-600" />
                  Kanan ({resolvedLogos.rightWidthPx}px)
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-600">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.followGlobalLeftLogo !== false}
                    onChange={(e) =>
                      void persistDraft({ ...draft, followGlobalLeftLogo: e.target.checked })
                    }
                    className="rounded accent-emerald-600"
                  />
                  Ikuti BGN Global
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.followGlobalRightLogo !== false}
                    onChange={(e) =>
                      void persistDraft({ ...draft, followGlobalRightLogo: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  Ikuti Kanan Global
                </label>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Judul Data Spesifik
              </label>
              <input
                type="text"
                value={draft.titleSpecific}
                onChange={(e) => setDraft({ ...draft, titleSpecific: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Judul Rekap Penerima Manfaat
              </label>
              <input
                type="text"
                value={draft.titleSummary}
                onChange={(e) => setDraft({ ...draft, titleSummary: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => persistDraft(draft)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Terapkan Perubahan Kop
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SHEET 1: UPDATE DATA SPESIFIK (Image 2) */}
      {(subView === 'specific' || subView === 'both') && (
        <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-xs">
          {/* Kop */}
          <div className="relative border-b border-black px-4 py-3 text-center min-h-[82px] flex flex-col justify-center">
            {resolvedLogos.leftUrl && (
              <img
                src={resolvedLogos.leftUrl}
                alt="Logo BGN"
                style={{ width: `${resolvedLogos.leftWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                className="absolute left-4 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
            {resolvedLogos.rightUrl && (
              <img
                src={resolvedLogos.rightUrl}
                alt="Logo Kanan"
                style={{ width: `${resolvedLogos.rightWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                className="absolute right-4 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
            <div className="px-20">
              <div className="text-xs font-bold uppercase tracking-wide text-black">
                {draft.headerLine1}
              </div>
              <div className="text-xs font-bold uppercase tracking-wide text-black">
                {draft.headerLine2}
              </div>
              <div className="text-xs font-bold uppercase tracking-wide text-black">
                {draft.headerLine3}
              </div>
              <div className="mt-0.5 text-[11px] italic underline text-black">
                {draft.headerAlamat}
              </div>
              <div className="mt-2 text-base font-extrabold uppercase tracking-wide text-black">
                {draft.titleSpecific}
              </div>
            </div>
          </div>

          {/* Yellow Date Strip */}
          <div
            className="border-b border-black px-3 py-1.5 text-center text-xs font-bold text-black"
            style={{ backgroundColor: '#CCFF00' }}
          >
            {formatIndonesianFullDate(draft.dateIso || getTodayIso())}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs text-black">
              <thead>
                <tr>
                  <th
                    colSpan={2}
                    className="border border-black px-2 py-1.5 text-center font-bold"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    DATA PENERIMA KELOMPOK SASARAN
                  </th>
                  <th
                    colSpan={4}
                    className="border border-black px-2 py-1.5 text-center font-bold"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    JUMLAH PENERIMA MANFAAT
                  </th>
                  <th
                    rowSpan={3}
                    className="border border-black px-2 py-1.5 text-center font-bold w-28"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    TOTAL PENERIMA MANFAAT
                  </th>
                  <th
                    rowSpan={3}
                    className="border border-black px-2 py-1.5 text-center font-bold bg-slate-100 w-56"
                  >
                    Pemetaan Kelompok Sasaran & Aksi
                  </th>
                </tr>
                <tr>
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1.5 text-center font-bold w-10"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    No.
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1.5 text-center font-bold min-w-[200px]"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Kelompok Sasaran / Sekolah / Lembaga
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-2 py-1 text-center font-bold"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Tanpa Alergi
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-2 py-1 text-center font-bold"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    Diet/Alergi
                  </th>
                </tr>
                <tr>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Porsi Besar
                  </th>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Porsi Kecil
                  </th>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    Porsi Besar
                  </th>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    Porsi Kecil
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.specificRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="border border-black px-4 py-8 text-center text-slate-500"
                    >
                      Belum ada daftar sekolah/lembaga untuk tanggal ini. Klik{' '}
                      <strong>+ Tambah Sekolah / Lembaga</strong> di bawah atau salin dari hari sebelumnya.
                    </td>
                  </tr>
                ) : (
                  draft.specificRows.map((row, idx) => {
                    const rowTotal =
                      (Number(row.tanpaAlergiBesar) || 0) +
                      (Number(row.tanpaAlergiKecil) || 0) +
                      (Number(row.dietAlergiBesar) || 0) +
                      (Number(row.dietAlergiKecil) || 0);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="border border-black px-2 py-1 text-center font-mono-num">
                          {idx + 1}
                        </td>
                        <td className="border border-black p-0.5">
                          <input
                            type="text"
                            value={row.namaSekolah}
                            onChange={(e) =>
                              handleUpdateSpecificRow(row.id, { namaSekolah: e.target.value })
                            }
                            onBlur={handleBlurSpecificSave}
                            placeholder="Nama Sekolah / Paud / Posyandu..."
                            className="w-full px-2 py-1 text-xs focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border border-black p-0.5">
                          <input
                            type="number"
                            min={0}
                            value={row.tanpaAlergiBesar || ''}
                            onChange={(e) =>
                              handleUpdateSpecificRow(row.id, {
                                tanpaAlergiBesar: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            onBlur={handleBlurSpecificSave}
                            className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border border-black p-0.5">
                          <input
                            type="number"
                            min={0}
                            value={row.tanpaAlergiKecil || ''}
                            onChange={(e) =>
                              handleUpdateSpecificRow(row.id, {
                                tanpaAlergiKecil: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            onBlur={handleBlurSpecificSave}
                            className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border border-black p-0.5">
                          <input
                            type="number"
                            min={0}
                            value={row.dietAlergiBesar || ''}
                            onChange={(e) =>
                              handleUpdateSpecificRow(row.id, {
                                dietAlergiBesar: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            onBlur={handleBlurSpecificSave}
                            className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-amber-50 focus:outline-none"
                          />
                        </td>
                        <td className="border border-black p-0.5">
                          <input
                            type="number"
                            min={0}
                            value={row.dietAlergiKecil || ''}
                            onChange={(e) =>
                              handleUpdateSpecificRow(row.id, {
                                dietAlergiKecil: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            onBlur={handleBlurSpecificSave}
                            className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-amber-50 focus:outline-none"
                          />
                        </td>
                        <td className="border border-black px-2 py-1 text-center font-bold font-mono-num bg-slate-50">
                          {rowTotal > 0 ? rowTotal : '-'}
                        </td>
                        <td className="border border-black px-1.5 py-1 bg-slate-50">
                          <div className="flex items-center gap-1">
                            <div className="flex-1 space-y-1">
                              <select
                                title="Kategori Porsi Besar"
                                value={row.porsiBesarCategoryId}
                                onChange={(e) => {
                                  handleUpdateSpecificRow(row.id, {
                                    porsiBesarCategoryId: e.target.value as TargetCategoryId,
                                  });
                                }}
                                onBlur={handleBlurSpecificSave}
                                className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                              >
                                {TARGET_CATEGORIES.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    Besar: {c.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                title="Kategori Porsi Kecil"
                                value={row.porsiKecilCategoryId}
                                onChange={(e) => {
                                  handleUpdateSpecificRow(row.id, {
                                    porsiKecilCategoryId: e.target.value as TargetCategoryId,
                                  });
                                }}
                                onBlur={handleBlurSpecificSave}
                                className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                              >
                                {TARGET_CATEGORIES.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    Kecil: {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteSpecificRow(row.id)}
                              className="rounded p-1 text-rose-600 hover:bg-rose-50"
                              title="Hapus baris"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                {/* Sub. Total Footer */}
                <tr className="font-bold">
                  <td
                    colSpan={2}
                    className="border border-black px-3 py-1.5 text-center"
                    style={{ backgroundColor: '#FFFF00' }}
                  >
                    Sub. Total (Data Spesifik)
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    {specTotals.b1}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    {specTotals.k1}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    {specTotals.b2}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    {specTotals.k2}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#FFFF00' }}
                  >
                    {specTotals.total}
                  </td>
                  <td className="border border-black px-2 py-1 bg-slate-100 text-center">
                    <button
                      type="button"
                      onClick={handleAddSpecificRow}
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                    >
                      <Plus className="h-3 w-3" />
                      Tambah Sekolah / Lembaga
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SHEET 2: UPDATE DATA PENERIMA MANFAAT (13 Groups - Image 4) */}
      {(subView === 'summary' || subView === 'both') && (
        <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-xs">
          <div className="relative border-b border-black px-4 py-3 text-center min-h-[82px] flex flex-col justify-center">
            {resolvedLogos.leftUrl && (
              <img
                src={resolvedLogos.leftUrl}
                alt="Logo BGN"
                style={{ width: `${resolvedLogos.leftWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                className="absolute left-4 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
            {resolvedLogos.rightUrl && (
              <img
                src={resolvedLogos.rightUrl}
                alt="Logo Kanan"
                style={{ width: `${resolvedLogos.rightWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                className="absolute right-4 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
            <div className="px-20">
              <div className="text-xs font-bold uppercase tracking-wide text-black">
                {draft.headerLine1}
              </div>
              <div className="text-xs font-bold uppercase tracking-wide text-black">
                {draft.headerLine2}
              </div>
              <div className="text-xs font-bold uppercase tracking-wide text-black">
                {draft.headerLine3}
              </div>
              <div className="mt-0.5 text-[11px] italic underline text-black">
                {draft.headerAlamat}
              </div>
              <div className="mt-2 text-base font-extrabold uppercase tracking-wide text-black">
                {draft.titleSummary}
              </div>
            </div>
          </div>

          <div
            className="border-b border-black px-3 py-1.5 text-center text-xs font-bold text-black"
            style={{ backgroundColor: '#CCFF00' }}
          >
            {formatIndonesianFullDate(draft.dateIso || getTodayIso())}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs text-black">
              <thead>
                <tr>
                  <th
                    colSpan={2}
                    className="border border-black px-2 py-1.5 text-center font-bold"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    DATA PENERIMA KELOMPOK SASARAN
                  </th>
                  <th
                    colSpan={4}
                    className="border border-black px-2 py-1.5 text-center font-bold"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    JUMLAH PENERIMA MANFAAT
                  </th>
                  <th
                    rowSpan={3}
                    className="border border-black px-2 py-1.5 text-center font-bold w-28"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    TOTAL PENERIMA MANFAAT
                  </th>
                  <th
                    rowSpan={3}
                    className="border border-black px-2 py-1.5 text-center font-bold bg-slate-100 w-24"
                  >
                    Sumber
                  </th>
                </tr>
                <tr>
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1.5 text-center font-bold w-10"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    No.
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-black px-2 py-1.5 text-center font-bold min-w-[220px]"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Kelompok Sasaran
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-2 py-1 text-center font-bold"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Tanpa Alergi
                  </th>
                  <th
                    colSpan={2}
                    className="border border-black px-2 py-1 text-center font-bold"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    Diet/Alergi
                  </th>
                </tr>
                <tr>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Porsi Besar
                  </th>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    Porsi Kecil
                  </th>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    Porsi Besar
                  </th>
                  <th
                    className="border border-black px-2 py-1 text-center font-bold w-24"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    Porsi Kecil
                  </th>
                </tr>
              </thead>
              <tbody>
                {pmSummary.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="border border-black px-2 py-1 text-center font-mono-num">
                      {row.no}
                    </td>
                    <td className="border border-black px-3 py-1 font-medium">
                      {row.label}
                    </td>
                    <td className="border border-black p-0.5">
                      <input
                        type="number"
                        min={0}
                        value={row.tanpaAlergiBesar === 0 ? '' : row.tanpaAlergiBesar}
                        placeholder={
                          row.fromSpecific.tanpaAlergiBesar > 0
                            ? String(row.fromSpecific.tanpaAlergiBesar)
                            : ''
                        }
                        onChange={(e) =>
                          handleUpdateSummaryOverride(row.id, 'tanpaAlergiBesar', e.target.value)
                        }
                        onBlur={handleBlurSpecificSave}
                        className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-emerald-50 focus:outline-none"
                      />
                    </td>
                    <td className="border border-black p-0.5">
                      <input
                        type="number"
                        min={0}
                        value={row.tanpaAlergiKecil === 0 ? '' : row.tanpaAlergiKecil}
                        placeholder={
                          row.fromSpecific.tanpaAlergiKecil > 0
                            ? String(row.fromSpecific.tanpaAlergiKecil)
                            : ''
                        }
                        onChange={(e) =>
                          handleUpdateSummaryOverride(row.id, 'tanpaAlergiKecil', e.target.value)
                        }
                        onBlur={handleBlurSpecificSave}
                        className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-emerald-50 focus:outline-none"
                      />
                    </td>
                    <td className="border border-black p-0.5">
                      <input
                        type="number"
                        min={0}
                        value={row.dietAlergiBesar === 0 ? '' : row.dietAlergiBesar}
                        placeholder={
                          row.fromSpecific.dietAlergiBesar > 0
                            ? String(row.fromSpecific.dietAlergiBesar)
                            : ''
                        }
                        onChange={(e) =>
                          handleUpdateSummaryOverride(row.id, 'dietAlergiBesar', e.target.value)
                        }
                        onBlur={handleBlurSpecificSave}
                        className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-amber-50 focus:outline-none"
                      />
                    </td>
                    <td className="border border-black p-0.5">
                      <input
                        type="number"
                        min={0}
                        value={row.dietAlergiKecil === 0 ? '' : row.dietAlergiKecil}
                        placeholder={
                          row.fromSpecific.dietAlergiKecil > 0
                            ? String(row.fromSpecific.dietAlergiKecil)
                            : ''
                        }
                        onChange={(e) =>
                          handleUpdateSummaryOverride(row.id, 'dietAlergiKecil', e.target.value)
                        }
                        onBlur={handleBlurSpecificSave}
                        className="w-full px-2 py-1 text-center text-xs font-mono-num focus:bg-amber-50 focus:outline-none"
                      />
                    </td>
                    <td className="border border-black px-2 py-1 text-center font-bold font-mono-num bg-slate-50">
                      {row.total > 0 ? row.total : ''}
                    </td>
                    <td className="border border-black px-2 py-1 text-center text-[10px]">
                      {row.hasManualOverride ? (
                        <button
                          type="button"
                          onClick={() => handleResetCategoryOverride(row.id)}
                          className="inline-flex items-center gap-0.5 text-amber-700 hover:text-amber-900 font-semibold"
                          title="Kembalikan hitungan otomatis dari Data Spesifik"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Manual
                        </button>
                      ) : (
                        <span className="text-slate-500">Auto Spesifik</span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Sub. Total Row matching Image 4 */}
                <tr className="font-bold">
                  <td
                    colSpan={2}
                    className="border border-black px-3 py-1.5 text-center"
                    style={{ backgroundColor: '#FFFF00' }}
                  >
                    Sub. Total
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    {pmSummary.subTotal.tanpaAlergiBesar}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#00B050' }}
                  >
                    {pmSummary.subTotal.tanpaAlergiKecil}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    {pmSummary.subTotal.dietAlergiBesar}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#FF6600' }}
                  >
                    {pmSummary.subTotal.dietAlergiKecil}
                  </td>
                  <td
                    className="border border-black px-2 py-1.5 text-center font-mono-num"
                    style={{ backgroundColor: '#FFFF00' }}
                  >
                    {pmSummary.subTotal.total}
                  </td>
                  <td className="border border-black px-2 py-1.5 bg-slate-100 text-center text-[10px]">
                    Sinkron Otomatis
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LogoUploadModal
        open={logoModalSide !== null}
        title={
          logoModalSide === 'left'
            ? 'Atur Logo Kiri (BGN) — Update PM'
            : 'Atur Logo Kanan — Update PM'
        }
        side={logoModalSide || 'left'}
        initialDataUrl={
          logoModalSide === 'left' ? resolvedLogos.leftUrl : resolvedLogos.rightUrl
        }
        initialWidthPx={
          logoModalSide === 'left' ? resolvedLogos.leftWidthPx : resolvedLogos.rightWidthPx
        }
        headerLine1={draft.headerLine1}
        headerLine2={draft.headerLine2}
        headerLine3={draft.headerLine3}
        allowSyncGlobal={Boolean(onSyncGlobalLeftLogo)}
        onClose={() => setLogoModalSide(null)}
        onApply={handleApplyLogoModal}
      />
    </div>
  );
};
