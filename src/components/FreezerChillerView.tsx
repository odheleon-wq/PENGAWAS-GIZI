import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Edit3,
  Layers,
  Plus,
  Save,
  Settings2,
  Snowflake,
  Trash2,
  Upload,
} from 'lucide-react';
import { BGN_FREEZER_CHILLER_DEFAULTS } from '../constants/temperatureStandards';
import { DEFAULT_FREEZER_COL_LABELS } from '../services/sppgService';
import type {
  FreezerColumnLabels,
  FreezerFormConfig,
  FreezerLogRow,
  FreezerMachine,
  FreezerMachineType,
  SppgUserProfile,
} from '../types';
import { resolveDocumentLogos } from '../utils/logoResolver';
import { useAutoSave, type AutoSaveStatus } from '../hooks/useAutoSave';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';

interface FreezerChillerViewProps {
  profile: SppgUserProfile;
  monthKey: string;
  config: FreezerFormConfig;
  machines: FreezerMachine[];
  machinesLoaded: boolean;
  activeMachineId: string | null;
  rows: FreezerLogRow[];
  onSelectMachine: (machineId: string) => void;
  onCreateMachine: (input: {
    machineType: FreezerMachineType;
    namaMesin: string;
    merk: string;
    noMesin: string;
    lokasi: string;
  }) => Promise<string | void>;
  onUpdateMachine: (
    machineId: string,
    input: Omit<FreezerMachine, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onDeleteMachine: (machineId: string) => Promise<void>;
  onSaveConfig: (
    next: Omit<FreezerFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSaveRow: (
    machineId: string,
    row: Omit<
      FreezerLogRow,
      'id' | 'uid' | 'monthKey' | 'machineId' | 'createdAt' | 'updatedAt'
    > & { id?: string }
  ) => Promise<void>;
  onDeleteRow: (machineId: string, rowId: string) => Promise<void>;
  onExportAllMachinesPdf: () => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
}

function isSuhuOutOfBgnRange(raw: string, machineType: FreezerMachineType): boolean {
  const cleaned = raw.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!cleaned) return false;
  const val = parseFloat(cleaned[0]);
  if (!Number.isFinite(val)) return false;
  if (machineType === 'freezer') {
    return val > -15; // BGN Freezer normal: -18 s/d -15 C
  }
  return val < 0 || val > 4; // BGN Chiller normal: 0 s/d 4 C
}

export const FreezerChillerView: React.FC<FreezerChillerViewProps> = ({
  profile,
  monthKey,
  config,
  machines,
  machinesLoaded,
  activeMachineId,
  rows,
  onSelectMachine,
  onCreateMachine,
  onUpdateMachine,
  onDeleteMachine,
  onSaveConfig,
  onSaveRow,
  onDeleteRow,
  onExportAllMachinesPdf,
  onSyncGlobalLeftLogo,
}) => {
  // Add-Machine Form State
  const [newType, setNewType] = useState<FreezerMachineType>('freezer');
  const [newNamaMesin, setNewNamaMesin] = useState('');
  const [newMerk, setNewMerk] = useState('');
  const [newNoMesin, setNewNoMesin] = useState('');
  const [newLokasi, setNewLokasi] = useState('Gudang Basah');
  const [addingMachine, setAddingMachine] = useState(false);

  // Format Editor Panel
  const [showFormatEditor, setShowFormatEditor] = useState(false);
  const [draftConfig, setDraftConfig] = useState<FreezerFormConfig>(config);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);

