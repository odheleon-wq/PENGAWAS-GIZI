import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Edit3,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CATEGORY_MAP,
  TARGET_CATEGORIES,
} from '../constants/nutritionCategories';
import { getDefaultFoodCostDayPlan } from '../services/sppgService';
import type {
  DailyMenuEntry,
  DailyPmRecord,
  FoodCostDayPlan,
  FoodCostIngredientRow,
  FoodCostPortionScope,
  FoodCostPurchaseUnit,
  FoodCostWorksheet,
  MasterMenuPlan,
  NutritionValues,
  SppgUserProfile,
  TargetCategoryId,
  TkpiFoodItem,
  TkpiSyncConfig,
} from '../types';
import { formatIndonesianFullDate } from '../utils/dateUtils';
import {
  computeFoodCostWorksheet,
  computePmSummary,
  extractNutritionValuesFromWorksheet,
  getWorksheetDefaultTitle,
  getWorksheetSideLabelDefault,
} from '../utils/foodCostCalculator';
import { resolveDocumentLogos } from '../utils/logoResolver';
import {
  buildFoodCostRowsFromMasterDay,
  findMatchingMasterMenuForDate,
  formatMasterMenuDayAsMenuString,
} from '../utils/masterMenuHelper';
import { mergeTkpiCatalog } from '../utils/tkpiCsvParser';
import { LogoUploadModal } from './LogoUploadModal';

interface FoodCostNutritionViewProps {
  uid: string;
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  pmRecords: DailyPmRecord[];
  foodCostPlans: FoodCostDayPlan[];
  masterMenus?: MasterMenuPlan[];
  tkpiSyncConfig: TkpiSyncConfig | null;
  activeDateIso: string;
  onChangeDateIso: (dateIso: string) => void;
  onSaveDayPlan: (
    plan: Omit<FoodCostDayPlan, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSyncNutritionToEntry: (
    entryId: string,
    nutritionByCategory: Partial<Record<TargetCategoryId, NutritionValues>>
  ) => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
  onOpenTkpiModal: () => void;
  onExportPdf: (
    plan: FoodCostDayPlan,
    pmRecord: DailyPmRecord | null,
    activeWorksheetId?: string
  ) => void;
}

function fmtNum(val: number, decimals = 1): string {
  if (!Number.isFinite(val)) return '0';
  return val.toFixed(decimals);
}

function fmtRp(val: number): string {
  if (!Number.isFinite(val) || val === 0) return '-';
  return Math.round(val).toLocaleString('id-ID');
}

export const FoodCostNutritionView: React.FC<FoodCostNutritionViewProps> = ({
  uid,
  profile,
  monthKey,
  entries,
  pmRecords,
  foodCostPlans,
  masterMenus = [],
  tkpiSyncConfig,
  activeDateIso,
  onChangeDateIso,
  onSaveDayPlan,
  onSyncNutritionToEntry,
  onSyncGlobalLeftLogo,
  onOpenTkpiModal,
  onExportPdf,
}) => {
  const [saving, setSaving] = useState(false);
  const [showHeaderEdit, setShowHeaderEdit] = useState(false);
  const [showAddSheetModal, setShowAddSheetModal] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);
  const autoLoadedMasterRef = useRef<Set<string>>(new Set());

  // New Worksheet Modal State
  const [newSheetCategories, setNewSheetCategories] = useState<TargetCategoryId[]>(['tk_paud_lb']);
  const [newSheetMode, setNewSheetMode] = useState<'gabung' | 'pisah'>('gabung');
  const [newSheetPortion, setNewSheetPortion] = useState<FoodCostPortionScope>('auto');
  const [newSheetAllergy, setNewSheetAllergy] = useState(false);

  // TKPI Ingredient Picker State (for currently searching row)
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // Row detail/unit editor popover state
  const [editingUnitRowId, setEditingUnitRowId] = useState<string | null>(null);

  const matchedEntry = useMemo(
    () => entries.find((e) => e.dateIso === activeDateIso) || null,
    [entries, activeDateIso]
  );

  const activePmRecord = useMemo(
    () => pmRecords.find((r) => r.dateIso === activeDateIso) || null,
    [pmRecords, activeDateIso]
  );

  const pmSummary = useMemo(() => computePmSummary(activePmRecord), [activePmRecord]);

  const existingPlan = useMemo(
    () => foodCostPlans.find((p) => p.dateIso === activeDateIso) || null,
    [foodCostPlans, activeDateIso]
  );

  const [draft, setDraft] = useState<FoodCostDayPlan>(() =>
    existingPlan ||
    getDefaultFoodCostDayPlan(uid, monthKey, activeDateIso, matchedEntry?.hariKe || 1, profile)
  );

  useEffect(() => {
    if (existingPlan) {
      setDraft(existingPlan);
    } else {
      setDraft(
        getDefaultFoodCostDayPlan(
          uid,
          monthKey,
          activeDateIso,
          matchedEntry?.hariKe || 1,
          profile
        )
      );
    }
  }, [existingPlan, uid, monthKey, activeDateIso, matchedEntry?.hariKe, profile]);

  const [activeSheetId, setActiveSheetId] = useState<string>(
    () => draft.worksheets[0]?.id || ''
  );

  const activeWorksheet = useMemo(() => {
    return draft.worksheets.find((w) => w.id === activeSheetId) || draft.worksheets[0] || null;
  }, [draft.worksheets, activeSheetId]);

  useEffect(() => {
    if (activeWorksheet && activeWorksheet.id !== activeSheetId) {
      setActiveSheetId(activeWorksheet.id);
    }
  }, [activeWorksheet, activeSheetId]);

