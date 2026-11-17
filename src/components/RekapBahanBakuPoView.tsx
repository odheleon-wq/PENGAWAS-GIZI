import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  FileText,
  PackageCheck,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import { getDefaultRawMaterialRecapDayConfig } from '../services/sppgService';
import type {
  DailyMenuEntry,
  DailyPmRecord,
  FoodCostDayPlan,
  RawMaterialRecapDayConfig,
  SppgUserProfile,
} from '../types';
import { formatIndonesianFullDate } from '../utils/dateUtils';
import {
  computePmSummary,
  computeRawMaterialRecap,
} from '../utils/foodCostCalculator';
import { resolveDocumentLogos } from '../utils/logoResolver';
import { useAutoSave } from '../hooks/useAutoSave';
import {
  clearScopedDraftBackup,
  loadScopedDraftBackup,
} from '../utils/sessionStorage';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';

interface RekapBahanBakuPoViewProps {
  uid: string;
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  pmRecords: DailyPmRecord[];
  foodCostPlans: FoodCostDayPlan[];
  poRecaps: RawMaterialRecapDayConfig[];
  activeDateIso: string;
  initialSubTab?: 'rekap' | 'po' | 'both';
  onChangeDateIso: (dateIso: string) => void;
  onSaveRecapConfig: (
    cfg: Omit<RawMaterialRecapDayConfig, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
  onExportPdf: (
    recapConfig: RawMaterialRecapDayConfig,
    foodCostPlan: FoodCostDayPlan | null,
    pmRecord: DailyPmRecord | null,
    mode: 'rekap' | 'po' | 'both'
  ) => void;
}

function fmtNum(n: number, decimals = 1): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toFixed(decimals);
}

function fmtRp(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '-';
  return Math.round(n).toLocaleString('id-ID');
}

function serializeRecapConfig(cfg: RawMaterialRecapDayConfig): string {
  return JSON.stringify({
    dateIso: cfg.dateIso,
    hariKe: cfg.hariKe,
    headerLine1: cfg.headerLine1,
    headerLine2: cfg.headerLine2,
    headerLine3: cfg.headerLine3,
    headerAlamat: cfg.headerAlamat,
    logoDataUrl: cfg.logoDataUrl,
    logoWidthPx: cfg.logoWidthPx,
    logoRightDataUrl: cfg.logoRightDataUrl,
    logoRightWidthPx: cfg.logoRightWidthPx,
    followGlobalLeftLogo: cfg.followGlobalLeftLogo,
    followGlobalRightLogo: cfg.followGlobalRightLogo,
    recapTitle: cfg.recapTitle,
    sideLabel: cfg.sideLabel,
    bufferPercent: cfg.bufferPercent,
    bumbuPercent: cfg.bumbuPercent,
    rabPorsiKecilRate: cfg.rabPorsiKecilRate,
    rabPorsiBesarRate: cfg.rabPorsiBesarRate,
    poJudul: cfg.poJudul,
    poDari: cfg.poDari,
    poKepada: cfg.poKepada,
    poAlamat: cfg.poAlamat,
    poSignerLabel1: cfg.poSignerLabel1,
    poSignerLabel2: cfg.poSignerLabel2,
    poSignerName: cfg.poSignerName,
    itemOverrides: cfg.itemOverrides,
  });
}