  // Local edits for active machine & rows + auto-save
  const [localMachine, setLocalMachine] = useState<FreezerMachine | null>(null);
  const [localRows, setLocalRows] = useState<Record<string, FreezerLogRow>>({});
  const dirtyRowIdsRef = useRef<Set<string>>(new Set());
  const rowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rowAutoStatus, setRowAutoStatus] = useState<AutoSaveStatus>('idle');
  const [rowLastSavedAt, setRowLastSavedAt] = useState<string>('');
  const [rowErrorMsg, setRowErrorMsg] = useState<string | null>(null);

  const autoSeededMonthsRef = useRef<Set<string>>(new Set());

  const activeMachine = useMemo(
    () => machines.find((m) => m.id === activeMachineId) || machines[0] || null,
    [machines, activeMachineId]
  );

  // Auto-seed default "Chest Freezer Sedang" matching image_8ee12d59.png when month has 0 units
  useEffect(() => {
    if (!machinesLoaded) return;
    if (machines.length === 0 && !autoSeededMonthsRef.current.has(monthKey)) {
      autoSeededMonthsRef.current.add(monthKey);
      void onCreateMachine({
        machineType: 'freezer',
        namaMesin: 'Chest Freezer Sedang',
        merk: 'Modena',
        noMesin: 'MD 0420 TLWH',
        lokasi: 'Gudang Basah',
      });
    }
  }, [machinesLoaded, machines.length, monthKey, onCreateMachine]);

  const serializeFreezerCfg = useCallback(
    (c: FreezerFormConfig) =>
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
        periodeLabel: c.periodeLabel,
        colLabels: { ...DEFAULT_FREEZER_COL_LABELS, ...(c.colLabels || {}) },
      }),
    []
  );

  const normalizedServerCfg = useMemo(
    () => ({
      ...config,
      colLabels: { ...DEFAULT_FREEZER_COL_LABELS, ...(config.colLabels || {}) },
    }),
    [config]
  );
  const cfgServerHash = useMemo(
    () => serializeFreezerCfg(normalizedServerCfg),
    [normalizedServerCfg, serializeFreezerCfg]
  );
  const lastCfgServerHashRef = useRef<string>(cfgServerHash);
  const lastCfgMonthRef = useRef<string>(monthKey);
  const draftCfgRef = useRef<FreezerFormConfig>(draftConfig);
  draftCfgRef.current = draftConfig;

  useEffect(() => {
    const monthChanged = lastCfgMonthRef.current !== monthKey;
    const isClean = serializeFreezerCfg(draftCfgRef.current) === lastCfgServerHashRef.current;
    if (monthChanged || isClean) {
      setDraftConfig(normalizedServerCfg);
    }
    lastCfgMonthRef.current = monthKey;
    lastCfgServerHashRef.current = cfgServerHash;
  }, [monthKey, normalizedServerCfg, cfgServerHash, serializeFreezerCfg]);

  const {
    status: cfgAutoStatus,
    lastSavedAtLabel: cfgLastSavedAt,
    errorMessage: cfgErrorMsg,
    markSynced: markCfgSynced,
  } = useAutoSave<FreezerFormConfig>({
    value: draftConfig,
    serverHash: cfgServerHash,
    scopeKey: `freezer_cfg:${monthKey}`,
    uid: profile.uid,
    serialize: serializeFreezerCfg,
    onSave: async (val) => {
      const merged = { ...DEFAULT_FREEZER_COL_LABELS, ...(val.colLabels || {}) };
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
        periodeLabel: val.periodeLabel,
        colLabels: merged,
      });
    },
  });

  const serializeMachine = useCallback(
    (m: FreezerMachine | null) =>
      m
        ? JSON.stringify({
            id: m.id,
            machineOrder: m.machineOrder,
            machineType: m.machineType,
            namaMesin: m.namaMesin,
            merk: m.merk,
            noMesin: m.noMesin,
            lokasi: m.lokasi,
            normalSuhuBgn: m.normalSuhuBgn,
            bgnSopNote: m.bgnSopNote,
            conclusionHeader: m.conclusionHeader,
            repairPrompt: m.repairPrompt,
            repairNote: m.repairNote,
          })
        : 'null',
    []
  );

  const machineServerHash = useMemo(
    () => serializeMachine(activeMachine),
    [activeMachine, serializeMachine]
  );
  const lastMachineIdRef = useRef<string | undefined>(activeMachine?.id);
  const lastMachineHashRef = useRef<string>(machineServerHash);
  const localMachineRef = useRef<FreezerMachine | null>(localMachine);
  localMachineRef.current = localMachine;

  useEffect(() => {
    const idChanged = lastMachineIdRef.current !== activeMachine?.id;
    const isClean = serializeMachine(localMachineRef.current) === lastMachineHashRef.current;
    if (idChanged || isClean) {
      setLocalMachine(activeMachine ? { ...activeMachine } : null);
    }
    lastMachineIdRef.current = activeMachine?.id;
    lastMachineHashRef.current = machineServerHash;
  }, [activeMachine, machineServerHash, serializeMachine]);

  const {
    status: machineAutoStatus,
    lastSavedAtLabel: machineLastSavedAt,
    errorMessage: machineErrorMsg,
  } = useAutoSave<FreezerMachine | null>({
    value: localMachine,
    serverHash: machineServerHash,
    scopeKey: `freezer_machine:${monthKey}:${activeMachine?.id || 'none'}`,
    uid: profile.uid,
    enabled: Boolean(localMachine && activeMachine),
    serialize: serializeMachine,
    onSave: async (m) => {
      if (!m) return;
      await onUpdateMachine(m.id, {
        machineOrder: m.machineOrder,
        machineType: m.machineType,
        namaMesin: m.namaMesin,
        merk: m.merk,
        noMesin: m.noMesin,
        lokasi: m.lokasi,
        normalSuhuBgn: m.normalSuhuBgn,
        bgnSopNote: m.bgnSopNote,
        conclusionHeader: m.conclusionHeader,
        repairPrompt: m.repairPrompt,
        repairNote: m.repairNote,
      });
    },
  });

  const lastRowsMachineRef = useRef<string | undefined>(activeMachine?.id);
  useEffect(() => {
    if (lastRowsMachineRef.current !== activeMachine?.id) {
      dirtyRowIdsRef.current.clear();
      if (rowTimerRef.current) {
        clearTimeout(rowTimerRef.current);
        rowTimerRef.current = null;
      }
      lastRowsMachineRef.current = activeMachine?.id;
    }
    setLocalRows((prev) => {
      const mapped: Record<string, FreezerLogRow> = {};
      rows.forEach((r) => {
        if (dirtyRowIdsRef.current.has(r.id) && prev[r.id]) {
          mapped[r.id] = prev[r.id];
        } else {
          mapped[r.id] = r;
        }
      });
      return mapped;
    });
  }, [rows, activeMachine?.id]);

  const localRowsRef = useRef(localRows);
  localRowsRef.current = localRows;
  const activeMachineRef = useRef(activeMachine);
  activeMachineRef.current = activeMachine;

  const flushDirtyRows = useCallback(async () => {
    if (rowTimerRef.current) {
      clearTimeout(rowTimerRef.current);
      rowTimerRef.current = null;
    }
    const machine = activeMachineRef.current;
    const ids = Array.from(dirtyRowIdsRef.current);
    if (!machine || ids.length === 0) return;
    setRowAutoStatus('saving');
    setRowErrorMsg(null);
    try {
      for (const id of ids) {
        const row = localRowsRef.current[id];
        dirtyRowIdsRef.current.delete(id);
        if (!row) continue;
        await onSaveRow(machine.id, {
          id: row.id,
          rowOrder: row.rowOrder,
          noLabel: row.noLabel,
          tanggal: row.tanggal,
          jamCek1: row.jamCek1,
          suhu1: row.suhu1,
          pic1: row.pic1,
          jamCek2: row.jamCek2,
          suhu2: row.suhu2,
          pic2: row.pic2,
          jamCek3: row.jamCek3,
          suhu3: row.suhu3,
          pic3: row.pic3,
          keterangan: row.keterangan,
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
      setRowErrorMsg(err instanceof Error ? err.message : 'Gagal auto-simpan log suhu.');
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
      if (rowTimerRef.current) clearTimeout(rowTimerRef.current);
      if (dirtyRowIdsRef.current.size > 0) {
        void flushDirtyRows();
      }
    };
  }, [flushDirtyRows]);

  const labels: FreezerColumnLabels = {
    ...DEFAULT_FREEZER_COL_LABELS,
    ...(config.colLabels || {}),
  };

  const draftLabels: FreezerColumnLabels = {
    ...DEFAULT_FREEZER_COL_LABELS,
    ...(draftConfig.colLabels || {}),
  };

  const handleCreateUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newNamaMesin.trim();
    if (!trimmed) return;
    setAddingMachine(true);
    try {
      await onCreateMachine({
        machineType: newType,
        namaMesin: trimmed,
        merk: newMerk.trim() || '-',
        noMesin: newNoMesin.trim() || '-',
        lokasi: newLokasi.trim() || 'Gudang Basah',
      });
      setNewNamaMesin('');
      setNewMerk('');
      setNewNoMesin('');
    } finally {
      setAddingMachine(false);
    }
  };

  const handleQuickPresetUnit = async (preset: {
    machineType: FreezerMachineType;
    namaMesin: string;
    merk: string;
    noMesin: string;
    lokasi: string;
  }) => {
    const existing = machines.find(
      (m) => m.namaMesin.trim().toLowerCase() === preset.namaMesin.toLowerCase()
    );
    if (existing) {
      onSelectMachine(existing.id);
      return;
    }
    setAddingMachine(true);
    try {
      await onCreateMachine(preset);
    } finally {
      setAddingMachine(false);
    }
  };

  const draftLogos = resolveDocumentLogos(profile, 'freezer', draftConfig);
  const displayLogos = resolveDocumentLogos(profile, 'freezer', config);

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
        periodeLabel: draftConfig.periodeLabel,
        colLabels: draftLabels,
      });

      if (localMachine) {
        await onUpdateMachine(localMachine.id, {
          machineOrder: localMachine.machineOrder,
          machineType: localMachine.machineType,
          namaMesin: localMachine.namaMesin,
          merk: localMachine.merk,
          noMesin: localMachine.noMesin,
          lokasi: localMachine.lokasi,
          normalSuhuBgn: localMachine.normalSuhuBgn,
          bgnSopNote: localMachine.bgnSopNote,
          conclusionHeader: localMachine.conclusionHeader,
          repairPrompt: localMachine.repairPrompt,
          repairNote: localMachine.repairNote,
        });
      }

      markCfgSynced(serializeFreezerCfg(draftConfig));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleMachineBlurSave = async (override?: FreezerMachine) => {
    const m = override || localMachine;
    if (!m) return;
    await onUpdateMachine(m.id, {
      machineOrder: m.machineOrder,
      machineType: m.machineType,
      namaMesin: m.namaMesin,
      merk: m.merk,
      noMesin: m.noMesin,
      lokasi: m.lokasi,
      normalSuhuBgn: m.normalSuhuBgn,
      bgnSopNote: m.bgnSopNote,
      conclusionHeader: m.conclusionHeader,
      repairPrompt: m.repairPrompt,
      repairNote: m.repairNote,
    });
  };

  const handleChangeMachineType = async (nextType: FreezerMachineType) => {
    if (!localMachine) return;
    const bgnDefault = BGN_FREEZER_CHILLER_DEFAULTS[nextType];
    const updated: FreezerMachine = {
      ...localMachine,
      machineType: nextType,
      normalSuhuBgn: bgnDefault.normalSuhuBgn,
      bgnSopNote: bgnDefault.bgnSopNote,
    };
    setLocalMachine(updated);
    await handleMachineBlurSave(updated);
  };

  const handleAddRows = async (count: number) => {
    if (!activeMachine) return;
    let nextOrder = rows.reduce((m, r) => Math.max(m, r.rowOrder), 0);
    for (let i = 0; i < count; i++) {
      nextOrder += 1;
      await onSaveRow(activeMachine.id, {
        rowOrder: nextOrder,
        noLabel: String(nextOrder),
        tanggal: '',
        jamCek1: '',
        suhu1: '',
        pic1: '',
        jamCek2: '',
        suhu2: '',
        pic2: '',
        jamCek3: '',
        suhu3: '',
        pic3: '',
        keterangan: '',
      });
    }
  };

  const handleRowFieldChange = (
    rowId: string,
    field: keyof Omit<
      FreezerLogRow,
      'id' | 'uid' | 'monthKey' | 'machineId' | 'rowOrder' | 'createdAt' | 'updatedAt'
    >,
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
    if (!activeMachine) return;
    const row = localRows[rowId];
    if (!row) return;
    dirtyRowIdsRef.current.delete(rowId);
    await onSaveRow(activeMachine.id, {
      id: row.id,
      rowOrder: row.rowOrder,
      noLabel: row.noLabel,
      tanggal: row.tanggal,
      jamCek1: row.jamCek1,
      suhu1: row.suhu1,
      pic1: row.pic1,
      jamCek2: row.jamCek2,
      suhu2: row.suhu2,
      pic2: row.pic2,
      jamCek3: row.jamCek3,
      suhu3: row.suhu3,
      pic3: row.pic3,
      keterangan: row.keterangan,
    });
    const now = new Date();
    setRowLastSavedAt(
      `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
    );
    setRowAutoStatus('saved');
  };

  const sortedRows = [...rows].sort((a, b) => a.rowOrder - b.rowOrder);

  return (
    <div className="space-y-5">
      {/* Unit / Lampiran Manager Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Form Pencatatan Suhu Freezer &amp; Chiller ({config.docNumber})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tambahkan unit Freezer atau Chiller; masing-masing unit otomatis memiliki lembar kerja lampiran tersendiri lengkap dengan standar suhu normal BGN Pusat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <AutoSaveIndicator
              status={
                cfgAutoStatus === 'saving' || cfgAutoStatus === 'pending' || cfgAutoStatus === 'error'
                  ? cfgAutoStatus
                  : machineAutoStatus === 'saving' || machineAutoStatus === 'pending' || machineAutoStatus === 'error'
                  ? machineAutoStatus
                  : rowAutoStatus !== 'idle'
                  ? rowAutoStatus
                  : machineAutoStatus !== 'idle'
                  ? machineAutoStatus
                  : cfgAutoStatus
              }
              lastSavedAtLabel={rowLastSavedAt || machineLastSavedAt || cfgLastSavedAt}
              errorMessage={rowErrorMsg || machineErrorMsg || cfgErrorMsg}
            />
            {machines.length > 1 && (
              <button
                type="button"
                onClick={() => void onExportAllMachinesPdf()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Layers className="h-3.5 w-3.5 text-emerald-600" />
                PDF Semua Lampiran ({machines.length})
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
              disabled={!activeMachine}
              onClick={() => void handleAddRows(1)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Tambah Baris
            </button>
          </div>
        </div>

        {/* Quick Preset & Custom Machine Addition */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-700 mr-1">
              Tambah Cepat Lampiran Unit:
            </span>
            {[
              {
                machineType: 'freezer' as const,
                namaMesin: 'Chest Freezer Sedang',
                merk: 'Modena',
                noMesin: 'MD 0420 TLWH',
                lokasi: 'Gudang Basah',
              },
              {
                machineType: 'freezer' as const,
                namaMesin: 'Freezer Bahan Beku',
                merk: '-',
                noMesin: '-',
                lokasi: 'Ruang Pendinginan',
              },
              {
                machineType: 'chiller' as const,
                namaMesin: 'Chiller Bahan Segar',
                merk: '-',
                noMesin: '-',
                lokasi: 'Gudang Basah',
              },
              {
                machineType: 'chiller' as const,
                namaMesin: 'Chiller Sampel Pertinggal',
                merk: '-',
                noMesin: '-',
                lokasi: 'Ruang Pendinginan',
              },
            ].map((preset) => (
              <button
                key={preset.namaMesin}
                type="button"
                disabled={addingMachine}
                onClick={() => void handleQuickPresetUnit(preset)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <Snowflake className="h-3 w-3 text-sky-600" />
                <span>+ {preset.namaMesin}</span>
              </button>
            ))}
          </div>

          <form
            onSubmit={handleCreateUnitSubmit}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[130px_1.4fr_1fr_1fr_1fr_auto] gap-2"
          >
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as FreezerMachineType)}
              aria-label="Jenis mesin pendingin"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
            >
              <option value="freezer">Freezer (-18°C s/d -15°C)</option>
              <option value="chiller">Chiller (0°C s/d 4°C)</option>
            </select>
            <input
              type="text"
              maxLength={120}
              required
              value={newNamaMesin}
              onChange={(e) => setNewNamaMesin(e.target.value)}
              placeholder="Nama Mesin (misal: Chiller Sayur 2 Pintu)..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
            <input
              type="text"
              maxLength={100}
              value={newMerk}
              onChange={(e) => setNewMerk(e.target.value)}
              placeholder="Merk (opsional)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
            <input
              type="text"
              maxLength={100}
              value={newNoMesin}
              onChange={(e) => setNewNoMesin(e.target.value)}
              placeholder="No. Mesin (opsional)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
            <input
              type="text"
              maxLength={120}
              value={newLokasi}
              onChange={(e) => setNewLokasi(e.target.value)}
              placeholder="Lokasi"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingMachine || !newNamaMesin.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Tambah Lampiran Unit
            </button>
          </form>
        </div>

        {/* Machine Lampiran Worksheet Tabs */}
        {machines.length > 0 && (
          <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-1">
                Lembar Kerja Lampiran ({machines.length}):
              </span>
              {machines.map((m, idx) => {
                const active = activeMachine?.id === m.id;
                return (
                  <div
                    key={m.id}
                    className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectMachine(m.id)}
                      className="px-3 py-1.5 text-left"
                    >
                      Lampiran {idx + 1}: {m.namaMesin}
                      <span
                        className={`ml-1.5 text-[10px] ${
                          active ? 'text-sky-300' : 'text-slate-400'
                        }`}
                      >
                        ({m.machineType === 'freezer' ? 'Freezer' : 'Chiller'})
                      </span>
                    </button>
                    {machines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void onDeleteMachine(m.id)}
                        className={`pr-2 py-1.5 ${
                          active
                            ? 'text-slate-300 hover:text-red-300'
                            : 'text-slate-400 hover:text-red-600'
                        }`}
                        title={`Hapus lampiran ${m.namaMesin}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {localMachine && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleAddRows(5)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  + 5 Baris
                </button>
              </div>
            )}
          </div>
        )}
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
                Edit Seluruh Format Kop, Label Kolom &amp; Standar BGN ({monthKey})
              </h3>
              <p className="text-xs text-slate-500">
                Semua kop dokumen, label kolom tabel, identitas mesin, dan standar suhu normal BGN dapat disesuaikan.
              </p>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                Format tersimpan
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Logo */}
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

            {/* Middle Kop */}
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
              <div className="grid grid-cols-3 gap-2">
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
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Judul Form
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={draftConfig.formTitle}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, formTitle: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Document Metadata */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Identitas Dokumen &amp; Periode</div>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Tanggal Berlaku
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.effectiveDate}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, effectiveDate: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Periode
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.periodeLabel}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, periodeLabel: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Active Unit BGN Normal Temp Standard Editor */}
          {localMachine && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">
                Jenis Mesin &amp; Standar Suhu Normal BGN Unit Aktif ({localMachine.namaMesin})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Kategori Mesin
                  </label>
                  <select
                    value={localMachine.machineType}
                    onChange={(e) =>
                      void handleChangeMachineType(e.target.value as FreezerMachineType)
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="freezer">Freezer (SOP BGN: -18°C s/d -15°C)</option>
                    <option value="chiller">Chiller (SOP BGN: 0°C s/d 4°C)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Suhu Normal BGN Terlampir
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={localMachine.normalSuhuBgn}
                    onChange={(e) =>
                      setLocalMachine((p) => (p ? { ...p, normalSuhuBgn: e.target.value } : p))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Catatan SOP BGN Unit Ini
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={localMachine.bgnSopNote}
                    onChange={(e) =>
                      setLocalMachine((p) => (p ? { ...p, bgnSopNote: e.target.value } : p))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Column Labels Editor */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">Edit Judul Kolom Tabel</div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {(
                [
                  ['no', 'No'],
                  ['tanggal', 'Tanggal'],
                  ['jamCek1', 'Jam Cek (I)'],
                  ['suhu1', 'Suhu (I)'],
                  ['pic1', 'PIC (I)'],
                  ['jamCek2', 'Jam Cek (II)'],
                  ['suhu2', 'Suhu (II)'],
                  ['pic2', 'PIC (II)'],
                  ['jamCek3', 'Jam Cek (III)'],
                  ['suhu3', 'Suhu (III)'],
                  ['pic3', 'PIC (III)'],
                  ['keterangan', 'Keterangan'],
                ] as Array<[keyof FreezerColumnLabels, string]>
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
                          ...DEFAULT_FREEZER_COL_LABELS,
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

      {/* Official Spreadsheet Sheet Matching image_8ee12d59.png */}
      {localMachine && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto p-5 sm:p-7">
            <div className="min-w-[1060px] bg-white text-black">
              {/* 1. Official 3-Column Header Box */}
              <table className="w-full border-collapse border border-slate-500 text-slate-800">
                <tbody>
                  <tr>
                    <td
                      rowSpan={3}
                      className="w-[155px] border-r border-slate-500 p-2 text-center align-middle"
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
                        <span className="text-[9.5px] leading-tight text-slate-700">
                          {config.logoCaption}
                        </span>
                      </div>
                    </td>
                    <td className="border-r border-b border-slate-500 px-3 py-1.5 text-center text-[13px] font-semibold text-slate-600">
                      {config.unitName}
                    </td>
                    <td className="w-[330px] border-b border-slate-500 px-3 py-1.5 text-[11.5px] text-slate-600">
                      <div className="grid grid-cols-[105px_12px_1fr]">
                        <span>No. Dokumen</span>
                        <span>:</span>
                        <span>{config.docNumber}</span>
                      </div>
                    </td>
                    {displayLogos.rightUrl && (
                      <td
                        rowSpan={3}
                        className="w-[110px] border-l border-slate-500 p-2 text-center align-middle"
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
                    <td className="border-r border-b border-slate-500 px-3 py-1.5 text-center text-[13px] font-semibold text-slate-600">
                      {config.formLabel}
                    </td>
                    <td className="border-b border-slate-500 px-3 py-1.5 text-[11.5px] text-slate-600">
                      <div className="grid grid-cols-[105px_12px_1fr]">
                        <span>Revisi</span>
                        <span>:</span>
                        <span>{config.revision}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border-r border-slate-500 px-3 py-1.5 text-center text-[13px] font-semibold text-slate-600 uppercase">
                      {config.formTitle}
                    </td>
                    <td className="px-3 py-1.5 text-[11.5px] text-slate-600">
                      <div className="grid grid-cols-[105px_12px_1fr]">
                        <span>Tanggal Berlaku</span>
                        <span>:</span>
                        <span>{config.effectiveDate}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 2. 5-Row Machine Metadata Table + Standar Suhu Normal BGN */}
              <table className="mt-4 w-full border-collapse border border-black text-[12px] text-black">
                <tbody>
                  <tr className="border-b border-black">
                    <td className="w-[180px] border-r border-black px-2 py-0.5 font-normal">
                      {labels.namaMesin}
                    </td>
                    <td className="w-[16px] border-r border-black text-center">:</td>
                    <td className="p-0">
                      <div className="flex items-center justify-between gap-2 pr-2">
                        <input
                          type="text"
                          value={localMachine.namaMesin}
                          onChange={(e) =>
                            setLocalMachine((p) => (p ? { ...p, namaMesin: e.target.value } : p))
                          }
                          onBlur={() => void handleMachineBlurSave()}
                          className="w-full bg-transparent px-2 py-0.5 text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                        <select
                          value={localMachine.machineType}
                          onChange={(e) =>
                            void handleChangeMachineType(e.target.value as FreezerMachineType)
                          }
                          className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-700"
                        >
                          <option value="freezer">Freezer</option>
                          <option value="chiller">Chiller</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="border-r border-black px-2 py-0.5">{labels.merk}</td>
                    <td className="border-r border-black text-center">:</td>
                    <td className="p-0">
                      <input
                        type="text"
                        value={localMachine.merk}
                        onChange={(e) =>
                          setLocalMachine((p) => (p ? { ...p, merk: e.target.value } : p))
                        }
                        onBlur={() => void handleMachineBlurSave()}
                        className="w-full bg-transparent px-2 py-0.5 text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="border-r border-black px-2 py-0.5">{labels.noMesin}</td>
                    <td className="border-r border-black text-center">:</td>
                    <td className="p-0">
                      <input
                        type="text"
                        value={localMachine.noMesin}
                        onChange={(e) =>
                          setLocalMachine((p) => (p ? { ...p, noMesin: e.target.value } : p))
                        }
                        onBlur={() => void handleMachineBlurSave()}
                        className="w-full bg-transparent px-2 py-0.5 text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="border-r border-black px-2 py-0.5">{labels.lokasi}</td>
                    <td className="border-r border-black text-center">:</td>
                    <td className="p-0">
                      <input
                        type="text"
                        value={localMachine.lokasi}
                        onChange={(e) =>
                          setLocalMachine((p) => (p ? { ...p, lokasi: e.target.value } : p))
                        }
                        onBlur={() => void handleMachineBlurSave()}
                        className="w-full bg-transparent px-2 py-0.5 text-[12px] text-black focus:bg-emerald-50 focus:outline-none"
                      />
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="border-r border-black px-2 py-0.5">{labels.periode}</td>
                    <td className="border-r border-black text-center">:</td>
                    <td className="px-2 py-0.5">{config.periodeLabel}</td>
                  </tr>
                  <tr className="bg-sky-50/70">
                    <td className="border-r border-black px-2 py-1 font-semibold">
                      Standar Suhu Normal BGN
                    </td>
                    <td className="border-r border-black text-center font-semibold">:</td>
                    <td className="p-0">
                      <div className="flex items-center justify-between gap-2 px-2 py-0.5">
                        <input
                          type="text"
                          value={localMachine.normalSuhuBgn}
                          onChange={(e) =>
                            setLocalMachine((p) =>
                              p ? { ...p, normalSuhuBgn: e.target.value } : p
                            )
                          }
                          onBlur={() => void handleMachineBlurSave()}
                          className="font-mono-num w-full bg-transparent py-0.5 text-[12px] font-bold text-slate-900 focus:bg-emerald-50 focus:outline-none"
                        />
                        <span className="text-[10.5px] font-semibold text-sky-900 whitespace-nowrap">
                          ({localMachine.machineType === 'freezer' ? 'Unit Freezer' : 'Unit Chiller'} — SOP BGN Pusat)
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 3. Main 12-Column Table Matching image_8ee12d59.png */}
              <table className="mt-5 w-full border-collapse border border-black text-[11.5px] text-black">
                <thead>
                  <tr style={{ backgroundColor: '#BFBFBF' }}>
                    <th className="w-[38px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.no}
                    </th>
                    <th className="w-[104px] border-r border-b border-black px-2 py-1.5 text-center font-bold">
                      {labels.tanggal}
                    </th>
                    <th className="w-[74px] border-r border-b border-black px-1 py-1.5 text-center font-bold leading-tight whitespace-pre-line">
                      {labels.jamCek1}
                    </th>
                    <th className="w-[62px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.suhu1}
                    </th>
                    <th className="w-[68px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.pic1}
                    </th>
                    <th className="w-[74px] border-r border-b border-black px-1 py-1.5 text-center font-bold leading-tight whitespace-pre-line">
                      {labels.jamCek2}
                    </th>
                    <th className="w-[62px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.suhu2}
                    </th>
                    <th className="w-[68px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.pic2}
                    </th>
                    <th className="w-[74px] border-r border-b border-black px-1 py-1.5 text-center font-bold leading-tight whitespace-pre-line">
                      {labels.jamCek3}
                    </th>
                    <th className="w-[62px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.suhu3}
                    </th>
                    <th className="w-[68px] border-r border-b border-black px-1 py-1.5 text-center font-bold">
                      {labels.pic3}
                    </th>
                    <th className="border-r border-b border-black px-2 py-1.5 text-center font-bold">
                      {labels.keterangan}
                    </th>
                    <th className="w-[42px] border-b border-black bg-slate-200 px-1 py-1.5 text-center text-[10px] font-semibold text-slate-600">
                      Hapus
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const r = localRows[row.id] || row;
                    const warn1 = isSuhuOutOfBgnRange(r.suhu1, localMachine.machineType);
                    const warn2 = isSuhuOutOfBgnRange(r.suhu2, localMachine.machineType);
                    const warn3 = isSuhuOutOfBgnRange(r.suhu3, localMachine.machineType);

                    return (
                      <tr key={row.id} className="border-b border-black hover:bg-emerald-50/30">
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.noLabel}
                            onChange={(e) => handleRowFieldChange(row.id, 'noLabel', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.tanggal}
                            onChange={(e) => handleRowFieldChange(row.id, 'tanggal', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            placeholder="-"
                            className="w-full bg-transparent px-1.5 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        {/* Cek I */}
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.jamCek1}
                            onChange={(e) => handleRowFieldChange(row.id, 'jamCek1', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.suhu1}
                            onChange={(e) => handleRowFieldChange(row.id, 'suhu1', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            title={
                              warn1
                                ? `Di luar standar normal BGN (${localMachine.normalSuhuBgn})`
                                : `Standar normal BGN: ${localMachine.normalSuhuBgn}`
                            }
                            className={`font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] font-semibold focus:bg-emerald-50 focus:outline-none ${
                              warn1 ? 'text-red-700 bg-red-50/70' : 'text-black'
                            }`}
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.pic1}
                            onChange={(e) => handleRowFieldChange(row.id, 'pic1', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        {/* Cek II */}
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.jamCek2}
                            onChange={(e) => handleRowFieldChange(row.id, 'jamCek2', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.suhu2}
                            onChange={(e) => handleRowFieldChange(row.id, 'suhu2', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            title={
                              warn2
                                ? `Di luar standar normal BGN (${localMachine.normalSuhuBgn})`
                                : `Standar normal BGN: ${localMachine.normalSuhuBgn}`
                            }
                            className={`font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] font-semibold focus:bg-emerald-50 focus:outline-none ${
                              warn2 ? 'text-red-700 bg-red-50/70' : 'text-black'
                            }`}
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.pic2}
                            onChange={(e) => handleRowFieldChange(row.id, 'pic2', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        {/* Cek III */}
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.jamCek3}
                            onChange={(e) => handleRowFieldChange(row.id, 'jamCek3', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.suhu3}
                            onChange={(e) => handleRowFieldChange(row.id, 'suhu3', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            title={
                              warn3
                                ? `Di luar standar normal BGN (${localMachine.normalSuhuBgn})`
                                : `Standar normal BGN: ${localMachine.normalSuhuBgn}`
                            }
                            className={`font-mono-num w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] font-semibold focus:bg-emerald-50 focus:outline-none ${
                              warn3 ? 'text-red-700 bg-red-50/70' : 'text-black'
                            }`}
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.pic3}
                            onChange={(e) => handleRowFieldChange(row.id, 'pic3', e.target.value)}
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="w-full bg-transparent px-1 py-1.5 text-center text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="border-r border-black p-0">
                          <input
                            type="text"
                            value={r.keterangan}
                            onChange={(e) =>
                              handleRowFieldChange(row.id, 'keterangan', e.target.value)
                            }
                            onBlur={() => void handleRowBlurSave(row.id)}
                            className="w-full bg-transparent px-2 py-1.5 text-left text-[11.5px] focus:bg-emerald-50 focus:outline-none"
                          />
                        </td>
                        <td className="bg-slate-50/70 p-1 text-center">
                          <button
                            type="button"
                            onClick={() => void onDeleteRow(activeMachine!.id, row.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Hapus baris"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Quick Add Row Strip Inside Table */}
                  <tr className="border-b border-black bg-slate-50/50">
                    <td colSpan={13} className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => void handleAddRows(1)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah Baris Baru di Bawah
                      </button>
                    </td>
                  </tr>

                  {/* Kesimpulan Hasil Pemeriksaan Merged Footer Row (Exact Match to image_8ee12d59.png) */}
                  <tr>
                    <td colSpan={13} className="px-2.5 py-2 text-left">
                      <div className="space-y-1">
                        <div>
                          <input
                            type="text"
                            value={localMachine.conclusionHeader}
                            onChange={(e) =>
                              setLocalMachine((p) =>
                                p ? { ...p, conclusionHeader: e.target.value } : p
                              )
                            }
                            onBlur={() => void handleMachineBlurSave()}
                            className="w-full max-w-md bg-transparent text-[12px] font-bold underline text-black focus:bg-emerald-50 focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="text"
                            value={localMachine.repairPrompt}
                            onChange={(e) =>
                              setLocalMachine((p) =>
                                p ? { ...p, repairPrompt: e.target.value } : p
                              )
                            }
                            onBlur={() => void handleMachineBlurSave()}
                            className="w-[260px] bg-transparent text-[12px] font-bold underline text-black focus:bg-emerald-50 focus:outline-none"
                          />
                          <div className="flex items-center gap-1 text-[10.5px]">
                            <span className="text-slate-400">Pilih cepat:</span>
                            {[
                              'Perlu Perbaikan: Tidak',
                              'Perlu Perbaikan: Ya',
                              'Perlu Perbaikan: Ya/Tidak*',
                            ].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  const next = { ...localMachine, repairPrompt: opt };
                                  setLocalMachine(next);
                                  void handleMachineBlurSave(next);
                                }}
                                className={`rounded border px-2 py-0.5 ${
                                  localMachine.repairPrompt === opt
                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {opt.replace('Perlu Perbaikan: ', '')}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={localMachine.repairNote}
                            onChange={(e) =>
                              setLocalMachine((p) =>
                                p ? { ...p, repairNote: e.target.value } : p
                              )
                            }
                            onBlur={() => void handleMachineBlurSave()}
                            className="w-full max-w-md bg-transparent text-[11px] italic text-black focus:bg-emerald-50 focus:outline-none"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 4. Lampiran Standar Suhu Normal Freezer & Chiller Sesuai SOP BGN Pusat */}
              <div className="mt-4 border border-black bg-white">
                <div
                  className="flex items-center justify-between border-b border-black px-3 py-1.5"
                  style={{ backgroundColor: '#DDEBF7' }}
                >
                  <span className="text-[11px] font-bold uppercase text-black">
                    LAMPIRAN STANDAR SUHU NORMAL FREEZER &amp; CHILLER SESUAI SOP BGN PUSAT
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFormatEditor(true)}
                    className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-2.5 w-2.5" />
                    Edit Standar Unit Ini
                  </button>
                </div>
                <table className="w-full border-collapse text-[11px] text-black">
                  <thead>
                    <tr className="border-b border-black bg-slate-100">
                      <th className="w-[150px] border-r border-black px-2 py-1 text-left font-bold">
                        Jenis / Nama Unit
                      </th>
                      <th className="w-[240px] border-r border-black px-2 py-1 text-left font-bold">
                        Suhu Normal BGN (°C)
                      </th>
                      <th className="px-2 py-1 text-left font-bold">Ketentuan SOP BGN Pusat</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      className={`border-b border-black ${
                        localMachine.machineType === 'freezer' ? 'bg-emerald-50 font-semibold' : ''
                      }`}
                    >
                      <td className="border-r border-black px-2 py-1">
                        Freezer {localMachine.machineType === 'freezer' ? `(${localMachine.namaMesin})` : ''}
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1">
                        {localMachine.machineType === 'freezer'
                          ? localMachine.normalSuhuBgn
                          : BGN_FREEZER_CHILLER_DEFAULTS.freezer.normalSuhuBgn}
                      </td>
                      <td className="px-2 py-1">
                        {localMachine.machineType === 'freezer'
                          ? localMachine.bgnSopNote
                          : BGN_FREEZER_CHILLER_DEFAULTS.freezer.bgnSopNote}
                      </td>
                    </tr>
                    <tr
                      className={
                        localMachine.machineType === 'chiller' ? 'bg-emerald-50 font-semibold' : ''
                      }
                    >
                      <td className="border-r border-black px-2 py-1">
                        Chiller {localMachine.machineType === 'chiller' ? `(${localMachine.namaMesin})` : ''}
                      </td>
                      <td className="font-mono-num border-r border-black px-2 py-1">
                        {localMachine.machineType === 'chiller'
                          ? localMachine.normalSuhuBgn
                          : BGN_FREEZER_CHILLER_DEFAULTS.chiller.normalSuhuBgn}
                      </td>
                      <td className="px-2 py-1">
                        {localMachine.machineType === 'chiller'
                          ? localMachine.bgnSopNote
                          : BGN_FREEZER_CHILLER_DEFAULTS.chiller.bgnSopNote}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <LogoUploadModal
        open={logoModalSide !== null}
        side={logoModalSide || 'left'}
        title={
          logoModalSide === 'left'
            ? 'Upload & Atur Ukuran Logo Kiri (BGN)'
            : 'Upload & Atur Ukuran Logo Kanan (Unit/Mitra)'
        }
        initialDataUrl={
          logoModalSide === 'left'
            ? draftConfig.logoDataUrl || draftLogos.leftUrl
            : draftConfig.logoRightDataUrl || draftLogos.rightUrl
        }
        initialWidthPx={logoModalSide === 'left' ? draftLogos.leftWidthPx : draftLogos.rightWidthPx}
        allowSyncGlobal={Boolean(onSyncGlobalLeftLogo)}
        onClose={() => setLogoModalSide(null)}
        onApply={handleApplyLogoModal}
      />
    </div>
  );
};
