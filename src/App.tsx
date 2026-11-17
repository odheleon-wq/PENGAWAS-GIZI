import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  BookOpen,
  Building2,
  Calculator,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  ListOrdered,
  Menu,
  PackageCheck,
  ShoppingCart,
  Snowflake,
  Thermometer,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  createFreezerMachine,
  createTempRoom,
  deleteDailyMenuEntry,
  deleteFoodTempDayBlock,
  deleteFreezerLogRow,
  deleteFreezerMachine,
  deleteMasterMenuPlan,
  deleteSampleRow,
  deleteTempRoom,
  fetchFreezerLogRowsOnce,
  fetchRoomDayReadingsOnce,
  getDefaultDailyPmRecord,
  getDefaultFoodCostDayPlan,
  getDefaultFoodTempFormConfig,
  getDefaultFreezerFormConfig,
  getDefaultMasterMenuPlan,
  getDefaultRawMaterialRecapDayConfig,
  getDefaultSampleFormConfig,
  getDefaultTempFormConfig,
  LOCAL_WORKSPACE_UID,
  renumberMonthEntriesChronologically,
  saveFoodTempFormConfig,
  saveFreezerFormConfig,
  saveMonthNutritionConfig,
  saveSampleFormConfig,
  saveTempFormConfig,
  saveTkpiSyncConfig,
  saveUserProfile,
  seedAllPresetTempRooms,
  seedDefaultFoodTempBlocks,
  subscribeFoodTempDayBlocks,
  subscribeFoodTempFormConfig,
  subscribeFreezerFormConfig,
  subscribeFreezerLogRows,
  subscribeFreezerMachines,
  subscribeMonthEntries,
  subscribeMonthFoodCostPlans,
  subscribeMonthMasterMenus,
  subscribeMonthlyArchives,
  subscribeMonthPmRecords,
  subscribeMonthPoRecaps,
  subscribeRoomDayReadings,
  subscribeSampleFormConfig,
  subscribeSampleRows,
  subscribeTempFormConfig,
  subscribeTempRooms,
  subscribeTkpiSyncConfig,
  subscribeUserProfile,
  updateEntryNutritionMap,
  updateFreezerMachine,
  updateTempRoom,
  upsertDailyMenuEntry,
  upsertDailyPmRecord,
  upsertFoodCostDayPlan,
  upsertFoodTempDayBlock,
  upsertFreezerLogRow,
  upsertMasterMenuPlan,
  upsertRawMaterialRecapDayConfig,
  upsertSampleRow,
  upsertTempDayReading,
} from './services/sppgService';
import { getInitialDirectProfile } from './services/localSppgStore';
import type {
  AkgTargetsConfig,
  DailyMenuEntry,
  DailyPmRecord,
  FoodCostDayPlan,
  FoodCostWorksheet,
  FoodTempDayBlock,
  FoodTempFormConfig,
  FoodTempSheetType,
  FreezerFormConfig,
  FreezerLogRow,
  FreezerMachine,
  FreezerMachineType,
  MasterMenuDayCell,
  MasterMenuPlan,
  MonthlyArchive,
  NutritionValues,
  PdfOrientation,
  RawMaterialRecapDayConfig,
  SampleFormConfig,
  SamplePertinggalRow,
  SppgUserProfile,
  TargetCategoryId,
  TempDayReading,
  TempFormConfig,
  TempMonitoringRoom,
  TkpiSyncConfig,
  WorkspaceTab,
} from './types';
import {
  computeMonthlyNutritionSummary,
  getCombinedCategoryTitle,
} from './constants/nutritionCategories';
import {
  getMonthKey,
  getNextSuggestedDateInMonth,
  getPeriodeDisplayName,
  getTodayIso,
  shiftMonthKey,
} from './utils/dateUtils';
import {
  getWorksheetDefaultTitle,
  getWorksheetSideLabelDefault,
} from './utils/foodCostCalculator';
import { normalizeLogoSettings } from './utils/logoResolver';
import {
  buildFoodCostRowsFromMasterDay,
  formatMasterMenuDayAsMenuString,
} from './utils/masterMenuHelper';
import { mergeTkpiCatalog } from './utils/tkpiCsvParser';
import {
  exportFoodCostNutritionToF4Pdf,
  exportFoodTemperatureToF4Pdf,
  exportFreezerChillerToF4Pdf,
  exportMasterMenuToF4Pdf,
  exportNutritionToF4Pdf,
  exportRawMaterialAndPoToF4Pdf,
  exportRekapanToF4Pdf,
  exportSamplePertinggalToF4Pdf,
  exportTemperatureMonitoringToF4Pdf,
  exportUpdatePmToF4Pdf,
} from './utils/pdfExporter';
import { SppgProfileForm } from './components/SppgProfileForm';
import { DashboardCompletionPanel } from './components/DashboardCompletionPanel';
import { MasterMenuView } from './components/MasterMenuView';
import { RekapanTablePreview } from './components/RekapanTablePreview';
import { EntryEditorModal } from './components/EntryEditorModal';
import { MonthCalendarView } from './components/MonthCalendarView';
import { MonthlyArchiveList } from './components/MonthlyArchiveList';
import { RekapanGiziView } from './components/RekapanGiziView';
import { NutritionEntryModal } from './components/NutritionEntryModal';
import { SamplePertinggalView } from './components/SamplePertinggalView';
import { TemperatureMonitoringView } from './components/TemperatureMonitoringView';
import { FreezerChillerView } from './components/FreezerChillerView';
import { LaporanSuhuMakananView } from './components/LaporanSuhuMakananView';
import { UpdatePmView } from './components/UpdatePmView';
import { FoodCostNutritionView } from './components/FoodCostNutritionView';
import { RekapBahanBakuPoView } from './components/RekapBahanBakuPoView';
import { TkpiSyncModal } from './components/TkpiSyncModal';

