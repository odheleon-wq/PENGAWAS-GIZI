import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Edit3,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { DEFAULT_SAMPLE_COLUMN_LABELS } from '../services/sppgService';
import type {
  DailyMenuEntry,
  SampleColumnLabels,
  SampleFormConfig,
  SamplePertinggalRow,
  SppgUserProfile,
} from '../types';
import { resolveDocumentLogos } from '../utils/logoResolver';
import { useAutoSave, type AutoSaveStatus } from '../hooks/useAutoSave';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';

interface SamplePertinggalViewProps {
  profile: SppgUserProfile;
  monthKey: string;
  config: SampleFormConfig;
  rows: SamplePertinggalRow[];
  menuEntries: DailyMenuEntry[];
  minPrintableRows: number;
  onChangeMinPrintableRows: (count: number) => void;
  onSaveConfig: (
    next: Omit<SampleFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSaveRow: (
    row: Omit<SamplePertinggalRow, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ) => Promise<void>;
  onDeleteRow: (rowId: string) => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
}

export const SamplePertinggalView: React.FC<SamplePertinggalViewProps> = ({
  profile,
  monthKey,
  config,
  rows,
  menuEntries,
  minPrintableRows,
  onChangeMinPrintableRows,
  onSaveConfig,
  onSaveRow,
  onDeleteRow,
  onSyncGlobalLeftLogo,
}) => {
  const [showFormatEditor, setShowFormatEditor] = useState(false);
  const [draftConfig, setDraftConfig] = useState<SampleFormConfig>(config);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);