  const tkpiCatalog = useMemo(
    () =>
      mergeTkpiCatalog(
        tkpiSyncConfig?.syncedItems || [],
        tkpiSyncConfig?.customItems || []
      ),
    [tkpiSyncConfig]
  );

  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return tkpiCatalog.slice(0, 40);
    return tkpiCatalog
      .filter((item) => item.namaBahan.toLowerCase().includes(q))
      .slice(0, 50);
  }, [tkpiCatalog, pickerSearch]);

  const computedWorksheet = useMemo(() => {
    if (!activeWorksheet) return null;
    return computeFoodCostWorksheet(activeWorksheet, pmSummary);
  }, [activeWorksheet, pmSummary]);

  const latestOtherPlan = useMemo(() => {
    const others = foodCostPlans.filter(
      (p) => p.dateIso !== activeDateIso && p.worksheets.some((w) => w.rows.length > 0)
    );
    return others[others.length - 1] || null;
  }, [foodCostPlans, activeDateIso]);

  const resolvedLogos = useMemo(
    () => resolveDocumentLogos(profile, 'foodcost', draft),
    [profile, draft]
  );

  const matchedMaster = useMemo(
    () => findMatchingMasterMenuForDate(masterMenus, activeDateIso, activeWorksheet?.categoryIds),
    [masterMenus, activeDateIso, activeWorksheet?.categoryIds]
  );

  const matchedMasterSummary = useMemo(() => {
    if (!matchedMaster) return '';
    return formatMasterMenuDayAsMenuString(matchedMaster.day);
  }, [matchedMaster]);

  // Auto-populate empty worksheet rows from Master Menu when opening a planned date
  useEffect(() => {
    if (!activeWorksheet || !matchedMaster || !matchedMasterSummary) return;
    if (activeWorksheet.rows.length > 0) return;
    const key = `${activeDateIso}_${activeWorksheet.id}_${matchedMaster.plan.id}`;
    if (autoLoadedMasterRef.current.has(key)) return;
    autoLoadedMasterRef.current.add(key);

    const generatedRows = buildFoodCostRowsFromMasterDay(matchedMaster.day, tkpiCatalog);
    if (generatedRows.length === 0) return;

    setDraft((prev) => ({
      ...prev,
      worksheets: prev.worksheets.map((ws) =>
        ws.id === activeWorksheet.id && ws.rows.length === 0
          ? { ...ws, rows: generatedRows }
          : ws
      ),
    }));
  }, [activeWorksheet, matchedMaster, matchedMasterSummary, activeDateIso, tkpiCatalog]);

  const persistPlan = async (next: FoodCostDayPlan) => {
    setDraft(next);
    setSaving(true);
    try {
      await onSaveDayPlan({
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
        worksheets: next.worksheets,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadFromMasterMenu = () => {
    if (!activeWorksheet || !matchedMaster || !matchedMasterSummary) return;
    const generatedRows = buildFoodCostRowsFromMasterDay(matchedMaster.day, tkpiCatalog);
    if (generatedRows.length === 0) return;
    const nextPlan: FoodCostDayPlan = {
      ...draft,
      worksheets: draft.worksheets.map((ws) =>
        ws.id === activeWorksheet.id ? { ...ws, rows: generatedRows } : ws
      ),
    };
    void persistPlan(nextPlan);
    setSyncNotice(
      `Menu hari ${formatIndonesianFullDate(activeDateIso)} dimuat otomatis dari "${matchedMaster.plan.title}" (${generatedRows.length} bahan TKPI 2020).`
    );
    setTimeout(() => setSyncNotice(null), 5000);
  };

  const updateActiveWorksheet = (
    updater: (ws: FoodCostWorksheet) => FoodCostWorksheet,
    immediateSave = false
  ) => {
    if (!activeWorksheet) return;
    const nextWorksheets = draft.worksheets.map((ws) =>
      ws.id === activeWorksheet.id ? updater(ws) : ws
    );
    const nextPlan = { ...draft, worksheets: nextWorksheets };
    if (immediateSave) {
      void persistPlan(nextPlan);
    } else {
      setDraft(nextPlan);
    }
  };

  const handleAddRow = () => {
    if (!activeWorksheet) return;
    const newRow: FoodCostIngredientRow = {
      id: `ing_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      menuName: '',
      bahanMakanan: '',
      beratBb: 0,
      urt: '',
      energiPer100: 0,
      proteinPer100: 0,
      lemakPer100: 0,
      khPer100: 0,
      seratPer100: 0,
      bddPercent: 100,
      jumlahManfaatOverride: null,
      purchaseUnit: 'kg',
      gramPerUnit: null,
      hargaSatuan: 0,
    };
    updateActiveWorksheet((ws) => ({ ...ws, rows: [...ws.rows, newRow] }), true);
    setPickerRowId(newRow.id);
    setPickerSearch('');
  };

  const handleSelectTkpiItem = (rowId: string, item: TkpiFoodItem) => {
    const unitGuess: FoodCostPurchaseUnit =
      item.defaultSatuan?.toLowerCase() === 'rak'
        ? 'rak'
        : item.defaultSatuan?.toLowerCase() === 'lembar'
        ? 'lembar'
        : item.defaultSatuan?.toLowerCase() === 'potong'
        ? 'potong'
        : item.defaultSatuan?.toLowerCase() === 'ekor'
        ? 'ekor'
        : 'kg';

    updateActiveWorksheet(
      (ws) => ({
        ...ws,
        rows: ws.rows.map((r) =>
          r.id === rowId
            ? {
                ...r,
                tkpiId: item.id,
                bahanMakanan: item.namaBahan,
                energiPer100: item.energi,
                proteinPer100: item.protein,
                lemakPer100: item.lemak,
                khPer100: item.kh,
                seratPer100: item.serat,
                bddPercent: item.bdd > 0 ? item.bdd : 100,
                ...(item.defaultHargaSatuan && item.defaultHargaSatuan > 0
                  ? { hargaSatuan: item.defaultHargaSatuan }
                  : {}),
                ...(item.defaultSatuan ? { purchaseUnit: unitGuess } : {}),
              }
            : r
        ),
      }),
      true
    );
    setPickerRowId(null);
    setPickerSearch('');
  };

  const handleUpdateRow = (rowId: string, patch: Partial<FoodCostIngredientRow>) => {
    updateActiveWorksheet((ws) => ({
      ...ws,
      rows: ws.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  };

  const handleDeleteRow = (rowId: string) => {
    updateActiveWorksheet(
      (ws) => ({
        ...ws,
        rows: ws.rows.filter((r) => r.id !== rowId),
      }),
      true
    );
  };

  const handleCreateWorksheetsFromModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSheetCategories.length === 0) return;

    const created: FoodCostWorksheet[] = [];
    if (newSheetMode === 'pisah' && newSheetCategories.length > 1) {
      newSheetCategories.forEach((catId, idx) => {
        created.push({
          id: `ws_${Date.now().toString(36)}_${idx}`,
          title: getWorksheetDefaultTitle([catId], newSheetAllergy, newSheetPortion),
          sideLabel: getWorksheetSideLabelDefault([catId], newSheetAllergy),
          categoryIds: [catId],
          portionScope: newSheetPortion,
          isAllergySheet: newSheetAllergy,
          bumbuPercent: 10,
          rows: [],
        });
      });
    } else {
      created.push({
        id: `ws_${Date.now().toString(36)}`,
        title: getWorksheetDefaultTitle(newSheetCategories, newSheetAllergy, newSheetPortion),
        sideLabel: getWorksheetSideLabelDefault(newSheetCategories, newSheetAllergy),
        categoryIds: newSheetCategories,
        portionScope: newSheetPortion,
        isAllergySheet: newSheetAllergy,
        bumbuPercent: 10,
        rows: [],
      });
    }

    const nextPlan: FoodCostDayPlan = {
      ...draft,
      worksheets: [...draft.worksheets, ...created],
    };
    void persistPlan(nextPlan);
    if (created[0]) {
      setActiveSheetId(created[0].id);
    }
    setShowAddSheetModal(false);
  };

  const handleQuickAddAllergyWorksheet = () => {
    const newWs: FoodCostWorksheet = {
      id: `ws_alergi_${Date.now().toString(36)}`,
      title: 'NILAI GIZI DAN FOOD COST LEMBAR KERJA ALERGI / DIET',
      sideLabel: 'A L E R G I',
      categoryIds: activeWorksheet?.categoryIds || TARGET_CATEGORIES.map((c) => c.id),
      portionScope: 'semua',
      isAllergySheet: true,
      bumbuPercent: 10,
      rows: [],
    };
    const nextPlan: FoodCostDayPlan = {
      ...draft,
      worksheets: [...draft.worksheets, newWs],
    };
    void persistPlan(nextPlan);
    setActiveSheetId(newWs.id);
  };

  const handleDeleteWorksheet = (wsId: string) => {
    if (draft.worksheets.length <= 1) return;
    const filtered = draft.worksheets.filter((w) => w.id !== wsId);
    const nextPlan = { ...draft, worksheets: filtered };
    void persistPlan(nextPlan);
    if (activeSheetId === wsId && filtered[0]) {
      setActiveSheetId(filtered[0].id);
    }
  };

  const handleCopyFromPreviousDay = () => {
    if (!latestOtherPlan) return;
    const clonedSheets: FoodCostWorksheet[] = latestOtherPlan.worksheets.map((w, wi) => ({
      ...w,
      id: `ws_${Date.now().toString(36)}_${wi}`,
      rows: w.rows.map((r, ri) => ({
        ...r,
        id: `ing_${Date.now().toString(36)}_${wi}_${ri}`,
      })),
    }));
    const nextPlan: FoodCostDayPlan = {
      ...draft,
      worksheets: clonedSheets,
    };
    void persistPlan(nextPlan);
    if (clonedSheets[0]) setActiveSheetId(clonedSheets[0].id);
  };

  const handleSyncToMonthlyNutrition = async () => {
    if (!matchedEntry || !computedWorksheet) {
      setSyncNotice(
        'Belum ada entri Menu Harian untuk tanggal ini di Tabel Rekapan. Tambahkan menu harian terlebih dahulu agar nilai gizi bisa tersinkron.'
      );
      return;
    }

    const updatedMap: Partial<Record<TargetCategoryId, NutritionValues>> = {
      ...(matchedEntry.nutritionByCategory || {}),
    };

    draft.worksheets.forEach((ws) => {
      if (ws.isAllergySheet) return;
      const comp = computeFoodCostWorksheet(ws, pmSummary);
      const val = extractNutritionValuesFromWorksheet(comp);
      ws.categoryIds.forEach((catId) => {
        updatedMap[catId] = val;
      });
    });

    await onSyncNutritionToEntry(matchedEntry.id, updatedMap);
    setSyncNotice(
      `Nilai Gizi hari ke-${matchedEntry.hariKe} (${formatIndonesianFullDate(
        activeDateIso
      )}) berhasil disinkronkan ke Rekapan Nilai Gizi Bulanan.`
    );
    setTimeout(() => setSyncNotice(null), 5000);
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
      await persistPlan({
        ...draft,
        logoDataUrl: dataUrl,
        logoWidthPx: widthPx,
        followGlobalLeftLogo: syncAsGlobalBgn ? true : false,
      });
    } else if (logoModalSide === 'right') {
      await persistPlan({
        ...draft,
        logoRightDataUrl: dataUrl,
        logoRightWidthPx: widthPx,
        followGlobalRightLogo: false,
      });
    }
  };

  const getNeedBadgeStyle = (pct: number): React.CSSProperties => {
    if (pct >= 90 && pct <= 110) {
      return { backgroundColor: '#92D050', color: '#000000' };
    }
    return { backgroundColor: '#FF0000', color: '#000000' };
  };

  const dateChoices = useMemo(() => {
    const set = new Set<string>(entries.map((e) => e.dateIso));
    foodCostPlans.forEach((p) => set.add(p.dateIso));
    pmRecords.forEach((r) => set.add(r.dateIso));
    if (activeDateIso) set.add(activeDateIso);
    return Array.from(set).sort();
  }, [entries, foodCostPlans, pmRecords, activeDateIso]);

  return (
    <div className="space-y-4">
      {/* Top Workspace Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Nilai Gizi & Food Cost (TKPI 2020)
            </h2>
            <p className="text-xs text-slate-500">
              Susun komposisi bahan makanan per kelompok sasaran (gabung atau pisah kategori + lembar kerja Alergi/Diet). Jumlah Manfaat ditarik otomatis dari Update PM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenTkpiModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <Database className="h-3.5 w-3.5" />
              TKPI 2020 & Link Spreadsheet ({tkpiCatalog.length})
            </button>
            <button
              type="button"
              onClick={() => setShowHeaderEdit((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit Kop & AKG
            </button>
            <button
              type="button"
              onClick={() => persistPlan(draft)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Lembar'}
            </button>
            <button
              type="button"
              onClick={() => onExportPdf(draft, activePmRecord, activeWorksheet?.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              PDF F4
            </button>
          </div>
        </div>

        {/* Date & Actions Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-700">Tanggal:</label>
            <input
              type="date"
              value={activeDateIso}
              onChange={(e) => e.target.value && onChangeDateIso(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
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
            {latestOtherPlan && (
              <button
                type="button"
                onClick={handleCopyFromPreviousDay}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5 text-emerald-600" />
                Salin dari {formatIndonesianFullDate(latestOtherPlan.dateIso)}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSyncToMonthlyNutrition}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sinkronkan ke Rekapan Nilai Gizi Bulanan
          </button>
        </div>

        {syncNotice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {syncNotice}
          </div>
        )}

        {matchedMaster && matchedMasterSummary && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <div>
                <span className="font-semibold">
                  Master Menu Terdeteksi ({matchedMaster.plan.title} · Menu {matchedMaster.day.menuNumber}):
                </span>{' '}
                <span className="text-emerald-900">{matchedMasterSummary}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLoadFromMasterMenu}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-600 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Muat ke Lembar Ini
            </button>
          </div>
        )}

        {/* Worksheet Tabs + Add Category/Allergy Buttons */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {draft.worksheets.map((ws) => {
            const active = ws.id === activeWorksheet?.id;
            return (
              <div
                key={ws.id}
                className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                  active
                    ? ws.isAllergySheet
                      ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold'
                      : 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveSheetId(ws.id)}
                  className="px-3 py-1.5 text-left"
                >
                  {ws.isAllergySheet && (
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                  )}
                  {ws.sideLabel || ws.title}
                </button>
                {draft.worksheets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteWorksheet(ws.id)}
                    className="border-l border-slate-200 px-1.5 py-1.5 text-slate-400 hover:text-rose-600"
                    title="Hapus lembar kerja"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setShowAddSheetModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <Layers className="h-3.5 w-3.5" />
            + Pilih Kategori (Gabung / Pisah)
          </button>

          <button
            type="button"
            onClick={handleQuickAddAllergyWorksheet}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
          >
            <Plus className="h-3.5 w-3.5" />
            + Lembar Kerja Alergi / Diet
          </button>
        </div>

        {/* Editable Kop & Active Worksheet Config Drawer */}
        {showHeaderEdit && activeWorksheet && computedWorksheet && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Kop Baris 1
                </label>
                <input
                  type="text"
                  value={draft.headerLine1}
                  onChange={(e) => setDraft({ ...draft, headerLine1: e.target.value })}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Kop Baris 2
                </label>
                <input
                  type="text"
                  value={draft.headerLine2}
                  onChange={(e) => setDraft({ ...draft, headerLine2: e.target.value })}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Nama SPPG
                </label>
                <input
                  type="text"
                  value={draft.headerLine3}
                  onChange={(e) => setDraft({ ...draft, headerLine3: e.target.value })}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
                    Logo Kiri ({resolvedLogos.leftWidthPx}px)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoModalSide('right')}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-3 w-3 text-blue-600" />
                    Logo Kanan ({resolvedLogos.rightWidthPx}px)
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-600">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.followGlobalLeftLogo !== false}
                      onChange={(e) =>
                        void persistPlan({ ...draft, followGlobalLeftLogo: e.target.checked })
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
                        void persistPlan({ ...draft, followGlobalRightLogo: e.target.checked })
                      }
                      className="rounded accent-blue-600"
                    />
                    Ikuti Kanan Global
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 pt-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Judul Lembar Kerja Aktif
                </label>
                <input
                  type="text"
                  value={activeWorksheet.title}
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({ ...ws, title: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Label Strip Kiri (Vertikal)
                </label>
                <input
                  type="text"
                  value={activeWorksheet.sideLabel}
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({ ...ws, sideLabel: e.target.value }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Rujukan AKG 20-25% Override */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 border-t border-slate-200 pt-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Energi (kkal)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={activeWorksheet.akgOverride?.energi ?? computedWorksheet.akgRef.energi}
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({
                      ...ws,
                      akgOverride: {
                        ...computedWorksheet.akgRef,
                        ...(ws.akgOverride || {}),
                        energi: Number(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Protein (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={activeWorksheet.akgOverride?.protein ?? computedWorksheet.akgRef.protein}
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({
                      ...ws,
                      akgOverride: {
                        ...computedWorksheet.akgRef,
                        ...(ws.akgOverride || {}),
                        protein: Number(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Lemak (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={activeWorksheet.akgOverride?.lemak ?? computedWorksheet.akgRef.lemak}
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({
                      ...ws,
                      akgOverride: {
                        ...computedWorksheet.akgRef,
                        ...(ws.akgOverride || {}),
                        lemak: Number(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG KH (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={
                    activeWorksheet.akgOverride?.karbohidrat ??
                    computedWorksheet.akgRef.karbohidrat
                  }
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({
                      ...ws,
                      akgOverride: {
                        ...computedWorksheet.akgRef,
                        ...(ws.akgOverride || {}),
                        karbohidrat: Number(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  AKG Serat (g)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={activeWorksheet.akgOverride?.serat ?? computedWorksheet.akgRef.serat}
                  onChange={(e) =>
                    updateActiveWorksheet((ws) => ({
                      ...ws,
                      akgOverride: {
                        ...computedWorksheet.akgRef,
                        ...(ws.akgOverride || {}),
                        serat: Number(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono-num"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => persistPlan(draft)}
                  className="w-full rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Spreadsheet Worksheet Matching Image 1 */}
      {activeWorksheet && computedWorksheet && (
        <div className="rounded-xl border border-black bg-white overflow-hidden shadow-xs flex">
          {/* Left Vertical Yellow Strip (TK / PAUD, etc.) */}
          <div
            className="w-8 sm:w-10 shrink-0 border-r border-black flex items-center justify-center p-1"
            style={{ backgroundColor: '#FFFF00' }}
          >
            <span
              className="font-extrabold text-xs sm:text-sm tracking-widest text-black whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {activeWorksheet.sideLabel || 'SPPG'}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Kop */}
            <div className="relative border-b border-black px-4 py-3 text-center min-h-[82px] flex flex-col justify-center">
              {resolvedLogos.leftUrl && (
                <img
                  src={resolvedLogos.leftUrl}
                  alt="Logo Kiri"
                  style={{ width: `${resolvedLogos.leftWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              {resolvedLogos.rightUrl && (
                <img
                  src={resolvedLogos.rightUrl}
                  alt="Logo Kanan"
                  style={{ width: `${resolvedLogos.rightWidthPx}px`, height: 'auto', maxHeight: '76px' }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              <div className="px-20">
                <div className="text-xs font-bold uppercase text-black">{draft.headerLine1}</div>
                <div className="text-xs font-bold uppercase text-black">{draft.headerLine2}</div>
                <div className="text-xs font-bold uppercase text-black">{draft.headerLine3}</div>
                <div className="text-[11px] italic underline text-black">{draft.headerAlamat}</div>
                <div className="mt-2 text-sm font-extrabold uppercase text-black">
                  {activeWorksheet.title}
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

            {/* Top Executive Strips: Left (Green AKG) & Right (Food Cost) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 border-b border-black text-xs text-black">
              {/* Left AKG Summary (7 cols) */}
              <div className="xl:col-span-7 border-b xl:border-b-0 xl:border-r border-black">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr style={{ backgroundColor: '#00B050' }}>
                      <th colSpan={6} className="border-b border-black px-2 py-1 text-center font-bold">
                        Nilai Gizi Berdasarkan AKG (
                        {activeWorksheet.categoryIds
                          .map((id) => CATEGORY_MAP[id]?.label || id)
                          .join(', ')}
                        {activeWorksheet.isAllergySheet ? ' · Mode Alergi/Diet' : ''})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#00B050' }}>
                      <td className="border-b border-r border-black px-2 py-1 font-bold text-center">
                        NILAI GIZI MENU
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-bold font-mono-num w-16">
                        {fmtNum(computedWorksheet.nutritionTotals.energi, 1)}
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-bold font-mono-num w-14">
                        {fmtNum(computedWorksheet.nutritionTotals.protein, 1)}
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-bold font-mono-num w-14">
                        {fmtNum(computedWorksheet.nutritionTotals.lemak, 1)}
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-bold font-mono-num w-14">
                        {fmtNum(computedWorksheet.nutritionTotals.kh, 1)}
                      </td>
                      <td className="border-b border-black px-2 py-1 text-center font-bold font-mono-num w-14">
                        {fmtNum(computedWorksheet.nutritionTotals.serat, 1)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#00B050' }}>
                      <td className="border-b border-r border-black px-2 py-1 font-bold text-center">
                        RUJUKAN AKG 20-25%
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-semibold font-mono-num">
                        {fmtNum(computedWorksheet.akgRef.energi, 1)}
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-semibold font-mono-num">
                        {fmtNum(computedWorksheet.akgRef.protein, 1)}
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-semibold font-mono-num">
                        {fmtNum(computedWorksheet.akgRef.lemak, 1)}
                      </td>
                      <td className="border-b border-r border-black px-2 py-1 text-center font-semibold font-mono-num">
                        {fmtNum(computedWorksheet.akgRef.karbohidrat, 1)}
                      </td>
                      <td className="border-b border-black px-2 py-1 text-center font-semibold font-mono-num">
                        {fmtNum(computedWorksheet.akgRef.serat, 1)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="border-r border-black px-2 py-1 font-bold text-center"
                        style={{ backgroundColor: '#00B050' }}
                      >
                        % KEBUTUHAN 90-110%
                      </td>
                      <td
                        className="border-r border-black px-2 py-1 text-center font-bold font-mono-num"
                        style={getNeedBadgeStyle(computedWorksheet.percentNeeds.energi)}
                      >
                        {fmtNum(computedWorksheet.percentNeeds.energi, 0)}%
                      </td>
                      <td
                        className="border-r border-black px-2 py-1 text-center font-bold font-mono-num"
                        style={getNeedBadgeStyle(computedWorksheet.percentNeeds.protein)}
                      >
                        {fmtNum(computedWorksheet.percentNeeds.protein, 0)}%
                      </td>
                      <td
                        className="border-r border-black px-2 py-1 text-center font-bold font-mono-num"
                        style={getNeedBadgeStyle(computedWorksheet.percentNeeds.lemak)}
                      >
                        {fmtNum(computedWorksheet.percentNeeds.lemak, 0)}%
                      </td>
                      <td
                        className="border-r border-black px-2 py-1 text-center font-bold font-mono-num"
                        style={getNeedBadgeStyle(computedWorksheet.percentNeeds.kh)}
                      >
                        {fmtNum(computedWorksheet.percentNeeds.kh, 0)}%
                      </td>
                      <td
                        className="px-2 py-1 text-center font-bold font-mono-num"
                        style={getNeedBadgeStyle(computedWorksheet.percentNeeds.serat)}
                      >
                        {fmtNum(computedWorksheet.percentNeeds.serat, 0)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Right Food Cost Summary (5 cols) */}
              <div className="xl:col-span-5">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    <tr style={{ backgroundColor: '#A6A6A6' }}>
                      <td className="border-b border-r border-black px-3 py-1 text-center font-bold">
                        JUMLAH
                      </td>
                      <td className="border-b border-black px-3 py-1 text-right font-bold font-mono-num w-36">
                        Rp {fmtRp(computedWorksheet.subTotalHarga)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#BFBFBF' }}>
                      <td className="border-b border-r border-black px-3 py-1 text-center font-bold">
                        <span className="inline-flex items-center gap-1">
                          BUMBU
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            value={activeWorksheet.bumbuPercent}
                            onChange={(e) =>
                              updateActiveWorksheet((ws) => ({
                                ...ws,
                                bumbuPercent: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            onBlur={() => persistPlan(draft)}
                            className="w-12 rounded border border-black/30 bg-white px-1 py-0 text-center text-xs font-mono-num"
                          />
                          %
                        </span>
                      </td>
                      <td className="border-b border-black px-3 py-1 text-right font-bold font-mono-num">
                        Rp {fmtRp(computedWorksheet.bumbuAmount)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#A6A6A6' }}>
                      <td className="border-b border-r border-black px-3 py-1 text-center font-bold">
                        JUMLAH + BUMBU {activeWorksheet.bumbuPercent}%
                      </td>
                      <td className="border-b border-black px-3 py-1 text-right font-bold font-mono-num">
                        Rp {fmtRp(computedWorksheet.totalWithBumbu)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="border-r border-black px-3 py-1.5 text-center font-bold"
                        style={{ backgroundColor: '#D9D9D9' }}
                      >
                        HARGA PER PORSI ({computedWorksheet.effectivePortionsForCost} PM)
                      </td>
                      <td
                        className="px-3 py-1.5 text-right font-extrabold font-mono-num"
                        style={{ backgroundColor: '#FF0000' }}
                      >
                        Rp {fmtRp(computedWorksheet.hargaPerPorsi)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 17-Column Ingredient Spreadsheet Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px] text-black">
                <thead>
                  <tr style={{ backgroundColor: '#F4B084' }}>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold min-w-[115px]">
                      MENU
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold min-w-[180px]">
                      BAHAN MAKANAN
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-14">
                      BERAT (BB)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-14">
                      URT
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-14">
                      ENERGI (kkal)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-14">
                      PROTEIN (g)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      LEMAK (g)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      KH (g)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      SERAT (g)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      BDD (%)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-14">
                      BK (gr)
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-16">
                      Jumlah Manfaat
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-16">
                      Gram
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-14">
                      Kg
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      Potong
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      Ekor
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      Lembar
                    </th>
                    <th className="border-b border-r border-black px-1.5 py-2 text-center font-bold w-12">
                      Rak
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-28">
                      Harga Satuan
                    </th>
                    <th className="border-b border-r border-black px-2 py-2 text-center font-bold w-24">
                      Harga Total
                    </th>
                    <th className="border-b border-black px-1.5 py-2 text-center font-bold w-10">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {computedWorksheet.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={21}
                        className="border-b border-black px-4 py-8 text-center text-xs text-slate-500"
                      >
                        Belum ada komposisi bahan makanan di lembar ini. Klik{' '}
                        <strong>+ Tambah Baris Bahan</strong> di bawah untuk memilih bahan dari TKPI 2020.
                      </td>
                    </tr>
                  ) : (
                    computedWorksheet.rows.map((cr) => {
                      const r = cr.row;
                      const isPicking = pickerRowId === r.id;
                      const isUnitEdit = editingUnitRowId === r.id;

                      return (
                        <React.Fragment key={r.id}>
                          <tr className="hover:bg-slate-50">
                            <td className="border-b border-r border-black p-0.5">
                              <input
                                type="text"
                                value={r.menuName}
                                onChange={(e) =>
                                  handleUpdateRow(r.id, { menuName: e.target.value })
                                }
                                onBlur={() => persistPlan(draft)}
                                placeholder="Nama menu..."
                                className="w-full px-1.5 py-1 text-[11px] font-semibold focus:bg-emerald-50 focus:outline-none"
                              />
                            </td>
                            <td className="border-b border-r border-black p-0.5 relative">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={r.bahanMakanan}
                                  onChange={(e) =>
                                    handleUpdateRow(r.id, { bahanMakanan: e.target.value })
                                  }
                                  onBlur={() => persistPlan(draft)}
                                  placeholder="Ketik / pilih TKPI..."
                                  className="w-full px-1.5 py-1 text-[11px] focus:bg-emerald-50 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPickerRowId(isPicking ? null : r.id);
                                    setPickerSearch(r.bahanMakanan);
                                  }}
                                  className="rounded bg-emerald-100 p-1 text-emerald-800 hover:bg-emerald-200 shrink-0"
                                  title="Pilih bahan dari TKPI 2020"
                                >
                                  <Search className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="border-b border-r border-black p-0.5">
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                value={r.beratBb || ''}
                                onChange={(e) =>
                                  handleUpdateRow(r.id, {
                                    beratBb: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-1 py-1 text-center font-mono-num text-[11px] focus:bg-emerald-50 focus:outline-none"
                              />
                            </td>
                            <td className="border-b border-r border-black p-0.5">
                              <input
                                type="text"
                                value={r.urt}
                                onChange={(e) => handleUpdateRow(r.id, { urt: e.target.value })}
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-1 py-1 text-center text-[11px] focus:bg-emerald-50 focus:outline-none"
                              />
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.energi, 1)}
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.protein, 1)}
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.lemak, 1)}
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.kh, 1)}
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.serat, 1)}
                            </td>
                            <td className="border-b border-r border-black p-0.5">
                              <input
                                type="number"
                                step="0.1"
                                min={1}
                                max={100}
                                value={r.bddPercent}
                                onChange={(e) =>
                                  handleUpdateRow(r.id, {
                                    bddPercent: Math.max(1, Number(e.target.value) || 100),
                                  })
                                }
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-1 py-1 text-center font-mono-num text-[11px] focus:bg-emerald-50 focus:outline-none"
                              />
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.bkGram, 1)}
                            </td>
                            <td className="border-b border-r border-black p-0.5">
                              <input
                                type="number"
                                min={0}
                                value={
                                  r.jumlahManfaatOverride !== undefined &&
                                  r.jumlahManfaatOverride !== null
                                    ? r.jumlahManfaatOverride
                                    : ''
                                }
                                placeholder={String(computedWorksheet.defaultJumlahManfaat)}
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  handleUpdateRow(r.id, {
                                    jumlahManfaatOverride:
                                      v === '' ? null : Math.max(0, Math.round(Number(v) || 0)),
                                  });
                                }}
                                onBlur={() => persistPlan(draft)}
                                title="Kosongkan untuk menarik otomatis dari Update PM"
                                className="w-full px-1 py-1 text-center font-mono-num text-[11px] focus:bg-emerald-50 focus:outline-none"
                              />
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.totalGram, 1)}
                            </td>
                            <td className="border-b border-r border-black px-1 py-1 text-right font-mono-num">
                              {fmtNum(cr.totalKg, 1)}
                            </td>
                            <td className="border-b border-r border-black p-0.5 text-center font-mono-num">
                              <input
                                type="number"
                                step="0.1"
                                value={
                                  r.manualPotong !== undefined && r.manualPotong !== null
                                    ? r.manualPotong
                                    : cr.potong !== null
                                    ? Number(cr.potong.toFixed(1))
                                    : ''
                                }
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  handleUpdateRow(r.id, {
                                    manualPotong: v === '' ? null : Number(v) || 0,
                                  });
                                }}
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-0.5 py-1 text-center text-[11px] font-mono-num"
                              />
                            </td>
                            <td className="border-b border-r border-black p-0.5 text-center font-mono-num">
                              <input
                                type="number"
                                step="0.1"
                                value={
                                  r.manualEkor !== undefined && r.manualEkor !== null
                                    ? r.manualEkor
                                    : cr.ekor !== null
                                    ? Number(cr.ekor.toFixed(1))
                                    : ''
                                }
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  handleUpdateRow(r.id, {
                                    manualEkor: v === '' ? null : Number(v) || 0,
                                  });
                                }}
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-0.5 py-1 text-center text-[11px] font-mono-num"
                              />
                            </td>
                            <td className="border-b border-r border-black p-0.5 text-center font-mono-num">
                              <input
                                type="number"
                                step="0.1"
                                value={
                                  r.manualLembar !== undefined && r.manualLembar !== null
                                    ? r.manualLembar
                                    : cr.lembar !== null
                                    ? Number(cr.lembar.toFixed(1))
                                    : ''
                                }
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  handleUpdateRow(r.id, {
                                    manualLembar: v === '' ? null : Number(v) || 0,
                                  });
                                }}
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-0.5 py-1 text-center text-[11px] font-mono-num"
                              />
                            </td>
                            <td className="border-b border-r border-black p-0.5 text-center font-mono-num">
                              <input
                                type="number"
                                step="0.1"
                                value={
                                  r.manualRak !== undefined && r.manualRak !== null
                                    ? r.manualRak
                                    : cr.rak !== null
                                    ? Number(cr.rak.toFixed(1))
                                    : ''
                                }
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  handleUpdateRow(r.id, {
                                    manualRak: v === '' ? null : Number(v) || 0,
                                  });
                                }}
                                onBlur={() => persistPlan(draft)}
                                className="w-full px-0.5 py-1 text-center text-[11px] font-mono-num"
                              />
                            </td>
                            <td className="border-b border-r border-black p-0.5">
                              <div className="flex items-center gap-0.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={r.hargaSatuan || ''}
                                  onChange={(e) =>
                                    handleUpdateRow(r.id, {
                                      hargaSatuan: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  onBlur={() => persistPlan(draft)}
                                  placeholder="Rp"
                                  className="w-16 px-1 py-1 text-right font-mono-num text-[11px] focus:bg-emerald-50 focus:outline-none"
                                />
                                <select
                                  value={r.purchaseUnit}
                                  onChange={(e) => {
                                    const nextUnit = e.target.value as FoodCostPurchaseUnit;
                                    handleUpdateRow(r.id, { purchaseUnit: nextUnit });
                                  }}
                                  onBlur={() => persistPlan(draft)}
                                  className="rounded border border-slate-300 bg-slate-50 px-0.5 py-0.5 text-[10px]"
                                  title="Basis harga satuan"
                                >
                                  <option value="kg">/Kg</option>
                                  <option value="rak">/Rak</option>
                                  <option value="lembar">/Lbr</option>
                                  <option value="potong">/Ptg</option>
                                  <option value="ekor">/Ekr</option>
                                </select>
                              </div>
                            </td>
                            <td className="border-b border-r border-black px-1.5 py-1 text-right font-semibold font-mono-num">
                              {cr.hargaTotal > 0 ? `Rp ${fmtRp(cr.hargaTotal)}` : 'Rp -'}
                            </td>
                            <td className="border-b border-black px-1 py-1 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingUnitRowId(isUnitEdit ? null : r.id)
                                  }
                                  className="text-slate-500 hover:text-emerald-700"
                                  title="Edit nilai gizi TKPI/100g & konversi satuan"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(r.id)}
                                  className="text-rose-500 hover:text-rose-700"
                                  title="Hapus baris"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Inline TKPI Picker Drawer */}
                          {isPicking && (
                            <tr>
                              <td colSpan={21} className="border-b border-black bg-emerald-50/70 p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="relative flex-1 max-w-md">
                                      <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                                      <input
                                        type="text"
                                        autoFocus
                                        value={pickerSearch}
                                        onChange={(e) => setPickerSearch(e.target.value)}
                                        placeholder="Cari bahan TKPI 2020 (ketik nama bahan...)"
                                        className="w-full rounded-lg border border-emerald-300 bg-white pl-8 pr-3 py-1.5 text-xs"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setPickerRowId(null)}
                                      className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-white"
                                    >
                                      Tutup
                                    </button>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                                    {pickerResults.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleSelectTkpiItem(r.id, item)}
                                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-emerald-50"
                                      >
                                        <span className="font-semibold text-slate-900">
                                          {item.namaBahan}
                                        </span>
                                        <span className="font-mono-num text-[11px] text-slate-600">
                                          BDD {item.bdd}% · E:{item.energi} P:{item.protein} L:{item.lemak} KH:{item.kh} S:{item.serat}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Inline Nutrition / Unit Conversion Editor */}
                          {isUnitEdit && (
                            <tr>
                              <td colSpan={21} className="border-b border-black bg-slate-50 p-3">
                                <div className="flex flex-wrap items-end gap-3 text-xs">
                                  <div>
                                    <label className="block text-[10px] text-slate-500">
                                      Energi/100g
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.energiPer100}
                                      onChange={(e) =>
                                        handleUpdateRow(r.id, {
                                          energiPer100: Number(e.target.value) || 0,
                                        })
                                      }
                                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono-num"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-500">
                                      Prot/100g
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.proteinPer100}
                                      onChange={(e) =>
                                        handleUpdateRow(r.id, {
                                          proteinPer100: Number(e.target.value) || 0,
                                        })
                                      }
                                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono-num"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-500">
                                      Lemak/100g
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.lemakPer100}
                                      onChange={(e) =>
                                        handleUpdateRow(r.id, {
                                          lemakPer100: Number(e.target.value) || 0,
                                        })
                                      }
                                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono-num"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-500">
                                      KH/100g
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.khPer100}
                                      onChange={(e) =>
                                        handleUpdateRow(r.id, {
                                          khPer100: Number(e.target.value) || 0,
                                        })
                                      }
                                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono-num"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-500">
                                      Serat/100g
                                    </label>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.seratPer100}
                                      onChange={(e) =>
                                        handleUpdateRow(r.id, {
                                          seratPer100: Number(e.target.value) || 0,
                                        })
                                      }
                                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono-num"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-slate-500">
                                      Konversi Gram per 1 {r.purchaseUnit.toUpperCase()} (Opsional)
                                    </label>
                                    <input
                                      type="number"
                                      step="1"
                                      value={r.gramPerUnit || ''}
                                      placeholder="mis. 250 / 1850"
                                      onChange={(e) =>
                                        handleUpdateRow(r.id, {
                                          gramPerUnit: Number(e.target.value) || null,
                                        })
                                      }
                                      className="w-36 rounded border border-slate-300 bg-white px-2 py-1 font-mono-num"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingUnitRowId(null);
                                      void persistPlan(draft);
                                    }}
                                    className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
                                  >
                                    Selesai
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 px-3 py-2 flex items-center justify-between border-t border-slate-200">
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Baris Bahan
              </button>
              <span className="text-[11px] text-slate-500 font-mono-num">
                Jumlah Manfaat Default dari Update PM: <strong>{computedWorksheet.defaultJumlahManfaat}</strong> orang
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pilih Kategori Kelompok Sasaran (Image 3) */}
      {showAddSheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreateWorksheetsFromModal}
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Pilih Kelompok Sasaran Lembar Kerja
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih bebas 1 atau beberapa kategori untuk digabungkan atau dipisah menjadi lembar kerja masing-masing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSheetModal(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {TARGET_CATEGORIES.map((cat) => {
                const checked = newSheetCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setNewSheetCategories((prev) =>
                        checked
                          ? prev.length > 1
                            ? prev.filter((x) => x !== cat.id)
                            : prev
                          : [...prev, cat.id]
                      )
                    }
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs ${
                      checked
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        checked
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mode Kategori
                </label>
                <select
                  value={newSheetMode}
                  onChange={(e) => setNewSheetMode(e.target.value as 'gabung' | 'pisah')}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="gabung">Gabung dalam 1 Lembar</option>
                  <option value="pisah">Pisah per Kategori</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cakupan Porsi (Update PM)
                </label>
                <select
                  value={newSheetPortion}
                  onChange={(e) => setNewSheetPortion(e.target.value as FoodCostPortionScope)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="auto">Otomatis (Besar+Kecil)</option>
                  <option value="kecil">Khusus Porsi Kecil</option>
                  <option value="besar">Khusus Porsi Besar</option>
                  <option value="semua">Semua Porsi</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-800">
                  <input
                    type="checkbox"
                    checked={newSheetAllergy}
                    onChange={(e) => setNewSheetAllergy(e.target.checked)}
                    className="rounded accent-amber-600"
                  />
                  Lembar Khusus Alergi / Diet
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowAddSheetModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Buat Lembar Kerja
              </button>
            </div>
          </form>
        </div>
      )}

      <LogoUploadModal
        open={logoModalSide !== null}
        title={
          logoModalSide === 'left'
            ? 'Atur Logo Kiri (BGN) — Nilai Gizi & Food Cost'
            : 'Atur Logo Kanan — Nilai Gizi & Food Cost'
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
