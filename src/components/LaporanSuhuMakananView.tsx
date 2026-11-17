import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import { DEFAULT_FOOD_TEMP_COL_LABELS } from '../services/sppgService';
import type {
  DailyMenuEntry,
  FoodTempColumnLabels,
  FoodTempDayBlock,
  FoodTempFormConfig,
  FoodTempItemRow,
  FoodTempSheetType,
  PdfOrientation,
  SppgUserProfile,
} from '../types';
import { formatIndonesianFullDate } from '../utils/dateUtils';
import { resolveDocumentLogos } from '../utils/logoResolver';
import { exportFoodTemperatureToF4Pdf } from '../utils/pdfExporter';
import { useAutoSave, type AutoSaveStatus } from '../hooks/useAutoSave';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';

interface LaporanSuhuMakananViewProps {
  profile: SppgUserProfile;
  monthKey: string;
  config: FoodTempFormConfig;
  blocks: FoodTempDayBlock[];
  blocksLoaded: boolean;
  menuEntries: DailyMenuEntry[];
  pdfOrientation: PdfOrientation;
  onSaveConfig: (
    next: Omit<FoodTempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSaveBlock: (
    block: Omit<FoodTempDayBlock, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ) => Promise<string | void>;
  onDeleteBlock: (blockId: string) => Promise<void>;
  onSeedDefaultBlocks: (sheetType: FoodTempSheetType, count?: number) => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
}

type ViewMode = 'both' | 'masak' | 'ompreng';

function splitMenuItems(namaMenu: string): string[] {
  return namaMenu
    .split(/[\n,;]+/)
    .map((s) => s.replace(/\.$/, '').trim())
    .filter((s) => s.length > 0);
}

function isFoodTempWarning(rawSuhu: string, sheetType: FoodTempSheetType): boolean {
  const cleaned = rawSuhu.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!cleaned) return false;
  const val = parseFloat(cleaned[0]);
  if (!Number.isFinite(val)) return false;
  // Standard food safety hot holding / cooked core temperature:
  // Makanan masak >= 65 C, Masuk ompreng (siap distribusi panas) >= 60 C
  if (sheetType === 'masak') return val < 65;
  return val < 60;
}