export default function App() {
  const workspaceUid = LOCAL_WORKSPACE_UID;

  const [profile, setProfile] = useState<SppgUserProfile>(() => getInitialDirectProfile());

  const [archives, setArchives] = useState<MonthlyArchive[]>([]);
  const [activeMonthKey, setActiveMonthKey] = useState<string>(() => {
    const now = new Date();
    return getMonthKey(now.getFullYear(), now.getMonth() + 1);
  });
  const [entries, setEntries] = useState<DailyMenuEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('landscape');
  const [includeYearInPeriod, setIncludeYearInPeriod] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [editorModal, setEditorModal] = useState<{
    open: boolean;
    dateIso: string;
    entry: DailyMenuEntry | null;
  }>({ open: false, dateIso: getTodayIso(), entry: null });

  const [nutritionModalEntry, setNutritionModalEntry] = useState<DailyMenuEntry | null>(null);
  const [localSelectedCategories, setLocalSelectedCategories] = useState<TargetCategoryId[]>([
    'smp_mts',
  ]);

  const [sampleConfig, setSampleConfig] = useState<SampleFormConfig | null>(null);
  const [sampleRows, setSampleRows] = useState<SamplePertinggalRow[]>([]);
  const [minSamplePrintableRows, setMinSamplePrintableRows] = useState<number>(10);

  const [tempConfig, setTempConfig] = useState<TempFormConfig | null>(null);
  const [tempRooms, setTempRooms] = useState<TempMonitoringRoom[]>([]);
  const [tempRoomsLoaded, setTempRoomsLoaded] = useState(false);
  const [activeTempRoomId, setActiveTempRoomId] = useState<string | null>(null);
  const [tempDayReadings, setTempDayReadings] = useState<TempDayReading[]>([]);

  const [freezerConfig, setFreezerConfig] = useState<FreezerFormConfig | null>(null);
  const [freezerMachines, setFreezerMachines] = useState<FreezerMachine[]>([]);
  const [freezerMachinesLoaded, setFreezerMachinesLoaded] = useState(false);
  const [activeFreezerMachineId, setActiveFreezerMachineId] = useState<string | null>(null);
  const [freezerLogRows, setFreezerLogRows] = useState<FreezerLogRow[]>([]);

  const [foodTempConfig, setFoodTempConfig] = useState<FoodTempFormConfig | null>(null);
  const [foodTempBlocks, setFoodTempBlocks] = useState<FoodTempDayBlock[]>([]);
  const [foodTempBlocksLoaded, setFoodTempBlocksLoaded] = useState(false);

  const [tkpiSyncConfig, setTkpiSyncConfig] = useState<TkpiSyncConfig | null>(null);
  const [tkpiModalOpen, setTkpiModalOpen] = useState(false);

  const [masterMenus, setMasterMenus] = useState<MasterMenuPlan[]>([]);
  const [pmRecords, setPmRecords] = useState<DailyPmRecord[]>([]);
  const [foodCostPlans, setFoodCostPlans] = useState<FoodCostDayPlan[]>([]);
  const [poRecaps, setPoRecaps] = useState<RawMaterialRecapDayConfig[]>([]);
  const [activeWorkDateIso, setActiveWorkDateIso] = useState<string>(() => getTodayIso());

  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Keep shared daily work date inside activeMonthKey when month changes
  useEffect(() => {
    if (!activeWorkDateIso.startsWith(activeMonthKey)) {
      const today = getTodayIso();
      if (today.startsWith(activeMonthKey)) {
        setActiveWorkDateIso(today);
      } else {
        setActiveWorkDateIso(`${activeMonthKey}-01`);
      }
    }
  }, [activeMonthKey, activeWorkDateIso]);

  // 1. Profile, Monthly Archive & TKPI Config Subscriptions (direct without login gate)
  useEffect(() => {
    setErrorBanner(null);

    const unsubProfile = subscribeUserProfile(
      workspaceUid,
      (loadedProfile) => {
        if (loadedProfile) {
          setProfile(loadedProfile);
        }
      },
      (err) => {
        setErrorBanner(err.message);
      }
    );

    const unsubArchives = subscribeMonthlyArchives(
      workspaceUid,
      (list) => setArchives(list),
      (err) => setErrorBanner(err.message)
    );

    const unsubTkpi = subscribeTkpiSyncConfig(
      workspaceUid,
      (cfg) => setTkpiSyncConfig(cfg),
      (err) => setErrorBanner(err.message)
    );

    return () => {
      unsubProfile();
      unsubArchives();
      unsubTkpi();
    };
  }, [workspaceUid]);

  // 2. Active Month Entries, Sample Pertinggal, Temperature Monitoring & Freezer/Chiller Subscriptions
  useEffect(() => {
    setEntriesLoading(true);
    setTempRoomsLoaded(false);
    setActiveTempRoomId(null);
    setFreezerMachinesLoaded(false);
    setActiveFreezerMachineId(null);
    setFoodTempBlocksLoaded(false);

    const unsubEntries = subscribeMonthEntries(
      workspaceUid,
      activeMonthKey,
      (list) => {
        setEntries(list);
        setEntriesLoading(false);
      },
      (err) => {
        setErrorBanner(err.message);
        setEntriesLoading(false);
      }
    );

    const unsubSampleConfig = subscribeSampleFormConfig(
      workspaceUid,
      activeMonthKey,
      (cfg) => setSampleConfig(cfg),
      (err) => setErrorBanner(err.message)
    );

    const unsubSampleRows = subscribeSampleRows(
      workspaceUid,
      activeMonthKey,
      (list) => setSampleRows(list),
      (err) => setErrorBanner(err.message)
    );

    const unsubTempConfig = subscribeTempFormConfig(
      workspaceUid,
      activeMonthKey,
      (cfg) => setTempConfig(cfg),
      (err) => setErrorBanner(err.message)
    );

    const unsubTempRooms = subscribeTempRooms(
      workspaceUid,
      activeMonthKey,
      (list) => {
        setTempRooms(list);
        setTempRoomsLoaded(true);
      },
      (err) => {
        setErrorBanner(err.message);
        setTempRoomsLoaded(true);
      }
    );

    const unsubFreezerConfig = subscribeFreezerFormConfig(
      workspaceUid,
      activeMonthKey,
      (cfg) => setFreezerConfig(cfg),
      (err) => setErrorBanner(err.message)
    );

    const unsubFreezerMachines = subscribeFreezerMachines(
      workspaceUid,
      activeMonthKey,
      (list) => {
        setFreezerMachines(list);
        setFreezerMachinesLoaded(true);
      },
      (err) => {
        setErrorBanner(err.message);
        setFreezerMachinesLoaded(true);
      }
    );

    const unsubFoodTempConfig = subscribeFoodTempFormConfig(
      workspaceUid,
      activeMonthKey,
      (cfg) => setFoodTempConfig(cfg),
      (err) => setErrorBanner(err.message)
    );

    const unsubFoodTempBlocks = subscribeFoodTempDayBlocks(
      workspaceUid,
      activeMonthKey,
      (list) => {
        setFoodTempBlocks(list);
        setFoodTempBlocksLoaded(true);
      },
      (err) => {
        setErrorBanner(err.message);
        setFoodTempBlocksLoaded(true);
      }
    );

    const unsubPmRecords = subscribeMonthPmRecords(
      workspaceUid,
      activeMonthKey,
      (list) => setPmRecords(list),
      (err) => setErrorBanner(err.message)
    );

    const unsubFoodCostPlans = subscribeMonthFoodCostPlans(
      workspaceUid,
      activeMonthKey,
      (list) => setFoodCostPlans(list),
      (err) => setErrorBanner(err.message)
    );

    const unsubMasterMenus = subscribeMonthMasterMenus(
      workspaceUid,
      activeMonthKey,
      (list) => setMasterMenus(list),
      (err) => setErrorBanner(err.message)
    );

    const unsubPoRecaps = subscribeMonthPoRecaps(
      workspaceUid,
      activeMonthKey,
      (list) => setPoRecaps(list),
      (err) => setErrorBanner(err.message)
    );

    return () => {
      unsubEntries();
      unsubSampleConfig();
      unsubSampleRows();
      unsubTempConfig();
      unsubTempRooms();
      unsubFreezerConfig();
      unsubFreezerMachines();
      unsubFoodTempConfig();
      unsubFoodTempBlocks();
      unsubPmRecords();
      unsubFoodCostPlans();
      unsubMasterMenus();
      unsubPoRecaps();
    };
  }, [workspaceUid, activeMonthKey]);

  const effectiveTempRoomId = useMemo(() => {
    if (activeTempRoomId && tempRooms.some((r) => r.id === activeTempRoomId)) {
      return activeTempRoomId;
    }
    return tempRooms[0]?.id || null;
  }, [activeTempRoomId, tempRooms]);

  // 3. Active Room Daily Temperature Readings Subscription
  useEffect(() => {
    if (!effectiveTempRoomId) {
      setTempDayReadings([]);
      return;
    }
    const unsubDays = subscribeRoomDayReadings(
      workspaceUid,
      activeMonthKey,
      effectiveTempRoomId,
      (list) => setTempDayReadings(list),
      (err) => setErrorBanner(err.message)
    );
    return () => unsubDays();
  }, [workspaceUid, activeMonthKey, effectiveTempRoomId]);

  const effectiveFreezerMachineId = useMemo(() => {
    if (activeFreezerMachineId && freezerMachines.some((m) => m.id === activeFreezerMachineId)) {
      return activeFreezerMachineId;
    }
    return freezerMachines[0]?.id || null;
  }, [activeFreezerMachineId, freezerMachines]);

  // 4. Active Freezer/Chiller Machine Log Rows Subscription
  useEffect(() => {
    if (!effectiveFreezerMachineId) {
      setFreezerLogRows([]);
      return;
    }
    const unsubRows = subscribeFreezerLogRows(
      workspaceUid,
      activeMonthKey,
      effectiveFreezerMachineId,
      (list) => setFreezerLogRows(list),
      (err) => setErrorBanner(err.message)
    );
    return () => unsubRows();
  }, [workspaceUid, activeMonthKey, effectiveFreezerMachineId]);

  const suggestedHariKe = useMemo(() => {
    if (entries.length === 0) return 1;
    const maxHari = Math.max(...entries.map((e) => e.hariKe));
    return maxHari + 1;
  }, [entries]);

  const nextDateForActiveMonth = useMemo(() => {
    return getNextSuggestedDateInMonth(
      activeMonthKey,
      entries.map((e) => e.dateIso)
    );
  }, [activeMonthKey, entries]);

  const activeArchive = useMemo(
    () => archives.find((a) => a.monthKey === activeMonthKey) || null,
    [archives, activeMonthKey]
  );

  const selectedCategories: TargetCategoryId[] = useMemo(() => {
    if (activeArchive?.selectedCategories && activeArchive.selectedCategories.length > 0) {
      return activeArchive.selectedCategories;
    }
    return localSelectedCategories;
  }, [activeArchive, localSelectedCategories]);

  const handleChangeSelectedCategories = (next: TargetCategoryId[]) => {
    setLocalSelectedCategories(next);
    void saveMonthNutritionConfig(workspaceUid, activeMonthKey, next, activeArchive?.akgTargets);
  };

  const handleSaveAkgTargets = async (nextAkg: AkgTargetsConfig) => {
    await saveMonthNutritionConfig(workspaceUid, activeMonthKey, selectedCategories, nextAkg);
  };

  const handleSaveEntryNutrition = async (
    entryId: string,
    nutritionByCategory: Partial<Record<TargetCategoryId, NutritionValues>>,
    updatedNamaMenu?: string
  ) => {
    await updateEntryNutritionMap(
      workspaceUid,
      activeMonthKey,
      entryId,
      nutritionByCategory,
      updatedNamaMenu
    );
  };

  const handleSaveProfile = async (
    data: Omit<SppgUserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>
  ) => {
    await saveUserProfile(workspaceUid, profile.email, data);
  };

  const handleSaveEntry = async (payload: {
    entryId?: string;
    dateIso: string;
    hariKe: number;
    namaMenu: string;
    photoDataUrl: string;
  }) => {
    await upsertDailyMenuEntry(workspaceUid, activeMonthKey, payload);
  };

  const handleDeleteEntry = async (entryId: string) => {
    await deleteDailyMenuEntry(workspaceUid, activeMonthKey, entryId);
  };

  const handleAutoRenumber = async () => {
    if (entries.length === 0) return;
    await renumberMonthEntriesChronologically(workspaceUid, activeMonthKey, entries);
  };

  const effectiveSampleConfig = useMemo(() => {
    return sampleConfig || getDefaultSampleFormConfig(workspaceUid, activeMonthKey, profile);
  }, [workspaceUid, profile, sampleConfig, activeMonthKey]);

  const handleSaveSampleConfig = async (
    next: Omit<SampleFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await saveSampleFormConfig(workspaceUid, activeMonthKey, next);
  };

  const handleSaveSampleRow = async (
    row: Omit<SamplePertinggalRow, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ) => {
    await upsertSampleRow(workspaceUid, activeMonthKey, row);
  };

  const handleDeleteSampleRow = async (rowId: string) => {
    await deleteSampleRow(workspaceUid, activeMonthKey, rowId);
  };

  const effectiveTempConfig = useMemo(() => {
    return tempConfig || getDefaultTempFormConfig(workspaceUid, activeMonthKey, profile);
  }, [workspaceUid, profile, tempConfig, activeMonthKey]);

  const handleSaveTempConfig = async (
    next: Omit<TempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await saveTempFormConfig(workspaceUid, activeMonthKey, next);
  };

  const handleCreateTempRoom = async (roomName: string) => {
    const maxOrder = tempRooms.reduce((m, r) => Math.max(m, r.roomOrder), 0);
    const createdId = await createTempRoom(workspaceUid, activeMonthKey, {
      roomName,
      roomOrder: maxOrder + 1,
    });
    if (createdId) {
      setActiveTempRoomId(createdId);
    }
    return createdId;
  };

  const handleSeedAllPresetRooms = async () => {
    await seedAllPresetTempRooms(workspaceUid, activeMonthKey, tempRooms);
  };

  const handleUpdateTempRoom = async (
    roomId: string,
    input: {
      roomOrder: number;
      roomName: string;
      presetKey: string;
      standardSuhu: string;
      standardRh: string;
      sopNote: string;
    }
  ) => {
    await updateTempRoom(workspaceUid, activeMonthKey, roomId, input);
  };

  const handleDeleteTempRoom = async (roomId: string) => {
    await deleteTempRoom(workspaceUid, activeMonthKey, roomId);
    if (activeTempRoomId === roomId) {
      setActiveTempRoomId(null);
    }
  };

  const handleSaveTempDayReading = async (
    roomId: string,
    input: {
      day: number;
      jam: string;
      suhu: string;
      rh: string;
      paraf: string;
      namaPetugas: string;
      photoDataUrl?: string;
      detectedNote?: string;
    }
  ) => {
    await upsertTempDayReading(workspaceUid, activeMonthKey, roomId, input);
  };

  const handleExportAllTempRoomsPdf = async () => {
    if (!effectiveTempConfig || tempRooms.length === 0) return;
    const sheets = await Promise.all(
      tempRooms.map(async (room) => ({
        room,
        readings:
          room.id === effectiveTempRoomId
            ? tempDayReadings
            : await fetchRoomDayReadingsOnce(workspaceUid, activeMonthKey, room.id),
      }))
    );
    exportTemperatureMonitoringToF4Pdf({
      config: effectiveTempConfig,
      sheets,
      allRoomsForSop: tempRooms,
      profile,
      orientation: pdfOrientation,
    });
  };

  const effectiveFreezerConfig = useMemo(() => {
    return freezerConfig || getDefaultFreezerFormConfig(workspaceUid, activeMonthKey, profile);
  }, [workspaceUid, profile, freezerConfig, activeMonthKey]);

  const handleSaveFreezerConfig = async (
    next: Omit<FreezerFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await saveFreezerFormConfig(workspaceUid, activeMonthKey, next);
  };

  const handleCreateFreezerMachine = async (input: {
    machineType: FreezerMachineType;
    namaMesin: string;
    merk: string;
    noMesin: string;
    lokasi: string;
  }) => {
    const maxOrder = freezerMachines.reduce((m, x) => Math.max(m, x.machineOrder), 0);
    const createdId = await createFreezerMachine(workspaceUid, activeMonthKey, {
      machineOrder: maxOrder + 1,
      ...input,
    });
    if (createdId) {
      setActiveFreezerMachineId(createdId);
    }
    return createdId;
  };

  const handleUpdateFreezerMachine = async (
    machineId: string,
    input: Omit<FreezerMachine, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await updateFreezerMachine(workspaceUid, activeMonthKey, machineId, input);
  };

  const handleDeleteFreezerMachine = async (machineId: string) => {
    await deleteFreezerMachine(workspaceUid, activeMonthKey, machineId);
    if (activeFreezerMachineId === machineId) {
      setActiveFreezerMachineId(null);
    }
  };

  const handleSaveFreezerRow = async (
    machineId: string,
    row: Omit<
      FreezerLogRow,
      'id' | 'uid' | 'monthKey' | 'machineId' | 'createdAt' | 'updatedAt'
    > & { id?: string }
  ) => {
    await upsertFreezerLogRow(workspaceUid, activeMonthKey, machineId, row);
  };

  const handleDeleteFreezerRow = async (machineId: string, rowId: string) => {
    await deleteFreezerLogRow(workspaceUid, activeMonthKey, machineId, rowId);
  };

  const handleExportAllFreezerMachinesPdf = async () => {
    if (!effectiveFreezerConfig || freezerMachines.length === 0) return;
    const sheets = await Promise.all(
      freezerMachines.map(async (machine) => ({
        machine,
        rows:
          machine.id === effectiveFreezerMachineId
            ? freezerLogRows
            : await fetchFreezerLogRowsOnce(workspaceUid, activeMonthKey, machine.id),
      }))
    );
    exportFreezerChillerToF4Pdf({
      config: effectiveFreezerConfig,
      sheets,
      profile,
      orientation: pdfOrientation,
    });
  };

  const effectiveFoodTempConfig = useMemo(() => {
    return foodTempConfig || getDefaultFoodTempFormConfig(workspaceUid, activeMonthKey, profile);
  }, [workspaceUid, profile, foodTempConfig, activeMonthKey]);

  const handleSaveFoodTempConfig = async (
    next: Omit<FoodTempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await saveFoodTempFormConfig(workspaceUid, activeMonthKey, next);
  };

  const handleSaveFoodTempBlock = async (
    block: Omit<FoodTempDayBlock, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ) => {
    return upsertFoodTempDayBlock(workspaceUid, activeMonthKey, block);
  };

  const handleDeleteFoodTempBlock = async (blockId: string) => {
    await deleteFoodTempDayBlock(workspaceUid, activeMonthKey, blockId);
  };

  const handleSeedDefaultFoodTempBlocks = async (
    sheetType: FoodTempSheetType,
    count = 5
  ) => {
    await seedDefaultFoodTempBlocks(workspaceUid, activeMonthKey, sheetType, count);
  };

  const handleSaveTkpiConfig = async (
    next: Omit<TkpiSyncConfig, 'uid' | 'updatedAt'>
  ) => {
    await saveTkpiSyncConfig(workspaceUid, next);
  };

  const handleSavePmRecord = async (
    record: Omit<DailyPmRecord, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await upsertDailyPmRecord(workspaceUid, activeMonthKey, record);
  };

  const handleSaveFoodCostPlan = async (
    plan: Omit<FoodCostDayPlan, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await upsertFoodCostDayPlan(workspaceUid, activeMonthKey, plan);
  };

  const handleSyncWorksheetNutritionToEntry = async (
    entryId: string,
    nutritionByCategory: Partial<Record<TargetCategoryId, NutritionValues>>
  ) => {
    await updateEntryNutritionMap(workspaceUid, activeMonthKey, entryId, nutritionByCategory);
  };

  const handleSavePoRecapConfig = async (
    cfg: Omit<RawMaterialRecapDayConfig, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => {
    await upsertRawMaterialRecapDayConfig(workspaceUid, activeMonthKey, cfg);
  };

  const handleSaveMasterMenuPlan = async (
    planInput: Omit<MasterMenuPlan, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ): Promise<string> => {
    return upsertMasterMenuPlan(workspaceUid, activeMonthKey, planInput);
  };

  const handleDeleteMasterMenuPlan = async (planId: string) => {
    await deleteMasterMenuPlan(workspaceUid, activeMonthKey, planId);
  };

  const handleSyncGlobalLeftLogo = async (dataUrl: string, widthPx: number) => {
    const currentSettings = normalizeLogoSettings(profile.logoSettings);
    await saveUserProfile(workspaceUid, profile.email, {
      reportTitle: profile.reportTitle,
      namaSppg: profile.namaSppg,
      idSppg: profile.idSppg,
      alamat: profile.alamat,
      kabKota: profile.kabKota,
      provinsi: profile.provinsi,
      namaSppi: profile.namaSppi,
      nomorHp: profile.nomorHp,
      logoSettings: {
        ...currentSettings,
        leftLogoDataUrl: dataUrl,
        leftLogoWidthPx: widthPx,
        autoLinkLeftLogo: true,
      },
    });
  };

  const handleSendMasterMenuDaysToFoodCost = async (
    plan: MasterMenuPlan,
    days: MasterMenuDayCell[]
  ): Promise<number> => {
    const tkpiCatalog = mergeTkpiCatalog(
      tkpiSyncConfig?.syncedItems || [],
      tkpiSyncConfig?.customItems || []
    );
    const categories =
      plan.categoryIds && plan.categoryIds.length > 0 ? plan.categoryIds : (['sd_1_3'] as TargetCategoryId[]);
    const sortedTargetKey = [...categories].sort().join(',');

    let updatedCount = 0;
    let firstDateSent = '';

    for (const day of days) {
      if (!day.dateIso) continue;
      const matchedEntry = entries.find((e) => e.dateIso === day.dateIso);
      const existingPlan = foodCostPlans.find((p) => p.dateIso === day.dateIso);
      const basePlan =
        existingPlan ||
        getDefaultFoodCostDayPlan(
          workspaceUid,
          activeMonthKey,
          day.dateIso,
          matchedEntry?.hariKe || day.menuNumber || 1,
          profile
        );

      const newRows = buildFoodCostRowsFromMasterDay(day, tkpiCatalog);
      if (newRows.length === 0) continue;

      const existingIdx = basePlan.worksheets.findIndex(
        (ws) => !ws.isAllergySheet && [...ws.categoryIds].sort().join(',') === sortedTargetKey
      );

      let nextWorksheets: FoodCostWorksheet[];
      if (existingIdx >= 0) {
        const targetWs = basePlan.worksheets[existingIdx];
        const updatedWs: FoodCostWorksheet = {
          ...targetWs,
          categoryIds: categories,
          rows: newRows,
        };
        nextWorksheets = [
          updatedWs,
          ...basePlan.worksheets.filter((_, idx) => idx !== existingIdx),
        ];
      } else {
        const createdWs: FoodCostWorksheet = {
          id: `ws_mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          title: getWorksheetDefaultTitle(categories, false, 'auto'),
          sideLabel: getWorksheetSideLabelDefault(categories, false),
          categoryIds: categories,
          portionScope: 'auto',
          isAllergySheet: false,
          bumbuPercent: 10,
          rows: newRows,
        };
        const hasRealExisting = existingPlan && existingPlan.worksheets.some((w) => w.rows.length > 0);
        nextWorksheets = hasRealExisting
          ? [createdWs, ...basePlan.worksheets]
          : [createdWs];
      }

      await upsertFoodCostDayPlan(workspaceUid, activeMonthKey, {
        dateIso: basePlan.dateIso,
        hariKe: basePlan.hariKe,
        headerLine1: basePlan.headerLine1,
        headerLine2: basePlan.headerLine2,
        headerLine3: basePlan.headerLine3,
        headerAlamat: basePlan.headerAlamat,
        logoDataUrl: basePlan.logoDataUrl,
        logoWidthPx: basePlan.logoWidthPx,
        logoRightDataUrl: basePlan.logoRightDataUrl,
        logoRightWidthPx: basePlan.logoRightWidthPx,
        followGlobalLeftLogo: basePlan.followGlobalLeftLogo,
        followGlobalRightLogo: basePlan.followGlobalRightLogo,
        worksheets: nextWorksheets,
      });

      if (!firstDateSent) firstDateSent = day.dateIso;
      updatedCount += 1;
    }

    if (firstDateSent && firstDateSent.startsWith(activeMonthKey)) {
      setActiveWorkDateIso(firstDateSent);
    }

    return updatedCount;
  };

  const handleSyncMasterMenuToRekapan = async (plan: MasterMenuPlan): Promise<number> => {
    let syncedCount = 0;
    const days = (plan.weeks || []).flatMap((w) => w.days || []);
    for (const day of days) {
      if (!day.dateIso) continue;
      const namaMenu = formatMasterMenuDayAsMenuString(day);
      if (!namaMenu) continue;
      const existing = entries.find((e) => e.dateIso === day.dateIso);
      await upsertDailyMenuEntry(workspaceUid, activeMonthKey, {
        entryId: existing?.id,
        dateIso: day.dateIso,
        hariKe: existing?.hariKe || day.menuNumber || syncedCount + 1,
        namaMenu,
        photoDataUrl: existing?.photoDataUrl || '',
      });
      syncedCount += 1;
    }
    return syncedCount;
  };

  const handleDownloadPdf = () => {
    if (activeTab === 'master_menu') {
      const plan =
        masterMenus[0] || getDefaultMasterMenuPlan(workspaceUid, activeMonthKey, profile);
      exportMasterMenuToF4Pdf({
        plan,
        profile,
        orientation: pdfOrientation,
      });
      return;
    }
    if (activeTab === 'foodcost') {
      const matchedEntry = entries.find((e) => e.dateIso === activeWorkDateIso);
      const plan =
        foodCostPlans.find((p) => p.dateIso === activeWorkDateIso) ||
        getDefaultFoodCostDayPlan(
          workspaceUid,
          activeMonthKey,
          activeWorkDateIso,
          matchedEntry?.hariKe || 1,
          profile
        );
      const pmRecord = pmRecords.find((r) => r.dateIso === activeWorkDateIso) || null;
      exportFoodCostNutritionToF4Pdf({
        plan,
        pmRecord,
        profile,
        orientation: pdfOrientation,
      });
      return;
    }
    if (activeTab === 'update_pm') {
      const matchedEntry = entries.find((e) => e.dateIso === activeWorkDateIso);
      const record =
        pmRecords.find((r) => r.dateIso === activeWorkDateIso) ||
        getDefaultDailyPmRecord(
          workspaceUid,
          activeMonthKey,
          activeWorkDateIso,
          matchedEntry?.hariKe || 1,
          profile
        );
      exportUpdatePmToF4Pdf({
        record,
        viewMode: 'both',
        profile,
        orientation: pdfOrientation,
      });
      return;
    }
    if (activeTab === 'rekap_bahan' || activeTab === 'po_bahan') {
      const matchedEntry = entries.find((e) => e.dateIso === activeWorkDateIso);
      const recapConfig =
        poRecaps.find((c) => c.dateIso === activeWorkDateIso) ||
        getDefaultRawMaterialRecapDayConfig(
          workspaceUid,
          activeMonthKey,
          activeWorkDateIso,
          matchedEntry?.hariKe || 1,
          profile
        );
      const foodCostPlan = foodCostPlans.find((p) => p.dateIso === activeWorkDateIso) || null;
      const pmRecord = pmRecords.find((r) => r.dateIso === activeWorkDateIso) || null;
      exportRawMaterialAndPoToF4Pdf({
        recapConfig,
        foodCostPlan,
        pmRecord,
        mode: activeTab === 'rekap_bahan' ? 'rekap' : 'po',
        profile,
        orientation: pdfOrientation,
      });
      return;
    }
    if (activeTab === 'makanan' && effectiveFoodTempConfig) {
      exportFoodTemperatureToF4Pdf({
        config: effectiveFoodTempConfig,
        blocks: foodTempBlocks,
        sheetsToExport: ['masak', 'ompreng'],
        profile,
        orientation: pdfOrientation,
      });
      return;
    }
    if (activeTab === 'freezer' && effectiveFreezerConfig && effectiveFreezerMachineId) {
      const activeMachine = freezerMachines.find((m) => m.id === effectiveFreezerMachineId);
      if (activeMachine) {
        exportFreezerChillerToF4Pdf({
          config: effectiveFreezerConfig,
          sheets: [{ machine: activeMachine, rows: freezerLogRows }],
          profile,
          orientation: pdfOrientation,
        });
      }
      return;
    }
    if (activeTab === 'suhu' && effectiveTempConfig && effectiveTempRoomId) {
      const activeRoom = tempRooms.find((r) => r.id === effectiveTempRoomId);
      if (activeRoom) {
        exportTemperatureMonitoringToF4Pdf({
          config: effectiveTempConfig,
          sheets: [{ room: activeRoom, readings: tempDayReadings }],
          allRoomsForSop: tempRooms,
          profile,
          orientation: pdfOrientation,
        });
      }
      return;
    }
    if (activeTab === 'sampel' && effectiveSampleConfig) {
      exportSamplePertinggalToF4Pdf({
        config: effectiveSampleConfig,
        rows: sampleRows,
        profile,
        orientation: pdfOrientation,
        minPrintableRows: minSamplePrintableRows,
      });
      return;
    }
    if (activeTab === 'gizi') {
      const summary = computeMonthlyNutritionSummary(
        entries,
        selectedCategories,
        activeArchive?.akgTargets
      );
      const categoryLabel = getCombinedCategoryTitle(
        selectedCategories,
        activeArchive?.akgTargets?.customTitle
      );
      exportNutritionToF4Pdf({
        profile,
        monthKey: activeMonthKey,
        categoryLabel,
        summary,
        orientation: pdfOrientation,
        includeYearInPeriod,
      });
      return;
    }
    exportRekapanToF4Pdf({
      profile,
      monthKey: activeMonthKey,
      entries,
      orientation: pdfOrientation,
      includeYearInPeriod,
    });
  };

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'master_menu', label: 'Master Menu', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'update_pm', label: 'Update PM', icon: <Users className="h-4 w-4" /> },
    { id: 'rekap_bahan', label: 'Rekap Bahan Baku', icon: <PackageCheck className="h-4 w-4" /> },
    { id: 'po_bahan', label: 'PO Bahan Baku', icon: <ShoppingCart className="h-4 w-4" /> },
    { id: 'rekapan', label: 'Rekapan Menu', icon: <FileSpreadsheet className="h-4 w-4" /> },
    { id: 'gizi', label: 'Nilai Gizi', icon: <Activity className="h-4 w-4" /> },
    { id: 'foodcost', label: 'Nilai Gizi & Food Cost', icon: <Calculator className="h-4 w-4" /> },
    { id: 'sampel', label: 'Form Sampel Pertinggal', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'suhu', label: 'Monitoring Suhu Ruangan', icon: <Thermometer className="h-4 w-4" /> },
    { id: 'freezer', label: 'Suhu Freezer & Chiller', icon: <Snowflake className="h-4 w-4" /> },
    { id: 'makanan', label: 'Suhu Makanan & Ompreng', icon: <Utensils className="h-4 w-4" /> },
    { id: 'kalender', label: 'Kalender & Hari Terlewat', icon: <Calendar className="h-4 w-4" /> },
    { id: 'arsip', label: 'Arsip Bulanan', icon: <Archive className="h-4 w-4" /> },
    { id: 'identitas', label: 'Identitas SPPG', icon: <Building2 className="h-4 w-4" /> },
  ];

  const photoReadyCount = entries.filter((e) => Boolean(e.photoDataUrl)).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-[268px] lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white shrink-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="font-display text-base font-bold tracking-tight text-slate-900">
            Rekapan Menu SPPG
          </div>
          <p className="mt-1 truncate text-xs text-slate-500" title={profile.namaSppg}>
            {profile.namaSppg}
          </p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active SPPG Workspace Box */}
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Building2 className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">Unit SPPG Aktif</div>
              <div className="truncate text-xs font-semibold text-slate-900" title={profile.namaSppg}>
                {profile.namaSppg}
              </div>
              <div className="font-mono-num mt-0.5 text-[11px] text-slate-500">
                ID: {profile.idSppg}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('identitas')}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Building2 className="h-3.5 w-3.5" />
            Edit Identitas SPPG
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
              aria-label="Menu navigasi"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 truncate">
                <span>{profile.namaSppg}</span>
                <span className="text-slate-300" aria-hidden="true">/</span>
                <span className="text-emerald-700">{getPeriodeDisplayName(activeMonthKey)}</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono-num">ID: {profile.idSppg}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{entries.length} hari tercatat</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{photoReadyCount} foto serentak</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setEditorModal({
                  open: true,
                  dateIso: nextDateForActiveMonth,
                  entry: null,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <CalendarPlus className="h-4 w-4 text-emerald-600" />
              Tambah Menu
            </button>
            <button
              type="button"
              disabled={
                activeTab !== 'master_menu' &&
                activeTab !== 'foodcost' &&
                activeTab !== 'update_pm' &&
                activeTab !== 'rekap_bahan' &&
                activeTab !== 'po_bahan' &&
                activeTab !== 'sampel' &&
                activeTab !== 'suhu' &&
                activeTab !== 'freezer' &&
                activeTab !== 'makanan' &&
                entries.length === 0
              }
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Unduh PDF F4
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-white p-3 lg:hidden space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium ${
                  activeTab === item.id
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2.5 px-2">
              <span className="text-xs text-slate-600 truncate">
                {profile.namaSppg} · ID: {profile.idSppg}
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('identitas');
                  setMobileMenuOpen(false);
                }}
                className="text-xs font-medium text-emerald-700"
              >
                Identitas SPPG
              </button>
            </div>
          </div>
        )}

        {/* Workspace Toolbar & Viewport */}
        <main className="flex-1 p-4 sm:p-6 space-y-5">
          {errorBanner && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              Terjadi kendala sinkronisasi: {errorBanner}
            </div>
          )}

          {/* Month & F4 Settings Strip */}
          {(activeTab === 'dashboard' ||
            activeTab === 'master_menu' ||
            activeTab === 'rekapan' ||
            activeTab === 'gizi' ||
            activeTab === 'foodcost' ||
            activeTab === 'update_pm' ||
            activeTab === 'rekap_bahan' ||
            activeTab === 'po_bahan' ||
            activeTab === 'sampel' ||
            activeTab === 'suhu' ||
            activeTab === 'freezer' ||
            activeTab === 'makanan' ||
            activeTab === 'kalender') && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              {/* Month Picker */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveMonthKey((m) => shiftMonthKey(m, -1))}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100"
                  title="Bulan sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="month"
                  value={activeMonthKey}
                  onChange={(e) => e.target.value && setActiveMonthKey(e.target.value)}
                  aria-label="Pilih bulan arsip"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setActiveMonthKey((m) => shiftMonthKey(m, 1))}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100"
                  title="Bulan berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* PDF & Table Controls (hidden on clean dashboard view) */}
              {activeTab !== 'dashboard' && (
                <div className="flex flex-wrap items-center gap-3">
                  {activeTab === 'rekapan' && entries.length > 1 && (
                    <button
                      type="button"
                      onClick={handleAutoRenumber}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      title="Urutkan nomor Hari Ke 1, 2, 3 sesuai tanggal"
                    >
                      <ListOrdered className="h-3.5 w-3.5 text-slate-500" />
                      Urutkan Hari Ke
                    </button>
                  )}

                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeYearInPeriod}
                      onChange={(e) => setIncludeYearInPeriod(e.target.checked)}
                      className="rounded border-slate-300 accent-emerald-600"
                    />
                    Sertakan Tahun di Periode
                  </label>

                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setPdfOrientation('landscape')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        pdfOrientation === 'landscape'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      F4 Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfOrientation('portrait')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        pdfOrientation === 'portrait'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      F4 Portrait
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab Views */}
          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              {/* Welcome & Short Educational Motivation Banner */}
              <section
                aria-label="Ucapan selamat datang pengawas gizi"
                className="rounded-xl border border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-medium text-emerald-700">Portal Pengawas Gizi</span>
                  <span aria-hidden="true">·</span>
                  <span>{profile.namaSppg || 'SPPG'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{getPeriodeDisplayName(activeMonthKey)}</span>
                </div>
                <h1 className="font-display mt-1 text-lg sm:text-xl font-bold tracking-tight text-slate-900 text-balance">
                  Selamat Datang di Portal Pengawas Gizi
                </h1>
                <p className="mt-1.5 max-w-3xl text-xs sm:text-sm leading-relaxed text-slate-600">
                  Setiap porsi seimbang, suhu pangan yang terjaga aman, serta catatan harian yang tertib adalah langkah nyata menjaga kualitas gizi generasi bangsa. Tetap teliti, konsisten, dan semangat mengawal mutu layanan hari ini!
                </p>
              </section>

              <DashboardCompletionPanel
                profile={profile}
                monthKey={activeMonthKey}
                entries={entries}
                sampleRows={sampleRows}
                tempRooms={tempRooms}
                freezerMachines={freezerMachines}
                foodTempBlocks={foodTempBlocks}
                onNavigateTab={setActiveTab}
                onAddNewMenu={() =>
                  setEditorModal({
                    open: true,
                    dateIso: nextDateForActiveMonth,
                    entry: null,
                  })
                }
              />
            </div>
          )}

          {activeTab === 'master_menu' && (
            <MasterMenuView
              uid={workspaceUid}
              monthKey={activeMonthKey}
              profile={profile}
              plans={masterMenus}
              onSavePlan={handleSaveMasterMenuPlan}
              onDeletePlan={handleDeleteMasterMenuPlan}
              onSendDaysToFoodCost={handleSendMasterMenuDaysToFoodCost}
              onSyncToRekapan={handleSyncMasterMenuToRekapan}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
              onExportPdf={(plan) => {
                exportMasterMenuToF4Pdf({
                  plan,
                  profile,
                  orientation: pdfOrientation,
                });
              }}
            />
          )}

          {activeTab === 'rekapan' && (
            entriesLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
                Memuat rekapan menu bulan {getPeriodeDisplayName(activeMonthKey)}...
              </div>
            ) : (
              <RekapanTablePreview
                profile={profile}
                monthKey={activeMonthKey}
                entries={entries}
                includeYearInPeriod={includeYearInPeriod}
                onAddNewEntry={() =>
                  setEditorModal({
                    open: true,
                    dateIso: nextDateForActiveMonth,
                    entry: null,
                  })
                }
                onEditEntry={(entry) =>
                  setEditorModal({
                    open: true,
                    dateIso: entry.dateIso,
                    entry,
                  })
                }
                onDeleteEntry={(entry) => {
                  void handleDeleteEntry(entry.id);
                }}
              />
            )
          )}

          {activeTab === 'gizi' && (
            entriesLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
                Memuat rekapan nilai gizi bulan {getPeriodeDisplayName(activeMonthKey)}...
              </div>
            ) : (
              <RekapanGiziView
                profile={profile}
                monthKey={activeMonthKey}
                entries={entries}
                includeYearInPeriod={includeYearInPeriod}
                selectedCategories={selectedCategories}
                akgTargets={activeArchive?.akgTargets}
                onChangeCategories={handleChangeSelectedCategories}
                onSaveAkgTargets={handleSaveAkgTargets}
                onEditEntryNutrition={(entry) => setNutritionModalEntry(entry)}
                onAddNewMenu={() =>
                  setEditorModal({
                    open: true,
                    dateIso: nextDateForActiveMonth,
                    entry: null,
                  })
                }
              />
            )
          )}

          {activeTab === 'foodcost' && (
            <FoodCostNutritionView
              uid={workspaceUid}
              profile={profile}
              monthKey={activeMonthKey}
              entries={entries}
              pmRecords={pmRecords}
              foodCostPlans={foodCostPlans}
              masterMenus={masterMenus}
              tkpiSyncConfig={tkpiSyncConfig}
              activeDateIso={activeWorkDateIso}
              onChangeDateIso={setActiveWorkDateIso}
              onSaveDayPlan={handleSaveFoodCostPlan}
              onSyncNutritionToEntry={handleSyncWorksheetNutritionToEntry}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
              onOpenTkpiModal={() => setTkpiModalOpen(true)}
              onExportPdf={(plan, pmRecord, activeWorksheetId) => {
                exportFoodCostNutritionToF4Pdf({
                  plan,
                  pmRecord,
                  worksheetIds: activeWorksheetId ? [activeWorksheetId] : undefined,
                  profile,
                  orientation: pdfOrientation,
                });
              }}
            />
          )}

          {activeTab === 'update_pm' && (
            <UpdatePmView
              uid={workspaceUid}
              profile={profile}
              monthKey={activeMonthKey}
              entries={entries}
              pmRecords={pmRecords}
              activeDateIso={activeWorkDateIso}
              onChangeDateIso={setActiveWorkDateIso}
              onSaveRecord={handleSavePmRecord}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
              onExportPdf={(record, viewMode) => {
                exportUpdatePmToF4Pdf({
                  record,
                  viewMode,
                  profile,
                  orientation: pdfOrientation,
                });
              }}
            />
          )}

          {(activeTab === 'rekap_bahan' || activeTab === 'po_bahan') && (
            <RekapBahanBakuPoView
              key={activeTab}
              uid={workspaceUid}
              profile={profile}
              monthKey={activeMonthKey}
              entries={entries}
              pmRecords={pmRecords}
              foodCostPlans={foodCostPlans}
              poRecaps={poRecaps}
              activeDateIso={activeWorkDateIso}
              initialSubTab={activeTab === 'po_bahan' ? 'po' : 'rekap'}
              onChangeDateIso={setActiveWorkDateIso}
              onSaveRecapConfig={handleSavePoRecapConfig}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
              onExportPdf={(recapConfig, foodCostPlan, pmRecord, mode) => {
                exportRawMaterialAndPoToF4Pdf({
                  recapConfig,
                  foodCostPlan,
                  pmRecord,
                  mode,
                  profile,
                  orientation: pdfOrientation,
                });
              }}
            />
          )}

          {activeTab === 'sampel' && effectiveSampleConfig && (
            <SamplePertinggalView
              profile={profile}
              monthKey={activeMonthKey}
              config={effectiveSampleConfig}
              rows={sampleRows}
              menuEntries={entries}
              minPrintableRows={minSamplePrintableRows}
              onChangeMinPrintableRows={setMinSamplePrintableRows}
              onSaveConfig={handleSaveSampleConfig}
              onSaveRow={handleSaveSampleRow}
              onDeleteRow={handleDeleteSampleRow}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
            />
          )}

          {activeTab === 'suhu' && effectiveTempConfig && (
            <TemperatureMonitoringView
              profile={profile}
              monthKey={activeMonthKey}
              config={effectiveTempConfig}
              rooms={tempRooms}
              roomsLoaded={tempRoomsLoaded}
              activeRoomId={effectiveTempRoomId}
              dayReadings={tempDayReadings}
              onSelectRoom={setActiveTempRoomId}
              onCreateRoom={handleCreateTempRoom}
              onSeedAllPresetRooms={handleSeedAllPresetRooms}
              onUpdateRoom={handleUpdateTempRoom}
              onDeleteRoom={handleDeleteTempRoom}
              onSaveConfig={handleSaveTempConfig}
              onSaveDayReading={handleSaveTempDayReading}
              onExportAllRoomsPdf={handleExportAllTempRoomsPdf}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
            />
          )}

          {activeTab === 'freezer' && effectiveFreezerConfig && (
            <FreezerChillerView
              profile={profile}
              monthKey={activeMonthKey}
              config={effectiveFreezerConfig}
              machines={freezerMachines}
              machinesLoaded={freezerMachinesLoaded}
              activeMachineId={effectiveFreezerMachineId}
              rows={freezerLogRows}
              onSelectMachine={setActiveFreezerMachineId}
              onCreateMachine={handleCreateFreezerMachine}
              onUpdateMachine={handleUpdateFreezerMachine}
              onDeleteMachine={handleDeleteFreezerMachine}
              onSaveConfig={handleSaveFreezerConfig}
              onSaveRow={handleSaveFreezerRow}
              onDeleteRow={handleDeleteFreezerRow}
              onExportAllMachinesPdf={handleExportAllFreezerMachinesPdf}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
            />
          )}

          {activeTab === 'makanan' && effectiveFoodTempConfig && (
            <LaporanSuhuMakananView
              profile={profile}
              monthKey={activeMonthKey}
              config={effectiveFoodTempConfig}
              blocks={foodTempBlocks}
              blocksLoaded={foodTempBlocksLoaded}
              menuEntries={entries}
              pdfOrientation={pdfOrientation}
              onSaveConfig={handleSaveFoodTempConfig}
              onSaveBlock={handleSaveFoodTempBlock}
              onDeleteBlock={handleDeleteFoodTempBlock}
              onSeedDefaultBlocks={handleSeedDefaultFoodTempBlocks}
              onSyncGlobalLeftLogo={handleSyncGlobalLeftLogo}
            />
          )}

          {activeTab === 'kalender' && (
            <MonthCalendarView
              monthKey={activeMonthKey}
              entries={entries}
              onSelectDate={(dateIso, existingEntry) =>
                setEditorModal({
                  open: true,
                  dateIso,
                  entry: existingEntry,
                })
              }
            />
          )}

          {activeTab === 'arsip' && (
            <MonthlyArchiveList
              uid={workspaceUid}
              profile={profile}
              archives={archives}
              activeMonthKey={activeMonthKey}
              pdfOrientation={pdfOrientation}
              includeYearInPeriod={includeYearInPeriod}
              onOpenMonth={(monthKey) => {
                setActiveMonthKey(monthKey);
                setActiveTab('rekapan');
              }}
              onCreateMonthArchive={(monthKey) => {
                setActiveMonthKey(monthKey);
                setActiveTab('rekapan');
              }}
            />
          )}

          {activeTab === 'identitas' && (
            <SppgProfileForm
              profile={profile}
              onSave={handleSaveProfile}
            />
          )}
        </main>
      </div>

      {/* Entry Editor Modal */}
      {editorModal.open && (
        <EntryEditorModal
          monthKey={activeMonthKey}
          initialDateIso={editorModal.dateIso}
          suggestedHariKe={suggestedHariKe}
          existingEntry={editorModal.entry}
          onClose={() => setEditorModal((prev) => ({ ...prev, open: false }))}
          onSave={handleSaveEntry}
          onDelete={handleDeleteEntry}
        />
      )}

      {/* Nutrition Entry Modal */}
      {nutritionModalEntry && (
        <NutritionEntryModal
          entry={nutritionModalEntry}
          selectedCategories={selectedCategories}
          onClose={() => setNutritionModalEntry(null)}
          onSave={handleSaveEntryNutrition}
        />
      )}

      {/* TKPI 2020 & Spreadsheet Sync Modal */}
      <TkpiSyncModal
        open={tkpiModalOpen}
        config={tkpiSyncConfig}
        onClose={() => setTkpiModalOpen(false)}
        onSaveConfig={handleSaveTkpiConfig}
      />
    </div>
  );
}