  // Local inline edits per row ID so typing is zero-lag before auto-save
  const [localRows, setLocalRows] = useState<Record<string, SamplePertinggalRow>>({});
  const dirtyRowIdsRef = useRef<Set<string>>(new Set());
  const rowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rowAutoStatus, setRowAutoStatus] = useState<AutoSaveStatus>('idle');
  const [rowLastSavedAt, setRowLastSavedAt] = useState<string>('');
  const [rowErrorMsg, setRowErrorMsg] = useState<string | null>(null);

  const normalizeCfg = useCallback(
    (c: SampleFormConfig): SampleFormConfig => ({
      ...c,
      colLabels: { ...DEFAULT_SAMPLE_COLUMN_LABELS, ...(c.colLabels || {}) },
    }),
    []
  );
  const serializeSampleCfg = useCallback(
    (c: SampleFormConfig) =>
      JSON.stringify({
        logoDataUrl: c.logoDataUrl || '',
        logoWidthPx: c.logoWidthPx || 56,
        logoRightDataUrl: c.logoRightDataUrl || '',
        logoRightWidthPx: c.logoRightWidthPx || 56,
        followGlobalLeftLogo: c.followGlobalLeftLogo !== false,
        followGlobalRightLogo: c.followGlobalRightLogo !== false,
        logoCaption: c.logoCaption,
        unitName: c.unitName,
        formLabel: c.formLabel,
        formTitle: c.formTitle,
        docNumber: c.docNumber,
        revision: c.revision,
        effectiveDate: c.effectiveDate,
        bulanLabel: c.bulanLabel,
        tahunLabel: c.tahunLabel,
        colLabels: { ...DEFAULT_SAMPLE_COLUMN_LABELS, ...(c.colLabels || {}) },
        verifierLine1: c.verifierLine1,
        verifierLine2: c.verifierLine2,
        verifierName: c.verifierName,
      }),
    []
  );

  const normalizedServerCfg = useMemo(() => normalizeCfg(config), [config, normalizeCfg]);
  const configServerHash = useMemo(
    () => serializeSampleCfg(normalizedServerCfg),
    [normalizedServerCfg, serializeSampleCfg]
  );
  const lastConfigServerHashRef = useRef<string>(configServerHash);
  const lastConfigMonthRef = useRef<string>(monthKey);
  const draftConfigRef = useRef<SampleFormConfig>(draftConfig);
  draftConfigRef.current = draftConfig;

  useEffect(() => {
    const monthChanged = lastConfigMonthRef.current !== monthKey;
    const isClean = serializeSampleCfg(draftConfigRef.current) === lastConfigServerHashRef.current;
    if (monthChanged || isClean) {
      setDraftConfig(normalizedServerCfg);
    }
    lastConfigMonthRef.current = monthKey;
    lastConfigServerHashRef.current = configServerHash;
  }, [monthKey, normalizedServerCfg, configServerHash, serializeSampleCfg]);

  const {
    status: cfgAutoStatus,
    lastSavedAtLabel: cfgLastSavedAt,
    errorMessage: cfgErrorMsg,
    markSynced: markCfgSynced,
  } = useAutoSave<SampleFormConfig>({
    value: draftConfig,
    serverHash: configServerHash,
    scopeKey: `sample_cfg:${monthKey}`,
    uid: profile.uid,
    serialize: serializeSampleCfg,
    onSave: async (val) => {
      const mergedLabels = { ...DEFAULT_SAMPLE_COLUMN_LABELS, ...(val.colLabels || {}) };
      await onSaveConfig({
        logoDataUrl: val.logoDataUrl || '',
        logoWidthPx: val.logoWidthPx || 56,
        logoRightDataUrl: val.logoRightDataUrl || '',
        logoRightWidthPx: val.logoRightWidthPx || 56,
        followGlobalLeftLogo: val.followGlobalLeftLogo !== false,
        followGlobalRightLogo: val.followGlobalRightLogo !== false,
        logoCaption: val.logoCaption,
        unitName: val.unitName,
        formLabel: val.formLabel,
        formTitle: val.formTitle,
        docNumber: val.docNumber,
        revision: val.revision,
        effectiveDate: val.effectiveDate,
        bulanLabel: val.bulanLabel,
        tahunLabel: val.tahunLabel,
        colLabels: mergedLabels,
        verifierLine1: val.verifierLine1,
        verifierLine2: val.verifierLine2,
        verifierName: val.verifierName,
      });
    },
  });

  useEffect(() => {
    setLocalRows((prev) => {
      const mapped: Record<string, SamplePertinggalRow> = {};
      rows.forEach((r) => {
        if (dirtyRowIdsRef.current.has(r.id) && prev[r.id]) {
          mapped[r.id] = prev[r.id];
        } else {
          mapped[r.id] = r;
        }
      });
      return mapped;
    });
  }, [rows]);

  const localRowsRef = useRef(localRows);
  localRowsRef.current = localRows;

  const flushDirtyRows = useCallback(async () => {
    if (rowTimerRef.current) {
      clearTimeout(rowTimerRef.current);
      rowTimerRef.current = null;
    }
    const ids = Array.from(dirtyRowIdsRef.current);
    if (ids.length === 0) return;
    setRowAutoStatus('saving');
    setRowErrorMsg(null);
    try {
      for (const id of ids) {
        const row = localRowsRef.current[id];
        if (!row) {
          dirtyRowIdsRef.current.delete(id);
          continue;
        }
        dirtyRowIdsRef.current.delete(id);
        await onSaveRow({
          id: row.id,
          rowOrder: row.rowOrder,
          kodeIdentitas: row.kodeIdentitas,
          jumlahSampel: row.jumlahSampel,
          kondisiOk: row.kondisiOk,
          kondisiNok: row.kondisiNok,
          penanggungJawab: row.penanggungJawab,
          masukTanggal: row.masukTanggal,
          masukJam: row.masukJam,
          keluarTanggal: row.keluarTanggal,
          keluarJam: row.keluarJam,
        });
      }
      const now = new Date();
      setRowLastSavedAt(
        `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
      );
      setRowAutoStatus('saved');
    } catch (err) {
      ids.forEach((id) => dirtyRowIdsRef.current.add(id));
      setRowAutoStatus('error');
      setRowErrorMsg(err instanceof Error ? err.message : 'Gagal auto-simpan baris sampel.');
    }
  }, [onSaveRow]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirtyRowIdsRef.current.size > 0) {
        void flushDirtyRows();
      }
    };
    const onUnload = () => {
      if (dirtyRowIdsRef.current.size > 0) {
        void flushDirtyRows();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      if (rowTimerRef.current) {
        clearTimeout(rowTimerRef.current);
      }
      if (dirtyRowIdsRef.current.size > 0) {
        void flushDirtyRows();
      }
    };
  }, [flushDirtyRows]);

  const labels: SampleColumnLabels = {
    ...DEFAULT_SAMPLE_COLUMN_LABELS,
    ...(config.colLabels || {}),
  };

  const draftLabels: SampleColumnLabels = {
    ...DEFAULT_SAMPLE_COLUMN_LABELS,
    ...(draftConfig.colLabels || {}),
  };

  const draftLogos = resolveDocumentLogos(profile, 'sampel', draftConfig);
  const displayLogos = resolveDocumentLogos(profile, 'sampel', config);

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
      setDraftConfig((prev) => ({
        ...prev,
        logoDataUrl: dataUrl,
        logoWidthPx: widthPx,
        followGlobalLeftLogo: syncAsGlobalBgn ? true : false,
      }));
    } else if (logoModalSide === 'right') {
      setDraftConfig((prev) => ({
        ...prev,
        logoRightDataUrl: dataUrl,
        logoRightWidthPx: widthPx,
        followGlobalRightLogo: false,
      }));
    }
  };

  const handleSaveFormatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSavedNotice(false);
    try {
      await onSaveConfig({
        logoDataUrl: draftConfig.logoDataUrl || '',
        logoWidthPx: draftConfig.logoWidthPx || 56,
        logoRightDataUrl: draftConfig.logoRightDataUrl || '',
        logoRightWidthPx: draftConfig.logoRightWidthPx || 56,
        followGlobalLeftLogo: draftConfig.followGlobalLeftLogo !== false,
        followGlobalRightLogo: draftConfig.followGlobalRightLogo !== false,
        logoCaption: draftConfig.logoCaption,
        unitName: draftConfig.unitName,
        formLabel: draftConfig.formLabel,
        formTitle: draftConfig.formTitle,
        docNumber: draftConfig.docNumber,
        revision: draftConfig.revision,
        effectiveDate: draftConfig.effectiveDate,
        bulanLabel: draftConfig.bulanLabel,
        tahunLabel: draftConfig.tahunLabel,
        colLabels: draftLabels,
        verifierLine1: draftConfig.verifierLine1,
        verifierLine2: draftConfig.verifierLine2,
        verifierName: draftConfig.verifierName,
      });
      markCfgSynced(serializeSampleCfg(draftConfig));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddBlankRow = async () => {
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.rowOrder), 0);
    await onSaveRow({
      rowOrder: maxOrder + 1,
      kodeIdentitas: '',
      jumlahSampel: '',
      kondisiOk: '',
      kondisiNok: '',
      penanggungJawab: rows.length === 0 ? profile.namaSppi || '' : '',
      masukTanggal: '',
      masukJam: '',
      keluarTanggal: '',
      keluarJam: '',
    });
  };

  const handleImportDatesFromRekapan = async () => {
    if (menuEntries.length === 0) return;
    const existingCodes = new Set(rows.map((r) => r.masukTanggal.trim()));
    let nextOrder = rows.reduce((m, r) => Math.max(m, r.rowOrder), 0);

    for (const entry of menuEntries) {
      const parts = entry.dateIso.split('-');
      const ddmmyyyy = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : entry.dateIso;
      if (existingCodes.has(ddmmyyyy)) continue;
      nextOrder += 1;
      await onSaveRow({
        rowOrder: nextOrder,
        kodeIdentitas: `H-${entry.hariKe}`,
        jumlahSampel: '1 Porsi',
        kondisiOk: '✓',
        kondisiNok: '',
        penanggungJawab: profile.namaSppi || '',
        masukTanggal: ddmmyyyy,
        masukJam: '08.00',
        keluarTanggal: '',
        keluarJam: '',
      });
    }
  };

  const handleFieldChange = (
    rowId: string,
    field: keyof Omit<SamplePertinggalRow, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>,
    value: string
  ) => {
    setLocalRows((prev) => {
      const target = prev[rowId];
      if (!target) return prev;
      return {
        ...prev,
        [rowId]: { ...target, [field]: value },
      };
    });
    dirtyRowIdsRef.current.add(rowId);
    setRowAutoStatus('pending');
    if (rowTimerRef.current) clearTimeout(rowTimerRef.current);
    rowTimerRef.current = setTimeout(() => {
      void flushDirtyRows();
    }, 850);
  };

  const handleRowBlurSave = async (rowId: string) => {
    const row = localRows[rowId];
    if (!row) return;
    dirtyRowIdsRef.current.delete(rowId);
    await onSaveRow({
      id: row.id,
      rowOrder: row.rowOrder,
      kodeIdentitas: row.kodeIdentitas,
      jumlahSampel: row.jumlahSampel,
      kondisiOk: row.kondisiOk,
      kondisiNok: row.kondisiNok,
      penanggungJawab: row.penanggungJawab,
      masukTanggal: row.masukTanggal,
      masukJam: row.masukJam,
      keluarTanggal: row.keluarTanggal,
      keluarJam: row.keluarJam,
    });
    const now = new Date();
    setRowLastSavedAt(
      `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
    );
    setRowAutoStatus('saved');
  };

  const handleToggleOkNok = async (rowId: string, which: 'kondisiOk' | 'kondisiNok') => {
    const row = localRows[rowId];
    if (!row) return;
    const isChecked = row[which] === '✓';
    const nextRow: SamplePertinggalRow = {
      ...row,
      kondisiOk: which === 'kondisiOk' ? (isChecked ? '' : '✓') : '',
      kondisiNok: which === 'kondisiNok' ? (isChecked ? '' : '✓') : '',
    };
    setLocalRows((prev) => ({ ...prev, [rowId]: nextRow }));
    await onSaveRow({
      id: nextRow.id,
      rowOrder: nextRow.rowOrder,
      kodeIdentitas: nextRow.kodeIdentitas,
      jumlahSampel: nextRow.jumlahSampel,
      kondisiOk: nextRow.kondisiOk,
      kondisiNok: nextRow.kondisiNok,
      penanggungJawab: nextRow.penanggungJawab,
      masukTanggal: nextRow.masukTanggal,
      masukJam: nextRow.masukJam,
      keluarTanggal: nextRow.keluarTanggal,
      keluarJam: nextRow.keluarJam,
    });
  };

  const sortedRows = [...rows].sort((a, b) => a.rowOrder - b.rowOrder);
  const blankPlaceholderCount = Math.max(0, minPrintableRows - sortedRows.length);

  return (
    <div className="space-y-5">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Form Sampel Pertinggal (Semua Format Dapat Diedit)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Klik langsung pada sel tabel untuk mengisi atau mengedit data, atau buka Edit Format untuk mengubah kop, nomor dokumen, logo, judul kolom, dan tanda tangan verifikasi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <AutoSaveIndicator
            status={
              cfgAutoStatus === 'saving' || cfgAutoStatus === 'pending' || cfgAutoStatus === 'error'
                ? cfgAutoStatus
                : rowAutoStatus !== 'idle'
                ? rowAutoStatus
                : cfgAutoStatus
            }
            lastSavedAtLabel={rowLastSavedAt || cfgLastSavedAt}
            errorMessage={rowErrorMsg || cfgErrorMsg}
          />
          {menuEntries.length > 0 && (
            <button
              type="button"
              onClick={() => void handleImportDatesFromRekapan()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Buat baris otomatis berdasarkan tanggal yang ada di Rekapan Menu"
            >
              <Wand2 className="h-3.5 w-3.5 text-emerald-600" />
              Isi dari Rekapan Menu
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFormatEditor((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              showFormatEditor
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {showFormatEditor ? 'Tutup Editor Format' : 'Edit Format Kop & Kolom'}
          </button>
          <button
            type="button"
            onClick={() => void handleAddBlankRow()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Tambah Baris
          </button>
        </div>
      </div>

      {/* Full Format Customizer Panel */}
      {showFormatEditor && (
        <form
          onSubmit={handleSaveFormatSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Edit Seluruh Format Dokumen ({monthKey})
              </h3>
              <p className="text-xs text-slate-500">
                Ubah logo, nama unit, judul form, nomor dokumen, periode, seluruh judul kolom tabel, dan verifikator.
              </p>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                Format tersimpan
              </span>
            )}
          </div>

          {/* 1. Header & Logo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Logo Kiri (BGN) &amp; Kanan</div>
              <div className="flex flex-wrap items-center gap-2">
                {draftLogos.leftUrl ? (
                  <img
                    src={draftLogos.leftUrl}
                    alt="Logo Kiri"
                    style={{ width: `${Math.min(64, draftLogos.leftWidthPx)}px` }}
                    className="h-12 rounded border border-slate-300 bg-white object-contain p-0.5"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-400 bg-white text-[10px] font-bold text-slate-600">
                    BGN
                  </div>
                )}
                {draftLogos.rightUrl && (
                  <img
                    src={draftLogos.rightUrl}
                    alt="Logo Kanan"
                    style={{ width: `${Math.min(64, draftLogos.rightWidthPx)}px` }}
                    className="h-12 rounded border border-slate-300 bg-white object-contain p-0.5"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setLogoModalSide('left')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="h-3 w-3 text-emerald-600" />
                  Atur Kiri ({draftLogos.leftWidthPx}px)
                </button>
                <button
                  type="button"
                  onClick={() => setLogoModalSide('right')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="h-3 w-3 text-blue-600" />
                  Atur Kanan ({draftLogos.rightWidthPx}px)
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.followGlobalLeftLogo !== false}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, followGlobalLeftLogo: e.target.checked }))
                    }
                    className="rounded accent-emerald-600"
                  />
                  Ikuti BGN Global
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.followGlobalRightLogo !== false}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, followGlobalRightLogo: e.target.checked }))
                    }
                    className="rounded accent-blue-600"
                  />
                  Ikuti Kanan Global
                </label>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Teks Bawah Logo
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={draftConfig.logoCaption}
                  onChange={(e) => setDraftConfig((p) => ({ ...p, logoCaption: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Kop Tengah</div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Nama SPPG / Unit
                </label>
                <input
                  type="text"
                  maxLength={150}
                  value={draftConfig.unitName}
                  onChange={(e) => setDraftConfig((p) => ({ ...p, unitName: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Label Form
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.formLabel}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, formLabel: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Judul Form
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={draftConfig.formTitle}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, formTitle: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Identitas Dokumen Kanan</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    No. Dokumen
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.docNumber}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, docNumber: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Revisi
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={draftConfig.revision}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, revision: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Tanggal Berlaku
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={draftConfig.effectiveDate}
                  onChange={(e) => setDraftConfig((p) => ({ ...p, effectiveDate: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          {/* 2. Bulan, Tahun, Baris Minimum, & Verifikator */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Bulan</label>
              <input
                type="text"
                maxLength={40}
                value={draftConfig.bulanLabel}
                onChange={(e) => setDraftConfig((p) => ({ ...p, bulanLabel: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Tahun</label>
              <input
                type="text"
                maxLength={20}
                value={draftConfig.tahunLabel}
                onChange={(e) => setDraftConfig((p) => ({ ...p, tahunLabel: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Min Baris Cetak
              </label>
              <input
                type="number"
                min={1}
                max={40}
                value={minPrintableRows}
                onChange={(e) => onChangeMinPrintableRows(Math.max(1, Number(e.target.value) || 10))}
                className="font-mono-num w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Verifikasi Baris 1
              </label>
              <input
                type="text"
                maxLength={80}
                value={draftConfig.verifierLine1}
                onChange={(e) => setDraftConfig((p) => ({ ...p, verifierLine1: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Jabatan Verifikator
              </label>
              <input
                type="text"
                maxLength={80}
                value={draftConfig.verifierLine2}
                onChange={(e) => setDraftConfig((p) => ({ ...p, verifierLine2: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Nama Verifikator
              </label>
              <input
                type="text"
                maxLength={150}
                value={draftConfig.verifierName}
                onChange={(e) => setDraftConfig((p) => ({ ...p, verifierName: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* 3. Editable Table Column Headers */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">
              Edit Judul Kolom Tabel (Opsional)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(
                [
                  ['kodeIdentitas', 'Kolom 1'],
                  ['jumlahSampel', 'Kolom 2'],
                  ['kondisiSampel', 'Grup Kondisi'],
                  ['ok', 'Sub-kolom OK'],
                  ['nok', 'Sub-kolom NOK'],
                  ['penanggungJawab', 'Kolom Penanggung Jawab'],
                  ['masukChiler', 'Grup Masuk Chiler'],
                  ['keluarChiler', 'Grup Keluar Chiler'],
                  ['tanggal', 'Sub-kolom Tanggal'],
                  ['jam', 'Sub-kolom Jam'],
                ] as Array<[keyof SampleColumnLabels, string]>
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{label}</label>
                  <input
                    type="text"
                    value={draftLabels[key]}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        colLabels: {
                          ...DEFAULT_SAMPLE_COLUMN_LABELS,
                          ...(prev.colLabels || {}),
                          [key]: e.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowFormatEditor(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {savingConfig ? 'Menyimpan...' : 'Simpan Format Dokumen'}
            </button>
          </div>
        </form>
      )}

      {/* Exact Paper-Style Editable Sheet Matching image_a7f207f7.png */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto p-5 sm:p-8">
          <div className="min-w-[940px] bg-white text-black">
            {/* Official 3-Column Header Box */}
            <table className="w-full border-collapse border border-slate-500 text-slate-800">
              <tbody>
                <tr>
                  <td
                    rowSpan={3}
                    className="w-[140px] border-r border-slate-500 p-2 text-center align-middle"
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      {displayLogos.leftUrl ? (
                        <img
                          src={displayLogos.leftUrl}
                          alt={config.logoCaption}
                          style={{ width: `${displayLogos.leftWidthPx}px`, height: 'auto', maxHeight: '72px' }}
                          className="object-contain"
                        />
                      ) : (
                        <svg
                          viewBox="0 0 64 64"
                          style={{ width: `${displayLogos.leftWidthPx}px`, height: `${displayLogos.leftWidthPx}px`, maxHeight: '72px' }}
                          className="text-slate-700"
                          aria-hidden="true"
                        >
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="#eef2f7"
                            stroke="#475569"
                            strokeWidth="2.2"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="21"
                            fill="none"
                            stroke="#64748b"
                            strokeWidth="1.2"
                          />
                          <text
                            x="32"
                            y="36"
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="bold"
                            fill="#334155"
                          >
                            BGN
                          </text>
                        </svg>
                      )}
                      <span className="text-[10px] leading-tight text-slate-700 font-serif">
                        {config.logoCaption}
                      </span>
                    </div>
                  </td>
                  <td className="border-r border-b border-slate-500 px-3 py-1.5 text-center text-[13px] tracking-wide font-serif">
                    {config.unitName}
                  </td>
                  <td className="w-[340px] border-b border-slate-500 px-3 py-1.5 text-[12px] font-serif">
                    <div className="grid grid-cols-[105px_12px_1fr]">
                      <span>No. Dokumen</span>
                      <span>:</span>
                      <span>{config.docNumber}</span>
                    </div>
                  </td>
                  {displayLogos.rightUrl && (
                    <td
                      rowSpan={3}
                      className="w-[115px] border-l border-slate-500 p-2 text-center align-middle"
                    >
                      <img
                        src={displayLogos.rightUrl}
                        alt="Logo Kanan"
                        style={{ width: `${displayLogos.rightWidthPx}px`, height: 'auto', maxHeight: '72px' }}
                        className="mx-auto object-contain"
                      />
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="border-r border-b border-slate-500 px-3 py-1.5 text-center text-[13px] font-serif">
                    {config.formLabel}
                  </td>
                  <td className="border-b border-slate-500 px-3 py-1.5 text-[12px] font-serif">
                    <div className="grid grid-cols-[105px_12px_1fr]">
                      <span>Revisi</span>
                      <span>:</span>
                      <span>{config.revision}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="border-r border-slate-500 px-3 py-1.5 text-center text-[13px] font-serif">
                    {config.formTitle}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] font-serif">
                    <div className="grid grid-cols-[105px_12px_1fr]">
                      <span>Tanggal Berlaku</span>
                      <span>:</span>
                      <span>{config.effectiveDate}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Bulan & Tahun Line */}
            <div className="mt-5 mb-3 flex items-center gap-24 px-1 text-[13px] font-bold italic text-black">
              <span>Bulan: {config.bulanLabel}</span>
              <span>Tahun: {config.tahunLabel}</span>
            </div>

            {/* Main 9-Column Table + Action Column */}
            <table className="w-full border-collapse border border-black text-[12px] text-black">
              <thead>
                <tr style={{ backgroundColor: '#D9D9D9' }}>
                  <th
                    rowSpan={2}
                    className="w-[120px] border-r border-b border-black px-2 py-1.5 text-center font-bold leading-tight"
                  >
                    {labels.kodeIdentitas}
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[92px] border-r border-b border-black px-2 py-1.5 text-center font-bold leading-tight"
                  >
                    {labels.jumlahSampel}
                  </th>
                  <th
                    colSpan={2}
                    className="border-r border-b border-black px-2 py-1 text-center font-bold"
                  >
                    {labels.kondisiSampel}
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[210px] border-r border-b border-black px-2 py-1.5 text-center font-bold"
                  >
                    {labels.penanggungJawab}
                  </th>
                  <th
                    colSpan={2}
                    className="border-r border-b border-black px-2 py-1 text-center font-bold"
                  >
                    {labels.masukChiler}
                  </th>
                  <th
                    colSpan={2}
                    className="border-r border-b border-black px-2 py-1 text-center font-bold"
                  >
                    {labels.keluarChiler}
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[44px] border-b border-black bg-slate-100 px-1 py-1 text-center text-[10px] font-semibold text-slate-600"
                  >
                    Hapus
                  </th>
                </tr>
                <tr style={{ backgroundColor: '#D9D9D9' }}>
                  <th className="w-[52px] border-r border-b border-black px-1 py-1 text-center font-bold">
                    {labels.ok}
                  </th>
                  <th className="w-[52px] border-r border-b border-black px-1 py-1 text-center font-bold">
                    {labels.nok}
                  </th>
                  <th className="w-[110px] border-r border-b border-black px-2 py-1 text-center font-bold">
                    {labels.tanggal}
                  </th>
                  <th className="w-[74px] border-r border-b border-black px-2 py-1 text-center font-bold">
                    {labels.jam}
                  </th>
                  <th className="w-[110px] border-r border-b border-black px-2 py-1 text-center font-bold">
                    {labels.tanggal}
                  </th>
                  <th className="w-[74px] border-r border-b border-black px-2 py-1 text-center font-bold">
                    {labels.jam}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const r = localRows[row.id] || row;
                  return (
                    <tr key={row.id} className="border-b border-black hover:bg-emerald-50/30">
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.kodeIdentitas}
                          onChange={(e) => handleFieldChange(row.id, 'kodeIdentitas', e.target.value)}
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-2 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.jumlahSampel}
                          onChange={(e) => handleFieldChange(row.id, 'jumlahSampel', e.target.value)}
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-2 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-black p-0 text-center">
                        <button
                          type="button"
                          onClick={() => void handleToggleOkNok(row.id, 'kondisiOk')}
                          className="h-full w-full py-1.5 text-center text-[12px] font-bold hover:bg-emerald-50"
                          title="Klik untuk centang OK"
                        >
                          {r.kondisiOk || '\u00A0'}
                        </button>
                      </td>
                      <td className="border-r border-black p-0 text-center">
                        <button
                          type="button"
                          onClick={() => void handleToggleOkNok(row.id, 'kondisiNok')}
                          className="h-full w-full py-1.5 text-center text-[12px] font-bold hover:bg-red-50"
                          title="Klik untuk centang NOK"
                        >
                          {r.kondisiNok || '\u00A0'}
                        </button>
                      </td>
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.penanggungJawab}
                          onChange={(e) =>
                            handleFieldChange(row.id, 'penanggungJawab', e.target.value)
                          }
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-2 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.masukTanggal}
                          onChange={(e) => handleFieldChange(row.id, 'masukTanggal', e.target.value)}
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-1.5 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.masukJam}
                          onChange={(e) => handleFieldChange(row.id, 'masukJam', e.target.value)}
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-1.5 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.keluarTanggal}
                          onChange={(e) => handleFieldChange(row.id, 'keluarTanggal', e.target.value)}
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-1.5 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="border-r border-black p-0">
                        <input
                          type="text"
                          value={r.keluarJam}
                          onChange={(e) => handleFieldChange(row.id, 'keluarJam', e.target.value)}
                          onBlur={() => void handleRowBlurSave(row.id)}
                          placeholder="-"
                          className="w-full bg-transparent px-1.5 py-1.5 text-center text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                      <td className="bg-slate-50/70 p-1 text-center">
                        <button
                          type="button"
                          onClick={() => void onDeleteRow(row.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Blank visual lines up to minPrintableRows (clickable to start typing) */}
                {Array.from({ length: blankPlaceholderCount }).map((_, idx) => (
                  <tr
                    key={`blank-${idx}`}
                    onClick={() => void handleAddBlankRow()}
                    title="Klik untuk menambah baris isi di sini"
                    className="h-[28px] cursor-pointer border-b border-black hover:bg-emerald-50/30"
                  >
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="border-r border-black" />
                    <td className="bg-slate-50/40" />
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Signature Verification Block (Bottom Right) */}
            <div className="mt-8 flex justify-end pr-16">
              <div className="w-[320px] text-center font-serif text-[13px] text-black">
                <div>{config.verifierLine1}</div>
                <div>{config.verifierLine2}</div>
                <div className="h-14" />
                <div className="font-normal">{config.verifierName}</div>
                <button
                  type="button"
                  onClick={() => setShowFormatEditor(true)}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-sans text-slate-400 hover:text-emerald-700"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit Format & Verifikator
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LogoUploadModal
        open={logoModalSide !== null}
        title={
          logoModalSide === 'left'
            ? 'Atur Logo Kiri (BGN) — Form Sampel Pertinggal'
            : 'Atur Logo Kanan — Form Sampel Pertinggal'
        }
        side={logoModalSide || 'left'}
        initialDataUrl={logoModalSide === 'left' ? draftLogos.leftUrl : draftLogos.rightUrl}
        initialWidthPx={
          logoModalSide === 'left' ? draftLogos.leftWidthPx : draftLogos.rightWidthPx
        }
        headerLine1={draftConfig.unitName || profile.namaSppg}
        headerLine2={draftConfig.formLabel}
        headerLine3={draftConfig.formTitle}
        allowSyncGlobal={Boolean(onSyncGlobalLeftLogo)}
        onClose={() => setLogoModalSide(null)}
        onApply={handleApplyLogoModal}
      />
    </div>
  );
};