export const LaporanSuhuMakananView: React.FC<LaporanSuhuMakananViewProps> = ({
  profile,
  monthKey,
  config,
  blocks,
  blocksLoaded,
  menuEntries,
  pdfOrientation,
  onSaveConfig,
  onSaveBlock,
  onDeleteBlock,
  onSeedDefaultBlocks,
  onSyncGlobalLeftLogo,
}) => {
  const viewModeStorageKey = `sppg_foodtemp_mode_v1:${profile.uid}`;
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = window.localStorage.getItem(`sppg_foodtemp_mode_v1:${profile.uid}`);
      if (saved === 'both' || saved === 'masak' || saved === 'ompreng') return saved;
    } catch {
      // Ignore storage error
    }
    return 'both';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(viewModeStorageKey, viewMode);
    } catch {
      // Ignore storage error
    }
  }, [viewModeStorageKey, viewMode]);

  const [showFormatEditor, setShowFormatEditor] = useState(false);
  const [draftConfig, setDraftConfig] = useState<FoodTempFormConfig>(config);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);

  const [localBlocks, setLocalBlocks] = useState<Record<string, FoodTempDayBlock>>({});
  const dirtyBlockIdsRef = useRef<Set<string>>(new Set());
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blockAutoStatus, setBlockAutoStatus] = useState<AutoSaveStatus>('idle');
  const [blockLastSavedAt, setBlockLastSavedAt] = useState<string>('');
  const [blockErrorMsg, setBlockErrorMsg] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const seededMonthsRef = useRef<Set<string>>(new Set());

  // Auto-seed 5 default date blocks (each 5 food rows) for both Masak & Masuk Ompreng matching image_019d0cdc.png
  useEffect(() => {
    if (!blocksLoaded) return;
    if (!seededMonthsRef.current.has(monthKey)) {
      const hasMasak = blocks.some((b) => b.sheetType === 'masak');
      const hasOmpreng = blocks.some((b) => b.sheetType === 'ompreng');
      if (!hasMasak || !hasOmpreng) {
        seededMonthsRef.current.add(monthKey);
        if (!hasMasak) {
          void onSeedDefaultBlocks('masak', 5);
        }
        if (!hasOmpreng) {
          void onSeedDefaultBlocks('ompreng', 5);
        }
      }
    }
  }, [blocksLoaded, blocks, monthKey, onSeedDefaultBlocks]);

  const serializeFoodTempCfg = useCallback(
    (c: FoodTempFormConfig) =>
      JSON.stringify({
        logoLeftDataUrl: c.logoLeftDataUrl || '',
        logoLeftWidthPx: c.logoLeftWidthPx || 56,
        logoRightDataUrl: c.logoRightDataUrl || '',
        logoRightWidthPx: c.logoRightWidthPx || 56,
        followGlobalLeftLogo: c.followGlobalLeftLogo !== false,
        followGlobalRightLogo: c.followGlobalRightLogo !== false,
        headerLine1: c.headerLine1,
        headerLine2: c.headerLine2,
        headerLine3: c.headerLine3,
        headerLine4: c.headerLine4,
        titleMasak: c.titleMasak,
        titleOmpreng: c.titleOmpreng,
        bulanLabel: c.bulanLabel,
        colLabels: { ...DEFAULT_FOOD_TEMP_COL_LABELS, ...(c.colLabels || {}) },
        signerLine1: c.signerLine1,
        signerLine2: c.signerLine2,
        signerName: c.signerName,
      }),
    []
  );

  const normalizedServerCfg = useMemo(
    () => ({
      ...config,
      colLabels: { ...DEFAULT_FOOD_TEMP_COL_LABELS, ...(config.colLabels || {}) },
    }),
    [config]
  );
  const cfgServerHash = useMemo(
    () => serializeFoodTempCfg(normalizedServerCfg),
    [normalizedServerCfg, serializeFoodTempCfg]
  );
  const lastCfgHashRef = useRef<string>(cfgServerHash);
  const lastCfgMonthRef = useRef<string>(monthKey);
  const draftCfgRef = useRef<FoodTempFormConfig>(draftConfig);
  draftCfgRef.current = draftConfig;

  useEffect(() => {
    const monthChanged = lastCfgMonthRef.current !== monthKey;
    const isClean = serializeFoodTempCfg(draftCfgRef.current) === lastCfgHashRef.current;
    if (monthChanged || isClean) {
      setDraftConfig(normalizedServerCfg);
    }
    lastCfgMonthRef.current = monthKey;
    lastCfgHashRef.current = cfgServerHash;
  }, [monthKey, normalizedServerCfg, cfgServerHash, serializeFoodTempCfg]);

  const {
    status: cfgAutoStatus,
    lastSavedAtLabel: cfgLastSavedAt,
    errorMessage: cfgErrorMsg,
    markSynced: markCfgSynced,
  } = useAutoSave<FoodTempFormConfig>({
    value: draftConfig,
    serverHash: cfgServerHash,
    scopeKey: `food_temp_cfg:${monthKey}`,
    uid: profile.uid,
    serialize: serializeFoodTempCfg,
    onSave: async (val) => {
      const merged = { ...DEFAULT_FOOD_TEMP_COL_LABELS, ...(val.colLabels || {}) };
      await onSaveConfig({
        logoLeftDataUrl: val.logoLeftDataUrl || '',
        logoLeftWidthPx: val.logoLeftWidthPx || 56,
        logoRightDataUrl: val.logoRightDataUrl || '',
        logoRightWidthPx: val.logoRightWidthPx || 56,
        followGlobalLeftLogo: val.followGlobalLeftLogo !== false,
        followGlobalRightLogo: val.followGlobalRightLogo !== false,
        headerLine1: val.headerLine1,
        headerLine2: val.headerLine2,
        headerLine3: val.headerLine3,
        headerLine4: val.headerLine4,
        titleMasak: val.titleMasak,
        titleOmpreng: val.titleOmpreng,
        bulanLabel: val.bulanLabel,
        colLabels: merged,
        signerLine1: val.signerLine1,
        signerLine2: val.signerLine2,
        signerName: val.signerName,
      });
    },
  });

  useEffect(() => {
    setLocalBlocks((prev) => {
      const mapped: Record<string, FoodTempDayBlock> = {};
      blocks.forEach((b) => {
        if (dirtyBlockIdsRef.current.has(b.id) && prev[b.id]) {
          mapped[b.id] = prev[b.id];
        } else {
          mapped[b.id] = {
            ...b,
            items:
              b.items && b.items.length > 0
                ? b.items.map((it) => ({ ...it }))
                : [{ namaMakanan: '', suhu: '' }],
          };
        }
      });
      return mapped;
    });
  }, [blocks]);

  const localBlocksRef = useRef(localBlocks);
  localBlocksRef.current = localBlocks;

  const flushDirtyBlocks = useCallback(async () => {
    if (blockTimerRef.current) {
      clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }
    const ids = Array.from(dirtyBlockIdsRef.current);
    if (ids.length === 0) return;
    setBlockAutoStatus('saving');
    setBlockErrorMsg(null);
    try {
      for (const id of ids) {
        const block = localBlocksRef.current[id];
        dirtyBlockIdsRef.current.delete(id);
        if (!block) continue;
        await onSaveBlock({
          id: block.id,
          sheetType: block.sheetType,
          blockOrder: block.blockOrder,
          tanggal: block.tanggal,
          paraf: block.paraf,
          items: block.items,
        });
      }
      const now = new Date();
      setBlockLastSavedAt(
        `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
      );
      setBlockAutoStatus('saved');
    } catch (err) {
      ids.forEach((id) => dirtyBlockIdsRef.current.add(id));
      setBlockAutoStatus('error');
      setBlockErrorMsg(err instanceof Error ? err.message : 'Gagal auto-simpan suhu makanan.');
    }
  }, [onSaveBlock]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirtyBlockIdsRef.current.size > 0) {
        void flushDirtyBlocks();
      }
    };
    const onUnload = () => {
      if (dirtyBlockIdsRef.current.size > 0) {
        void flushDirtyBlocks();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
      if (dirtyBlockIdsRef.current.size > 0) {
        void flushDirtyBlocks();
      }
    };
  }, [flushDirtyBlocks]);

  const labels: FoodTempColumnLabels = {
    ...DEFAULT_FOOD_TEMP_COL_LABELS,
    ...(config.colLabels || {}),
  };

  const draftLabels: FoodTempColumnLabels = {
    ...DEFAULT_FOOD_TEMP_COL_LABELS,
    ...(draftConfig.colLabels || {}),
  };

  const masakBlocks = useMemo(
    () =>
      Object.values(localBlocks)
        .filter((b) => b.sheetType === 'masak')
        .sort((a, b) => a.blockOrder - b.blockOrder),
    [localBlocks]
  );

  const omprengBlocks = useMemo(
    () =>
      Object.values(localBlocks)
        .filter((b) => b.sheetType === 'ompreng')
        .sort((a, b) => a.blockOrder - b.blockOrder),
    [localBlocks]
  );

  const draftLogos = resolveDocumentLogos(profile, 'makanan', draftConfig);
  const displayLogos = resolveDocumentLogos(profile, 'makanan', config);

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
        logoLeftDataUrl: dataUrl,
        logoLeftWidthPx: widthPx,
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
        logoLeftDataUrl: draftConfig.logoLeftDataUrl || '',
        logoLeftWidthPx: draftConfig.logoLeftWidthPx || 56,
        logoRightDataUrl: draftConfig.logoRightDataUrl || '',
        logoRightWidthPx: draftConfig.logoRightWidthPx || 56,
        followGlobalLeftLogo: draftConfig.followGlobalLeftLogo !== false,
        followGlobalRightLogo: draftConfig.followGlobalRightLogo !== false,
        headerLine1: draftConfig.headerLine1,
        headerLine2: draftConfig.headerLine2,
        headerLine3: draftConfig.headerLine3,
        headerLine4: draftConfig.headerLine4,
        titleMasak: draftConfig.titleMasak,
        titleOmpreng: draftConfig.titleOmpreng,
        bulanLabel: draftConfig.bulanLabel,
        colLabels: draftLabels,
        signerLine1: draftConfig.signerLine1,
        signerLine2: draftConfig.signerLine2,
        signerName: draftConfig.signerName,
      });
      markCfgSynced(serializeFoodTempCfg(draftConfig));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleBlockFieldChange = (
    blockId: string,
    field: 'tanggal' | 'paraf',
    value: string
  ) => {
    setLocalBlocks((prev) => {
      const target = prev[blockId];
      if (!target) return prev;
      return {
        ...prev,
        [blockId]: { ...target, [field]: value },
      };
    });
    dirtyBlockIdsRef.current.add(blockId);
    setBlockAutoStatus('pending');
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    blockTimerRef.current = setTimeout(() => {
      void flushDirtyBlocks();
    }, 850);
  };

  const handleItemFieldChange = (
    blockId: string,
    itemIndex: number,
    field: keyof FoodTempItemRow,
    value: string
  ) => {
    setLocalBlocks((prev) => {
      const target = prev[blockId];
      if (!target) return prev;
      const nextItems = target.items.map((it, idx) =>
        idx === itemIndex ? { ...it, [field]: value } : it
      );
      return {
        ...prev,
        [blockId]: { ...target, items: nextItems },
      };
    });
    dirtyBlockIdsRef.current.add(blockId);
    setBlockAutoStatus('pending');
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    blockTimerRef.current = setTimeout(() => {
      void flushDirtyBlocks();
    }, 850);
  };

  const handlePersistBlock = async (block: FoodTempDayBlock) => {
    dirtyBlockIdsRef.current.delete(block.id);
    await onSaveBlock({
      id: block.id,
      sheetType: block.sheetType,
      blockOrder: block.blockOrder,
      tanggal: block.tanggal,
      paraf: block.paraf,
      items: block.items,
    });
    const now = new Date();
    setBlockLastSavedAt(
      `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
    );
    setBlockAutoStatus('saved');
  };

  const handleAddItemRowToBlock = async (blockId: string) => {
    const target = localBlocks[blockId];
    if (!target || target.items.length >= 20) return;
    const updated: FoodTempDayBlock = {
      ...target,
      items: [...target.items, { namaMakanan: '', suhu: '' }],
    };
    setLocalBlocks((prev) => ({ ...prev, [blockId]: updated }));
    await handlePersistBlock(updated);
  };

  const handleRemoveItemRowFromBlock = async (blockId: string, itemIdx: number) => {
    const target = localBlocks[blockId];
    if (!target || target.items.length <= 1) return;
    const updated: FoodTempDayBlock = {
      ...target,
      items: target.items.filter((_, idx) => idx !== itemIdx),
    };
    setLocalBlocks((prev) => ({ ...prev, [blockId]: updated }));
    await handlePersistBlock(updated);
  };

  const handleAddDateBlocks = async (sheetType: FoodTempSheetType, count: number) => {
    const existingList = sheetType === 'masak' ? masakBlocks : omprengBlocks;
    let nextOrder = existingList.reduce((m, b) => Math.max(m, b.blockOrder), 0);
    for (let i = 0; i < count; i++) {
      nextOrder += 1;
      await onSaveBlock({
        sheetType,
        blockOrder: nextOrder,
        tanggal: '',
        paraf: '',
        items: Array.from({ length: 5 }, () => ({ namaMakanan: '', suhu: '' })),
      });
    }
  };

  const handleSyncFromDailyMenus = async (targetSheet: FoodTempSheetType) => {
    if (menuEntries.length === 0) {
      setSyncNotice('Belum ada entri pada Rekapan Menu bulan ini untuk disinkronkan.');
      setTimeout(() => setSyncNotice(null), 3000);
      return;
    }

    const sortedMenus = [...menuEntries].sort(
      (a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso)
    );
    const existingForSheet = (targetSheet === 'masak' ? masakBlocks : omprengBlocks).sort(
      (a, b) => a.blockOrder - b.blockOrder
    );

    for (let i = 0; i < sortedMenus.length; i++) {
      const entry = sortedMenus[i];
      const parsedItems = splitMenuItems(entry.namaMenu);
      const minRows = Math.max(5, parsedItems.length);
      const targetExisting = existingForSheet[i];

      const mergedItems: FoodTempItemRow[] = Array.from({ length: minRows }, (_, idx) => ({
        namaMakanan: parsedItems[idx] || targetExisting?.items?.[idx]?.namaMakanan || '',
        suhu: targetExisting?.items?.[idx]?.suhu || '',
      }));

      await onSaveBlock({
        id: targetExisting?.id,
        sheetType: targetSheet,
        blockOrder: targetExisting?.blockOrder || i + 1,
        tanggal: formatIndonesianFullDate(entry.dateIso),
        paraf: targetExisting?.paraf || '',
        items: mergedItems,
      });
    }

    setSyncNotice(
      `Berhasil menyinkronkan ${sortedMenus.length} hari menu ke formulir ${
        targetSheet === 'masak' ? 'Makanan Masak' : 'Makanan Masuk Ompreng'
      }.`
    );
    setTimeout(() => setSyncNotice(null), 3500);
  };

  const handleCopyMenuBetweenSheets = async (
    fromSheet: FoodTempSheetType,
    toSheet: FoodTempSheetType
  ) => {
    const sourceList = (fromSheet === 'masak' ? masakBlocks : omprengBlocks).sort(
      (a, b) => a.blockOrder - b.blockOrder
    );
    const destList = (toSheet === 'masak' ? masakBlocks : omprengBlocks).sort(
      (a, b) => a.blockOrder - b.blockOrder
    );

    for (let i = 0; i < sourceList.length; i++) {
      const src = sourceList[i];
      const dst = destList[i];
      const nextItems: FoodTempItemRow[] = src.items.map((it, idx) => ({
        namaMakanan: it.namaMakanan,
        suhu: dst?.items?.[idx]?.suhu || '',
      }));
      await onSaveBlock({
        id: dst?.id,
        sheetType: toSheet,
        blockOrder: dst?.blockOrder || i + 1,
        tanggal: src.tanggal,
        paraf: dst?.paraf || src.paraf,
        items: nextItems,
      });
    }

    setSyncNotice(
      `Daftar tanggal & nama makanan disalin dari ${
        fromSheet === 'masak' ? 'Makanan Masak' : 'Masuk Ompreng'
      } ke ${toSheet === 'masak' ? 'Makanan Masak' : 'Masuk Ompreng'}.`
    );
    setTimeout(() => setSyncNotice(null), 3500);
  };

  const renderKopLogo = (
    dataUrl?: string,
    fallbackText = 'BGN',
    accent = 'blue',
    widthPx = 56
  ) => {
    if (dataUrl) {
      return (
        <img
          src={dataUrl}
          alt={fallbackText}
          style={{ width: `${widthPx}px`, height: 'auto', maxHeight: '72px' }}
          className="object-contain mx-auto"
        />
      );
    }
    const isGreen = accent === 'green';
    return (
      <div
        className={`mx-auto flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 ${
          isGreen
            ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
            : 'border-blue-900 bg-blue-50 text-blue-900'
        }`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full border ${
            isGreen ? 'border-emerald-600' : 'border-blue-800'
          } text-[10px] font-bold tracking-tight`}
        >
          {fallbackText}
        </div>
      </div>
    );
  };

  const renderSingleSheet = (sheetType: FoodTempSheetType) => {
    const sheetBlocks = sheetType === 'masak' ? masakBlocks : omprengBlocks;
    const sheetTitle =
      sheetType === 'masak'
        ? config.titleMasak || 'LAPORAN SUHU MAKANAN MASAK'
        : config.titleOmpreng || 'LAPORAN SUHU MAKANAN MASUK OMPRENG';
    const otherSheet: FoodTempSheetType = sheetType === 'masak' ? 'ompreng' : 'masak';

    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Per-Sheet Action Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="text-xs font-semibold text-slate-800">
            {sheetType === 'masak'
              ? 'Form 1: Suhu Makanan Masak (Matang)'
              : 'Form 2: Suhu Makanan Masuk Ompreng'}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleSyncFromDailyMenus(sheetType)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              title="Ambil tanggal & uraian menu dari Tabel Rekapan bulan ini"
            >
              <RefreshCw className="h-3 w-3 text-emerald-600" />
              Tarik dari Menu Harian
            </button>
            <button
              type="button"
              onClick={() => void handleCopyMenuBetweenSheets(otherSheet, sheetType)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
            >
              <Copy className="h-3 w-3 text-slate-500" />
              Salin dari {otherSheet === 'masak' ? 'Masak' : 'Ompreng'}
            </button>
            <button
              type="button"
              onClick={() =>
                exportFoodTemperatureToF4Pdf({
                  config,
                  profile,
                  blocks: Object.values(localBlocks),
                  sheetsToExport: [sheetType],
                  orientation: pdfOrientation,
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              <Download className="h-3 w-3" />
              PDF Form Ini
            </button>
          </div>
        </div>

        {/* Printable Sheet Canvas matching image_019d0cdc.png */}
        <div className="overflow-x-auto p-4 sm:p-6">
          <div className="min-w-[540px] bg-white text-black">
            {/* Official Kop Surat (Left Logo, 4-Line Center Text, Right Logo) */}
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 pb-2">
              <div className="min-w-[68px] flex justify-center">
                {renderKopLogo(displayLogos.leftUrl, 'BGN', 'blue', displayLogos.leftWidthPx)}
              </div>
              <div className="text-center leading-tight">
                <div className="text-[13px] font-bold tracking-wide text-slate-800 uppercase">
                  {config.headerLine1}
                </div>
                <div className="text-[12.5px] font-bold tracking-wide text-slate-800 uppercase">
                  {config.headerLine2}
                </div>
                <div className="text-[11px] font-semibold tracking-wide text-slate-700 uppercase">
                  {config.headerLine3}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  {config.headerLine4}
                </div>
              </div>
              <div className="min-w-[68px] flex justify-center">
                {renderKopLogo(displayLogos.rightUrl, 'SPPG', 'green', displayLogos.rightWidthPx)}
              </div>
            </div>

            {/* Double Horizontal Kop Divider */}
            <div className="border-t-2 border-black" />
            <div className="mt-[2px] border-t border-black" />

            {/* Centered Bold Italic Title */}
            <h3 className="mt-4 text-center text-[13px] font-bold italic tracking-wide text-black uppercase">
              {sheetTitle}
            </h3>

            {/* Bulan : ... */}
            <div className="mt-3 mb-1.5 text-[12px] font-bold text-black">
              Bulan : <span className="font-semibold">{config.bulanLabel}</span>
            </div>

            {/* 4-Column Table matching Image 2 */}
            <table className="w-full border-collapse border border-black text-[11.5px] text-black">
              <thead>
                <tr style={{ backgroundColor: '#D9D9D9' }}>
                  <th className="w-[125px] border border-black px-2 py-2 text-center font-bold underline">
                    {labels.tanggal}
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold underline">
                    {labels.namaMakanan}
                  </th>
                  <th className="w-[118px] border border-black px-2 py-2 text-center font-bold underline">
                    {labels.suhuMakanan}
                  </th>
                  <th className="w-[95px] border border-black px-2 py-2 text-center font-bold underline">
                    {labels.paraf}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheetBlocks.map((block) => {
                  const items =
                    block.items && block.items.length > 0
                      ? block.items
                      : [{ namaMakanan: '', suhu: '' }];
                  const span = items.length;

                  return (
                    <React.Fragment key={block.id}>
                      {items.map((item, itemIdx) => {
                        const warn = isFoodTempWarning(item.suhu, sheetType);
                        return (
                          <tr key={`${block.id}_${itemIdx}`} className="group">
                            {itemIdx === 0 && (
                              <td
                                rowSpan={span}
                                className="border border-black p-1 align-middle text-center bg-white"
                              >
                                <textarea
                                  rows={2}
                                  value={block.tanggal}
                                  onChange={(e) =>
                                    handleBlockFieldChange(block.id, 'tanggal', e.target.value)
                                  }
                                  onBlur={() => void handlePersistBlock(block)}
                                  placeholder="Tgl / Hari..."
                                  className="w-full resize-none bg-transparent text-center text-[11px] font-medium text-black placeholder:text-slate-300 focus:bg-emerald-50/40 focus:outline-none"
                                />
                                <div className="mt-1 flex flex-wrap items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() => void handleAddItemRowToBlock(block.id)}
                                    className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                                    title="Tambah baris makanan di tanggal ini"
                                  >
                                    +Baris
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void onDeleteBlock(block.id)}
                                    className="rounded border border-slate-300 bg-slate-50 p-0.5 text-slate-500 hover:border-red-300 hover:text-red-600"
                                    title="Hapus blok tanggal"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </td>
                            )}

                            <td className="border border-black px-1.5 py-0.5 align-middle">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={item.namaMakanan}
                                  onChange={(e) =>
                                    handleItemFieldChange(
                                      block.id,
                                      itemIdx,
                                      'namaMakanan',
                                      e.target.value
                                    )
                                  }
                                  onBlur={() => void handlePersistBlock(block)}
                                  placeholder={`Menu / Item ${itemIdx + 1}`}
                                  className="w-full bg-transparent py-0.5 text-[11px] text-black placeholder:text-slate-300 focus:bg-emerald-50/40 focus:outline-none"
                                />
                                {items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleRemoveItemRowFromBlock(block.id, itemIdx)
                                    }
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5"
                                    title="Hapus baris makanan ini"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>

                            <td
                              className={`border border-black px-1.5 py-0.5 text-center align-middle ${
                                warn ? 'bg-amber-50' : ''
                              }`}
                            >
                              <input
                                type="text"
                                value={item.suhu}
                                onChange={(e) =>
                                  handleItemFieldChange(
                                    block.id,
                                    itemIdx,
                                    'suhu',
                                    e.target.value
                                  )
                                }
                                onBlur={() => void handlePersistBlock(block)}
                                placeholder={sheetType === 'masak' ? '75 °C' : '65 °C'}
                                className={`font-mono-num w-full bg-transparent py-0.5 text-center text-[11px] placeholder:text-slate-300 focus:outline-none ${
                                  warn ? 'font-semibold text-amber-800' : 'text-black'
                                }`}
                              />
                            </td>

                            {itemIdx === 0 && (
                              <td
                                rowSpan={span}
                                className="border border-black p-1 align-middle text-center bg-white"
                              >
                                <input
                                  type="text"
                                  value={block.paraf}
                                  onChange={(e) =>
                                    handleBlockFieldChange(block.id, 'paraf', e.target.value)
                                  }
                                  onBlur={() => void handlePersistBlock(block)}
                                  placeholder="Paraf"
                                  className="w-full bg-transparent py-1 text-center text-[11px] text-black placeholder:text-slate-300 focus:bg-emerald-50/40 focus:outline-none"
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Add More Date Blocks Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono-num text-[11px] text-slate-500">
                {sheetBlocks.length} blok tanggal tercatat
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleAddDateBlocks(sheetType, 1)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3 w-3" />
                  Tambah 1 Blok Tanggal
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddDateBlocks(sheetType, 5)}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-900"
                >
                  <Plus className="h-3 w-3" />
                  Tambah 5 Blok
                </button>
              </div>
            </div>

            {/* Bottom-Right Pengawas Gizi Signature Block matching Image 2 */}
            <div className="mt-7 flex justify-end pr-6 sm:pr-12">
              <div className="text-left text-[11.5px] font-bold text-black leading-snug min-w-[200px]">
                <div>{config.signerLine1 || 'Pengawas Gizi'}</div>
                <div>{config.signerLine2 || 'SPPG'}</div>
                <div className="mt-12">{config.signerName || ''}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-emerald-600" />
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Laporan Suhu Makanan Masak & Masuk Ompreng
              </h2>
              <p className="text-[11px] text-slate-500">
                Format BGN dua lembar kerja · Klik sel tabel untuk mengisi langsung, semua teks kop & kolom bisa diedit.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AutoSaveIndicator
            status={
              cfgAutoStatus === 'saving' || cfgAutoStatus === 'pending' || cfgAutoStatus === 'error'
                ? cfgAutoStatus
                : blockAutoStatus !== 'idle'
                ? blockAutoStatus
                : cfgAutoStatus
            }
            lastSavedAtLabel={blockLastSavedAt || cfgLastSavedAt}
            errorMessage={blockErrorMsg || cfgErrorMsg}
          />
          {/* Segmented View Switch */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'both'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2 Form Berdampingan
            </button>
            <button
              type="button"
              onClick={() => setViewMode('masak')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'masak'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Makanan Masak
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ompreng')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'ompreng'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Masuk Ompreng
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFormatEditor((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              showFormatEditor
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Edit Kop & Format
          </button>

          <button
            type="button"
            onClick={() =>
              exportFoodTemperatureToF4Pdf({
                config,
                profile,
                blocks: Object.values(localBlocks),
                sheetsToExport: ['masak', 'ompreng'],
                orientation: pdfOrientation,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh PDF Kedua Form
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800">
          <span>{syncNotice}</span>
          <button
            type="button"
            onClick={() => setSyncNotice(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Collapsible Format & Kop Editor */}
      {showFormatEditor && (
        <form
          onSubmit={handleSaveFormatSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pengaturan Kop Surat, Logo, Judul & Tanda Tangan
              </h3>
              <p className="text-xs text-slate-500">
                Semua teks pada header, judul laporan, label kolom, dan pengawas gizi dapat disesuaikan.
              </p>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                Tersimpan
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Baris Kop 1 (Instansi Pusat)
                </label>
                <input
                  type="text"
                  value={draftConfig.headerLine1}
                  onChange={(e) =>
                    setDraftConfig((p) => ({ ...p, headerLine1: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Baris Kop 2 (Unit Layanan)
                </label>
                <input
                  type="text"
                  value={draftConfig.headerLine2}
                  onChange={(e) =>
                    setDraftConfig((p) => ({ ...p, headerLine2: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Baris Kop 3 (Kecamatan / Kab / Kota)
                </label>
                <input
                  type="text"
                  value={draftConfig.headerLine3}
                  onChange={(e) =>
                    setDraftConfig((p) => ({ ...p, headerLine3: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Baris Kop 4 (Alamat Lengkap)
                </label>
                <input
                  type="text"
                  value={draftConfig.headerLine4}
                  onChange={(e) =>
                    setDraftConfig((p) => ({ ...p, headerLine4: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Judul Form 1
                  </label>
                  <input
                    type="text"
                    value={draftConfig.titleMasak}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, titleMasak: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Judul Form 2
                  </label>
                  <input
                    type="text"
                    value={draftConfig.titleOmpreng}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, titleOmpreng: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Label Bulan (misal: November 2026)
                </label>
                <input
                  type="text"
                  value={draftConfig.bulanLabel}
                  onChange={(e) =>
                    setDraftConfig((p) => ({ ...p, bulanLabel: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jabatan Penandatangan
                  </label>
                  <input
                    type="text"
                    value={draftConfig.signerLine1}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, signerLine1: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit SPPG Penandatangan
                  </label>
                  <input
                    type="text"
                    value={draftConfig.signerLine2}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, signerLine2: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Penandatangan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={draftConfig.signerName}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, signerName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dual Logo Uploads via LogoUploadModal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      Logo Kiri (BGN · {draftLogos.leftWidthPx}px)
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogoModalSide('left')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Upload className="h-3 w-3 text-emerald-600" />
                      Atur Logo Kiri
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftConfig.followGlobalLeftLogo !== false}
                      onChange={(e) =>
                        setDraftConfig((p) => ({ ...p, followGlobalLeftLogo: e.target.checked }))
                      }
                      className="rounded accent-emerald-600"
                    />
                    Ikuti Logo BGN Global
                  </label>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      Logo Kanan (SPPG · {draftLogos.rightWidthPx}px)
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogoModalSide('right')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Upload className="h-3 w-3 text-blue-600" />
                      Atur Logo Kanan
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftConfig.followGlobalRightLogo !== false}
                      onChange={(e) =>
                        setDraftConfig((p) => ({ ...p, followGlobalRightLogo: e.target.checked }))
                      }
                      className="rounded accent-blue-600"
                    />
                    Ikuti Logo Kanan Global
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Column Labels */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Label Header Kolom Tabel
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Kolom 1</label>
                <input
                  type="text"
                  value={draftLabels.tanggal}
                  onChange={(e) =>
                    setDraftConfig((p) => ({
                      ...p,
                      colLabels: { ...draftLabels, tanggal: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Kolom 2</label>
                <input
                  type="text"
                  value={draftLabels.namaMakanan}
                  onChange={(e) =>
                    setDraftConfig((p) => ({
                      ...p,
                      colLabels: { ...draftLabels, namaMakanan: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Kolom 3</label>
                <input
                  type="text"
                  value={draftLabels.suhuMakanan}
                  onChange={(e) =>
                    setDraftConfig((p) => ({
                      ...p,
                      colLabels: { ...draftLabels, suhuMakanan: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Kolom 4</label>
                <input
                  type="text"
                  value={draftLabels.paraf}
                  onChange={(e) =>
                    setDraftConfig((p) => ({
                      ...p,
                      colLabels: { ...draftLabels, paraf: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowFormatEditor(false)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      )}

      {/* Dual or Single Sheet Display */}
      {viewMode === 'both' ? (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          {renderSingleSheet('masak')}
          {renderSingleSheet('ompreng')}
        </div>
      ) : viewMode === 'masak' ? (
        renderSingleSheet('masak')
      ) : (
        renderSingleSheet('ompreng')
      )}

      {/* BGN Food Temperature Reference Footer Note */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Acuan Suhu Keamanan Pangan BGN:</span>{' '}
        Makanan matang (pemasakan inti) dianjurkan <span className="font-mono-num font-semibold text-slate-900">≥ 65°C – 85°C</span>, dan suhu makanan saat masuk ompreng / siap distribusi panas dijaga <span className="font-mono-num font-semibold text-slate-900">≥ 60°C</span> untuk menghindari zona bahaya pertumbuhan bakteri (5°C – 60°C). Nilai suhu di bawah ambang otomatis ditandai kuning untuk pengecekan ulang.
      </div>

      <LogoUploadModal
        open={logoModalSide !== null}
        side={logoModalSide || 'left'}
        title={
          logoModalSide === 'left'
            ? 'Upload & Atur Ukuran Logo Kiri (BGN)'
            : 'Upload & Atur Ukuran Logo Kanan (SPPG/Mitra)'
        }
        initialDataUrl={
          logoModalSide === 'left'
            ? draftConfig.logoLeftDataUrl || draftLogos.leftUrl
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