export const RekapBahanBakuPoView: React.FC<RekapBahanBakuPoViewProps> = ({
  uid,
  profile,
  monthKey,
  entries,
  pmRecords,
  foodCostPlans,
  poRecaps,
  activeDateIso,
  initialSubTab,
  onChangeDateIso,
  onSaveRecapConfig,
  onSyncGlobalLeftLogo,
  onExportPdf,
}) => {
  const subTabStorageKey = `sppg_po_subtab_v1:${uid}`;
  const [subTab, setSubTab] = useState<'rekap' | 'po' | 'both'>(() => {
    try {
      const saved = window.localStorage.getItem(`sppg_po_subtab_v1:${uid}`);
      if (saved === 'both' || saved === 'rekap' || saved === 'po') {
        if (initialSubTab && initialSubTab !== saved && saved !== 'both') {
          return initialSubTab;
        }
        return saved;
      }
    } catch {
      // Ignore storage error
    }
    return initialSubTab || 'rekap';
  });
  const [showHeaderEdit, setShowHeaderEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(subTabStorageKey, subTab);
    } catch {
      // Ignore storage error
    }
  }, [subTabStorageKey, subTab]);

  const matchedEntry = useMemo(
    () => entries.find((e) => e.dateIso === activeDateIso) || null,
    [entries, activeDateIso]
  );
  const activePmRecord = useMemo(
    () => pmRecords.find((r) => r.dateIso === activeDateIso) || null,
    [pmRecords, activeDateIso]
  );
  const activeFoodCostPlan = useMemo(
    () => foodCostPlans.find((p) => p.dateIso === activeDateIso) || null,
    [foodCostPlans, activeDateIso]
  );
  const existingConfig = useMemo(
    () => poRecaps.find((c) => c.dateIso === activeDateIso) || null,
    [poRecaps, activeDateIso]
  );

  const serverBase = useMemo(
    () =>
      existingConfig ||
      getDefaultRawMaterialRecapDayConfig(
        uid,
        monthKey,
        activeDateIso,
        matchedEntry?.hariKe || 1,
        profile
      ),
    [existingConfig, uid, monthKey, activeDateIso, matchedEntry?.hariKe, profile]
  );

  const serverHash = useMemo(() => serializeRecapConfig(serverBase), [serverBase]);
  const scopeKey = `po_recap:${monthKey}:${activeDateIso}`;

  const [draft, setDraft] = useState<RawMaterialRecapDayConfig>(() => {
    const recovered = loadScopedDraftBackup<RawMaterialRecapDayConfig>(uid, scopeKey);
    return recovered || serverBase;
  });

  const lastScopeRef = useRef<string>(scopeKey);
  const lastServerHashRef = useRef<string>(serverHash);
  const currentDraftRef = useRef<RawMaterialRecapDayConfig>(draft);
  currentDraftRef.current = draft;

  useEffect(() => {
    const scopeChanged = lastScopeRef.current !== scopeKey;
    if (scopeChanged) {
      lastScopeRef.current = scopeKey;
      const recovered = loadScopedDraftBackup<RawMaterialRecapDayConfig>(uid, scopeKey);
      setDraft(recovered || serverBase);
      lastServerHashRef.current = serverHash;
      return;
    }

    const isClean = serializeRecapConfig(currentDraftRef.current) === lastServerHashRef.current;
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
  } = useAutoSave<RawMaterialRecapDayConfig>({
    value: draft,
    serverHash,
    scopeKey,
    uid,
    serialize: serializeRecapConfig,
    onSave: async (val) => {
      await onSaveRecapConfig({
        dateIso: val.dateIso,
        hariKe: val.hariKe,
        headerLine1: val.headerLine1,
        headerLine2: val.headerLine2,
        headerLine3: val.headerLine3,
        headerAlamat: val.headerAlamat,
        logoDataUrl: val.logoDataUrl,
        logoWidthPx: val.logoWidthPx,
        logoRightDataUrl: val.logoRightDataUrl,
        logoRightWidthPx: val.logoRightWidthPx,
        followGlobalLeftLogo: val.followGlobalLeftLogo,
        followGlobalRightLogo: val.followGlobalRightLogo,
        recapTitle: val.recapTitle,
        sideLabel: val.sideLabel,
        bufferPercent: val.bufferPercent,
        bumbuPercent: val.bumbuPercent,
        rabPorsiKecilRate: val.rabPorsiKecilRate,
        rabPorsiBesarRate: val.rabPorsiBesarRate,
        poJudul: val.poJudul,
        poDari: val.poDari,
        poKepada: val.poKepada,
        poAlamat: val.poAlamat,
        poSignerLabel1: val.poSignerLabel1,
        poSignerLabel2: val.poSignerLabel2,
        poSignerName: val.poSignerName,
        itemOverrides: val.itemOverrides,
      });
    },
  });

  const pmSummary = useMemo(() => computePmSummary(activePmRecord), [activePmRecord]);

  const recap = useMemo(
    () => computeRawMaterialRecap(activeFoodCostPlan, pmSummary, draft),
    [activeFoodCostPlan, pmSummary, draft]
  );

  const resolvedRekapLogos = useMemo(
    () => resolveDocumentLogos(profile, 'rekap_bahan', draft),
    [profile, draft]
  );

  const resolvedPoLogos = useMemo(
    () => resolveDocumentLogos(profile, 'po_bahan', draft),
    [profile, draft]
  );

  const activeLogos = subTab === 'po' ? resolvedPoLogos : resolvedRekapLogos;

  const persistConfig = async (next: RawMaterialRecapDayConfig) => {
    setDraft(next);
    setSaving(true);
    try {
      await onSaveRecapConfig({
        dateIso: next.dateIso,
        hariKe: next.hariKe,
        headerLine1: next.headerLine1,
        headerLine2: next.headerLine2,
        headerLine3: next.headerLine3,
        headerAlamat: next.headerAlamat,
        logoDataUrl: next.logoDataUrl,
        logoWidthPx: next.logoWidthPx,
        logoRightDataUrl: next.logoRightDataUrl,
        logoRightWidthPx: next.logoRightWidthPx,
        followGlobalLeftLogo: next.followGlobalLeftLogo,
        followGlobalRightLogo: next.followGlobalRightLogo,
        recapTitle: next.recapTitle,
        sideLabel: next.sideLabel,
        bufferPercent: next.bufferPercent,
        bumbuPercent: next.bumbuPercent,
        rabPorsiKecilRate: next.rabPorsiKecilRate,
        rabPorsiBesarRate: next.rabPorsiBesarRate,
        poJudul: next.poJudul,
        poDari: next.poDari,
        poKepada: next.poKepada,
        poAlamat: next.poAlamat,
        poSignerLabel1: next.poSignerLabel1,
        poSignerLabel2: next.poSignerLabel2,
        poSignerName: next.poSignerName,
        itemOverrides: next.itemOverrides,
      });
      markSynced(serializeRecapConfig(next));
      clearScopedDraftBackup(uid, scopeKey);
    } finally {
      setSaving(false);
    }
  };

  const updateItemOverride = (
    itemKey: string,
    patch: {
      bufferPercent?: number | null;
      satuanPo?: string;
      hargaSatuan?: number | null;
      totalPoManual?: number | null;
      estimasiBufferManual?: number | null;
    }
  ) => {
    const nextOverrides = { ...(draft.itemOverrides || {}) };
    nextOverrides[itemKey] = { ...(nextOverrides[itemKey] || {}), ...patch };
    setDraft({ ...draft, itemOverrides: nextOverrides });
  };

  const handleResetRowOverrides = (itemKey: string) => {
    const nextOverrides = { ...(draft.itemOverrides || {}) };
    delete nextOverrides[itemKey];
    void persistConfig({ ...draft, itemOverrides: nextOverrides });
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
      await persistConfig({
        ...draft,
        logoDataUrl: dataUrl,
        logoWidthPx: widthPx,
        followGlobalLeftLogo: syncAsGlobalBgn ? true : false,
      });
    } else if (logoModalSide === 'right') {
      await persistConfig({
        ...draft,
        logoRightDataUrl: dataUrl,
        logoRightWidthPx: widthPx,
        followGlobalRightLogo: false,
      });
    }
  };

  const dateChoices = useMemo(() => {
    const set = new Set<string>(entries.map((e) => e.dateIso));
    foodCostPlans.forEach((p) => set.add(p.dateIso));
    pmRecords.forEach((r) => set.add(r.dateIso));
    poRecaps.forEach((c) => set.add(c.dateIso));
    if (activeDateIso) set.add(activeDateIso);
    return Array.from(set).sort();
  }, [entries, foodCostPlans, pmRecords, poRecaps, activeDateIso]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Rekapan Total Bahan Baku & PO (Nota Pesanan)
            </h2>
            <p className="text-xs text-slate-500">
              Menggabungkan seluruh kebutuhan bahan baku dari semua kategori & lembar alergi pada tanggal terpilih, dilengkapi nilai Buffer bebas dan RAB vs Total Belanja.
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
              <Edit3 className="h-3.5 w-3.5" />
              Edit Kop & Penandatangan
            </button>
            <button
              type="button"
              onClick={() => persistConfig(draft)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan PO'}
            </button>
            <button
              type="button"
              onClick={() => onExportPdf(draft, activeFoodCostPlan, activePmRecord, subTab)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Cetak PDF F4
            </button>
          </div>
        </div>

        {/* Date + Global Buffer + RAB Rate + Tab Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-700">Tanggal:</label>
              <input
                type="date"
                value={activeDateIso}
                onChange={(e) => e.target.value && onChangeDateIso(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
              />
              {dateChoices.length > 0 && (
                <select
                  value={activeDateIso}
                  onChange={(e) => onChangeDateIso(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
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
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs">
              <span className="font-semibold text-emerald-900">Buffer Global (%):</span>
              <input
                type="number"
                step="0.5"
                min={0}
                value={draft.bufferPercent}
                onChange={(e) =>
                  setDraft({ ...draft, bufferPercent: Math.max(0, Number(e.target.value) || 0) })
                }
                onBlur={() => persistConfig(draft)}
                className="w-16 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-center font-mono-num font-bold"
              />
              <span className="text-emerald-800">%</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
              <span className="text-slate-600">RAB Kecil:</span>
              <input
                type="number"
                step="500"
                min={0}
                value={draft.rabPorsiKecilRate}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rabPorsiKecilRate: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                onBlur={() => persistConfig(draft)}
                className="w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right font-mono-num"
              />
              <span className="text-slate-600">Besar:</span>
              <input
                type="number"
                step="500"
                min={0}
                value={draft.rabPorsiBesarRate}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rabPorsiBesarRate: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                onBlur={() => persistConfig(draft)}
                className="w-20 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right font-mono-num"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSubTab('rekap')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                subTab === 'rekap' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Rekapan Bahan Baku
            </button>
            <button
              type="button"
              onClick={() => setSubTab('po')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                subTab === 'po' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Nota Pesanan (PO)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('both')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                subTab === 'both' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Keduanya
            </button>
          </div>
        </div>

        {/* Editable Header / Signer Settings */}
        {showHeaderEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Nama SPPG
              </label>
              <input
                type="text"
                value={draft.headerLine3}
                onChange={(e) => setDraft({ ...draft, headerLine3: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Alamat Kop
              </label>
              <input
                type="text"
                value={draft.headerAlamat}
                onChange={(e) => setDraft({ ...draft, headerAlamat: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Judul Nota Pesanan
              </label>
              <input
                type="text"
                value={draft.poJudul}
                onChange={(e) => setDraft({ ...draft, poJudul: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
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
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3 w-3 text-emerald-600" />
                  Kiri ({activeLogos.leftWidthPx}px)
                </button>
                <button
                  type="button"
                  onClick={() => setLogoModalSide('right')}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3 w-3 text-blue-600" />
                  Kanan ({activeLogos.rightWidthPx}px)
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-600">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.followGlobalLeftLogo !== false}
                    onChange={(e) =>
                      void persistConfig({ ...draft, followGlobalLeftLogo: e.target.checked })
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
                      void persistConfig({ ...draft, followGlobalRightLogo: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  Ikuti Kanan Global
                </label>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Kepala SPPG (Penandatangan PO)
              </label>
              <input
                type="text"
                value={draft.poSignerName}
                onChange={(e) => setDraft({ ...draft, poSignerName: e.target.value })}
                placeholder="Nama Kepala SPPG..."
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Jabatan Baris 2
              </label>
              <input
                type="text"
                value={draft.poSignerLabel2}
                onChange={(e) => setDraft({ ...draft, poSignerLabel2: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Label Strip Vertikal
              </label>
              <input
                type="text"
                value={draft.sideLabel}
                onChange={(e) => setDraft({ ...draft, sideLabel: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => persistConfig(draft)}
                className="rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
              >
                Terapkan Kop & Signer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SHEET 1: REKAPAN TOTAL KEBUTUHAN BAHAN BAKU KESELURUHAN (Image 5) */}
      {(subTab === 'rekap' || subTab === 'both') && (
        <div className="rounded-xl border border-black bg-white overflow-hidden shadow-xs flex">
          {/* Left Vertical Yellow Strip */}
          <div
            className="w-8 sm:w-10 shrink-0 border-r border-black flex items-center justify-center p-1"
            style={{ backgroundColor: '#FFFF00' }}
          >
            <span
              className="font-extrabold text-xs sm:text-sm tracking-widest text-black whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {draft.sideLabel || 'REKAPAN / PO'}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Kop */}
            <div className="relative border-b border-black px-4 py-3 text-center min-h-[82px] flex flex-col justify-center">
              {resolvedRekapLogos.leftUrl && (
                <img
                  src={resolvedRekapLogos.leftUrl}
                  alt="Logo Kiri"
                  style={{ width: `${resolvedRekapLogos.leftWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              {resolvedRekapLogos.rightUrl && (
                <img
                  src={resolvedRekapLogos.rightUrl}
                  alt="Logo Kanan"
                  style={{ width: `${resolvedRekapLogos.rightWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              <div className="px-20">
                <div className="text-xs font-bold uppercase text-black">{draft.headerLine1}</div>
                <div className="text-xs font-bold uppercase text-black">{draft.headerLine2}</div>
                <div className="text-xs font-bold uppercase text-black">{draft.headerLine3}</div>
                <div className="text-[11px] italic underline text-black">{draft.headerAlamat}</div>
                <div className="mt-2 text-sm font-extrabold uppercase text-black">
                  {draft.recapTitle}
                </div>
              </div>
            </div>

            {/* Yellow Date Strip */}
            <div
              className="border-b border-black px-3 py-1 text-center text-xs font-bold text-black"
              style={{ backgroundColor: '#FFFF00' }}
            >
              {formatIndonesianFullDate(draft.dateIso)}
            </div>

            {/* Top RAB & PM Strip (matching Image 5) */}
            <div className="overflow-x-auto border-b border-black">
              <table className="w-full border-collapse text-xs text-black">
                <thead>
                  <tr style={{ backgroundColor: '#92D050' }}>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      TOTAL PENERIMA MANFAAT
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      PORSI KECIL
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      PORSI BESAR
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      BUMBU {recap.bumbuPercent}%
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      RAB PORSI KECIL
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      RAB PORSI BESAR
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold">
                      TOTAL RAB
                    </th>
                    <th className="border-b border-black px-2 py-2 text-center font-bold">
                      SELISIH
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold font-mono-num">
                    <td className="border-b border-r border-black px-2 py-1.5 text-center">
                      {recap.totalPenerimaManfaat}
                    </td>
                    <td className="border-b border-r border-black px-2 py-1.5 text-center">
                      {recap.porsiKecilCount}
                    </td>
                    <td className="border-b border-r border-black px-2 py-1.5 text-center">
                      {recap.porsiBesarCount}
                    </td>
                    <td className="border-b border-r border-black px-2 py-1.5 text-right">
                      Rp {fmtRp(recap.bumbuTotalRp)}
                    </td>
                    <td className="border-b border-r border-black px-2 py-1.5 text-right">
                      Rp {fmtRp(recap.rabPorsiKecilTotal)}
                    </td>
                    <td className="border-b border-r border-black px-2 py-1.5 text-right">
                      Rp {fmtRp(recap.rabPorsiBesarTotal)}
                    </td>
                    <td
                      className="border-b border-r border-black px-2 py-1.5 text-right"
                      style={{ backgroundColor: '#92D050' }}
                    >
                      Rp {fmtRp(recap.totalRab)}
                    </td>
                    <td
                      className="border-b border-black px-2 py-1.5 text-right"
                      style={{
                        backgroundColor: recap.selisihRab >= 0 ? '#92D050' : '#FF0000',
                      }}
                    >
                      {recap.selisihRab < 0
                        ? `-Rp ${fmtRp(Math.abs(recap.selisihRab))}`
                        : `Rp ${fmtRp(recap.selisihRab)}`}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td
                      colSpan={7}
                      className="border-b border-r border-black px-3 py-1.5 text-center"
                      style={{ backgroundColor: '#FFC000' }}
                    >
                      TOTAL BELANJA KEBUTUHAN BAHAN BAKU
                    </td>
                    <td
                      className="border-b border-black px-2 py-1.5 text-right font-mono-num"
                      style={{ backgroundColor: '#FFC000' }}
                    >
                      Rp {fmtRp(recap.totalBelanjaBahanBaku)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Raw Material Recap Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs text-black">
                <thead>
                  <tr style={{ backgroundColor: '#F4B084' }}>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold min-w-[180px]">
                      BAHAN MAKANAN
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-20">
                      Total PO
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-20">
                      Estimasi Buffer
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-14">
                      Kg
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-14">
                      Potong
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-14">
                      Ekor
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-14">
                      Lembar
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-14">
                      Rak
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-20">
                      Buffer {draft.bufferPercent}%
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-20">
                      Jumlah + Buffer
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-28">
                      Harga Satuan
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-28">
                      Harga Total
                    </th>
                    <th className="border-b border-black px-1.5 py-2 text-center font-bold w-12">
                      Reset
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recap.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={13}
                        className="border-b border-black px-4 py-8 text-center text-slate-500"
                      >
                        Belum ada bahan baku tercatat pada menu Nilai Gizi & Food Cost untuk tanggal{' '}
                        <strong>{formatIndonesianFullDate(draft.dateIso)}</strong>.
                      </td>
                    </tr>
                  ) : (
                    recap.rows.map((row) => {
                      const ov = draft.itemOverrides?.[row.key];
                      const hasOverride = Boolean(ov);
                      return (
                        <tr key={row.key} className="hover:bg-slate-50">
                          <td className="border-b border-r border-black px-2.5 py-1 font-medium">
                            {row.bahanMakanan}
                          </td>
                          <td className="border-b border-r border-black p-0.5">
                            <input
                              type="number"
                              step="0.1"
                              value={
                                ov?.totalPoManual !== undefined && ov?.totalPoManual !== null
                                  ? ov.totalPoManual
                                  : Number(row.totalPo.toFixed(1))
                              }
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                updateItemOverride(row.key, {
                                  totalPoManual: v === '' ? null : Number(v) || 0,
                                });
                              }}
                              onBlur={() => persistConfig(draft)}
                              className="w-full px-1 py-1 text-center font-mono-num font-semibold text-xs focus:bg-emerald-50 focus:outline-none"
                            />
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num">
                            {row.estimasiUsed.toFixed(1)}
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num">
                            {fmtNum(row.kg, 1)}
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num">
                            {fmtNum(row.potong, 1)}
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num">
                            {fmtNum(row.ekor, 1)}
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num">
                            {fmtNum(row.lembar, 1)}
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num">
                            {fmtNum(row.rak, 1)}
                          </td>
                          <td className="border-b border-r border-black p-0.5 text-center font-mono-num">
                            <div className="flex flex-col items-center">
                              <span>{row.bufferAmount.toFixed(1)}</span>
                              <input
                                type="number"
                                step="0.5"
                                min={0}
                                value={
                                  ov?.bufferPercent !== undefined && ov?.bufferPercent !== null
                                    ? ov.bufferPercent
                                    : ''
                                }
                                placeholder={`${draft.bufferPercent}%`}
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  updateItemOverride(row.key, {
                                    bufferPercent: v === '' ? null : Math.max(0, Number(v) || 0),
                                  });
                                }}
                                onBlur={() => persistConfig(draft)}
                                title="Ubah % buffer khusus baris ini"
                                className="w-14 rounded border border-slate-200 bg-slate-50 px-1 text-center text-[10px] text-slate-600"
                              />
                            </div>
                          </td>
                          <td className="border-b border-r border-black px-1.5 py-1 text-center font-mono-num font-semibold">
                            {row.jumlahPlusBuffer.toFixed(1)}
                          </td>
                          <td className="border-b border-r border-black p-0.5">
                            <input
                              type="number"
                              min={0}
                              value={
                                ov?.hargaSatuan !== undefined && ov?.hargaSatuan !== null
                                  ? ov.hargaSatuan
                                  : row.hargaSatuan || ''
                              }
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                updateItemOverride(row.key, {
                                  hargaSatuan: v === '' ? null : Math.max(0, Number(v) || 0),
                                });
                              }}
                              onBlur={() => persistConfig(draft)}
                              placeholder="Rp"
                              className="w-full px-1.5 py-1 text-right font-mono-num text-xs focus:bg-emerald-50 focus:outline-none"
                            />
                          </td>
                          <td className="border-b border-r border-black px-2 py-1 text-right font-semibold font-mono-num">
                            Rp {fmtRp(row.hargaTotal)}
                          </td>
                          <td className="border-b border-black px-1 py-1 text-center">
                            {hasOverride && (
                              <button
                                type="button"
                                onClick={() => handleResetRowOverrides(row.key)}
                                className="text-amber-600 hover:text-amber-800"
                                title="Reset penyesuaian baris"
                              >
                                <RotateCcw className="h-3.5 w-3.5 inline" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SHEET 2: NOTA PESANAN / PO BAHAN BAKU (Image 6) */}
      {(subTab === 'po' || subTab === 'both') && (
        <div className="mx-auto max-w-4xl rounded-xl border border-black bg-white overflow-hidden shadow-xs">
          {/* Yellow Banner */}
          <div
            className="border-b border-black px-4 py-2 text-center text-lg font-extrabold uppercase text-black"
            style={{ backgroundColor: '#CCFF00' }}
          >
            {draft.poJudul}
          </div>

          {/* Kop */}
          <div className="relative border-b border-slate-300 px-5 py-3 text-center min-h-[82px] flex flex-col justify-center">
            {resolvedPoLogos.leftUrl && (
              <img
                src={resolvedPoLogos.leftUrl}
                alt="Logo Kiri"
                style={{ width: `${resolvedPoLogos.leftWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                className="absolute left-5 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
            {resolvedPoLogos.rightUrl && (
              <img
                src={resolvedPoLogos.rightUrl}
                alt="Logo Kanan"
                style={{ width: `${resolvedPoLogos.rightWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                className="absolute right-5 top-1/2 -translate-y-1/2 object-contain"
              />
            )}
            <div className="px-20">
              <div className="text-xs font-bold uppercase text-black">{draft.headerLine1}</div>
              <div className="text-xs font-bold uppercase text-black">{draft.headerLine2}</div>
              <div className="text-xs font-bold uppercase text-black">{draft.headerLine3}</div>
              <div className="text-[11px] italic underline text-black">{draft.headerAlamat}</div>
            </div>
          </div>

          {/* Dari / Kepada / Alamat / Tanggal */}
          <div className="px-5 py-3 space-y-1.5 text-xs text-black">
            <div className="grid grid-cols-12 items-center">
              <span className="col-span-2 font-medium">Dari</span>
              <span className="col-span-1 text-center">:</span>
              <input
                type="text"
                value={draft.poDari}
                onChange={(e) => setDraft({ ...draft, poDari: e.target.value })}
                onBlur={() => persistConfig(draft)}
                className="col-span-9 rounded border border-transparent hover:border-slate-300 focus:border-emerald-500 px-2 py-0.5 font-semibold focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-12 items-center">
              <span className="col-span-2 font-medium">Kepada</span>
              <span className="col-span-1 text-center">:</span>
              <input
                type="text"
                value={draft.poKepada}
                onChange={(e) => setDraft({ ...draft, poKepada: e.target.value })}
                onBlur={() => persistConfig(draft)}
                placeholder="Nama Supplier / Koperasi / Mitra..."
                className="col-span-9 rounded border border-slate-200 focus:border-emerald-500 px-2 py-0.5 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-12 items-center">
              <span className="col-span-2 font-medium">Alamat</span>
              <span className="col-span-1 text-center">:</span>
              <input
                type="text"
                value={draft.poAlamat}
                onChange={(e) => setDraft({ ...draft, poAlamat: e.target.value })}
                onBlur={() => persistConfig(draft)}
                placeholder="Alamat supplier..."
                className="col-span-9 rounded border border-slate-200 focus:border-emerald-500 px-2 py-0.5 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-12 items-center">
              <span className="col-span-2 font-medium">Tanggal</span>
              <span className="col-span-1 text-center">:</span>
              <span className="col-span-9 px-2 py-0.5 font-medium">
                {formatIndonesianFullDate(draft.dateIso)}
              </span>
            </div>
          </div>

          {/* PO Table */}
          <div className="px-5 pb-4 overflow-x-auto">
            <table className="w-full border-collapse text-xs text-black">
              <thead>
                <tr style={{ backgroundColor: '#B7DEE8' }}>
                  <th className="border border-black px-2 py-2 text-center font-bold w-12">No.</th>
                  <th className="border border-black px-3 py-2 text-center font-bold">
                    Uraian Jenis Bahan Makanan
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold w-20">
                    Jumlah
                  </th>
                  <th className="border-b border-t border-r border-black px-2 py-2 text-center font-bold w-24">
                    Satuan
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold w-28">
                    Harga
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold w-32">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {recap.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="border border-black px-4 py-8 text-center text-slate-500"
                    >
                      Nota Pesanan terisi otomatis dari Rekapan Bahan Baku di atas.
                    </td>
                  </tr>
                ) : (
                  recap.rows.map((row, idx) => (
                    <tr key={row.key}>
                      <td className="border border-black px-2 py-1.5 text-center font-mono-num">
                        {idx + 1}
                      </td>
                      <td className="border border-black px-3 py-1.5">{row.bahanMakanan}</td>
                      <td className="border border-black px-2 py-1.5 text-center font-mono-num">
                        {row.totalPo.toFixed(1)}
                      </td>
                      <td className="border border-black p-0.5">
                        <input
                          type="text"
                          value={draft.itemOverrides?.[row.key]?.satuanPo ?? row.satuanPo}
                          onChange={(e) =>
                            updateItemOverride(row.key, { satuanPo: e.target.value })
                          }
                          onBlur={() => persistConfig(draft)}
                          className="w-full px-1.5 py-1 text-center text-xs focus:bg-blue-50 focus:outline-none"
                        />
                      </td>
                      <td className="border border-black px-2 py-1.5 text-right font-mono-num">
                        Rp {fmtRp(row.hargaSatuan)}
                      </td>
                      <td className="border border-black px-2 py-1.5 text-right font-mono-num font-semibold">
                        Rp {fmtRp(row.hargaTotal)}
                      </td>
                    </tr>
                  ))
                )}
                <tr className="font-bold">
                  <td
                    colSpan={5}
                    className="border border-black px-4 py-2 text-center tracking-wide"
                  >
                    TOTAL BELANJA
                  </td>
                  <td className="border border-black px-2 py-2 text-right font-mono-num">
                    Rp {fmtRp(recap.totalBelanjaBahanBaku)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signer Block */}
            <div className="mt-8 flex justify-end pr-6">
              <div className="w-72 text-xs text-black space-y-16">
                <div>
                  <div>{draft.poSignerLabel1}</div>
                  <div>{draft.poSignerLabel2}</div>
                </div>
                <div className="font-bold underline uppercase tracking-wide">
                  {draft.poSignerName || '........................................'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <LogoUploadModal
        open={logoModalSide !== null}
        title={
          logoModalSide === 'left'
            ? 'Atur Logo Kiri (BGN) — Rekapan Bahan Baku & PO'
            : 'Atur Logo Kanan — Rekapan Bahan Baku & PO'
        }
        side={logoModalSide || 'left'}
        initialDataUrl={
          logoModalSide === 'left' ? activeLogos.leftUrl : activeLogos.rightUrl
        }
        initialWidthPx={
          logoModalSide === 'left' ? activeLogos.leftWidthPx : activeLogos.rightWidthPx
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
