import type { Unsubscribe } from 'firebase/firestore';
import {
  BGN_FREEZER_CHILLER_DEFAULTS,
  matchPresetByRoomName,
  SOP_BGN_ROOM_PRESETS,
} from '../constants/temperatureStandards';
import type {
  AkgTargetsConfig,
  DailyMenuEntry,
  FreezerColumnLabels,
  FreezerFormConfig,
  FreezerLogRow,
  FreezerMachine,
  FreezerMachineType,
  MonthlyArchive,
  NutritionValues,
  SampleColumnLabels,
  SampleFormConfig,
  SamplePertinggalRow,
  SppgUserProfile,
  TargetCategoryId,
  TempDayReading,
  TempFormConfig,
  TempMonitoringRoom,
  TempTableLabels,
  FoodTempColumnLabels,
  FoodTempDayBlock,
  FoodTempFormConfig,
  FoodTempItemRow,
  FoodTempSheetType,
  TkpiSyncConfig,
  DailyPmRecord,
  FoodCostDayPlan,
  RawMaterialRecapDayConfig,
  MasterMenuPlan,
} from '../types';
import { getPeriodeLabel, INDONESIAN_MONTHS, parseMonthKey } from '../utils/dateUtils';
import { getDefaultLogoSettings, normalizeLogoSettings } from '../utils/logoResolver';
import {
  DEFAULT_MASTER_MENU_ROW_LABELS,
  formatMasterMenuDefaultTitle,
  generateMasterMenuWeeks,
} from '../utils/masterMenuHelper';

export const LOCAL_WORKSPACE_UID = 'local_workspace';

const IDB_NAME = 'sppg_rekapan_local_v1';
const IDB_STORE = 'kv';
const LS_PREFIX = 'sppg_local_v1:';

const memoryStore = new Map<string, unknown>();
const listenersMap = new Map<string, Set<() => void>>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let hydrationPromise: Promise<void> | null = null;

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function sanitizeNutritionValues(v: NutritionValues): NutritionValues {
  const num = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0);
  return {
    energi: num(v.energi),
    protein: num(v.protein),
    lemak: num(v.lemak),
    karbohidrat: num(v.karbohidrat),
    serat: num(v.serat),
    jumlahManfaat:
      Number.isFinite(v.jumlahManfaat) && v.jumlahManfaat >= 0 ? Math.round(v.jumlahManfaat) : 0,
  };
}

function openLocalDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const database = req.result;
          if (!database.objectStoreNames.contains(IDB_STORE)) {
            database.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function ensureHydrated(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    // Seed memoryStore from localStorage first as fast synchronous fallback
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX)) {
            const raw = window.localStorage.getItem(k);
            if (raw) {
              const logicalKey = k.slice(LS_PREFIX.length);
              if (!memoryStore.has(logicalKey)) {
                memoryStore.set(logicalKey, JSON.parse(raw));
              }
            }
          }
        }
      } catch {
        // Ignore storage read errors
      }
    }

    const idb = await openLocalDb();
    if (!idb) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () => {
          const keys = keysReq.result || [];
          const vals = valsReq.result || [];
          keys.forEach((key, idx) => {
            if (typeof key === 'string') {
              memoryStore.set(key, vals[idx]);
            }
          });
          resolve();
        };
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  })();
  return hydrationPromise;
}

function notifyKey(key: string): void {
  const set = listenersMap.get(key);
  if (!set) return;
  set.forEach((cb) => cb());
}

async function writeKey(key: string, value: unknown): Promise<void> {
  await ensureHydrated();
  memoryStore.set(key, value);
  notifyKey(key);

  const idb = await openLocalDb();
  if (idb) {
    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // Ignore quota exceeded on fallback storage
    }
  }
}

async function readKey<T>(key: string): Promise<T | undefined> {
  await ensureHydrated();
  return memoryStore.get(key) as T | undefined;
}

function subscribeKey<T>(
  key: string,
  emitValue: (val: T | undefined) => void
): Unsubscribe {
  let active = true;
  const trigger = () => {
    if (!active) return;
    emitValue(memoryStore.get(key) as T | undefined);
  };

  let set = listenersMap.get(key);
  if (!set) {
    set = new Set();
    listenersMap.set(key, set);
  }
  set.add(trigger);

  void ensureHydrated().then(() => {
    trigger();
  });

  return () => {
    active = false;
    listenersMap.get(key)?.delete(trigger);
  };
}

export function getInitialDirectProfile(): SppgUserProfile {
  return {
    uid: LOCAL_WORKSPACE_UID,
    email: 'dashboard@sppg.local',
    reportTitle: 'REKAPAN MENU SMP',
    namaSppg: 'SPPG MUNA BARAT SAWERIGADI ONDOKE',
    idSppg: 'AT9ENIQ6',
    alamat: 'Jln. Poros Raha-Tondasi Desa Ondoke, Kec. Sawerigadi, Kab. Muna Barat',
    kabKota: 'MUNA BARAT',
    provinsi: 'SULAWESI TENGGARA',
    namaSppi: 'LA ODE MUHAMMAD SUKRI YUSUF, S.Tr.Gz',
    nomorHp: '082271095251',
    logoSettings: getDefaultLogoSettings(),
  };
}

// --- Profile ---

export function subscribeLocalUserProfile(
  onData: (profile: SppgUserProfile | null) => void
): Unsubscribe {
  return subscribeKey<SppgUserProfile>('profile', (stored) => {
    onData(stored || getInitialDirectProfile());
  });
}

export async function saveLocalUserProfile(
  input: Omit<SppgUserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const existing = await readKey<SppgUserProfile>('profile');
  const next: SppgUserProfile = {
    uid: LOCAL_WORKSPACE_UID,
    email: existing?.email || 'dashboard@sppg.local',
    reportTitle: clampString(input.reportTitle || 'REKAPAN MENU SMP', 100),
    namaSppg: clampString(input.namaSppg, 150),
    idSppg: clampString(input.idSppg.toUpperCase(), 40),
    alamat: clampString(input.alamat, 300),
    kabKota: clampString(input.kabKota.toUpperCase(), 100),
    provinsi: clampString(input.provinsi.toUpperCase(), 100),
    namaSppi: clampString(input.namaSppi, 150),
    nomorHp: clampString(input.nomorHp, 30),
    logoSettings: normalizeLogoSettings(input.logoSettings ?? existing?.logoSettings),
  };
  await writeKey('profile', next);
}

// --- Archives & Daily Menu ---

async function ensureLocalArchive(monthKey: string): Promise<Record<string, MonthlyArchive>> {
  const map = { ...((await readKey<Record<string, MonthlyArchive>>('archives')) || {}) };
  if (!map[monthKey]) {
    const { year, month } = parseMonthKey(monthKey);
    map[monthKey] = {
      id: monthKey,
      uid: LOCAL_WORKSPACE_UID,
      monthKey,
      year,
      month,
      periodeLabel: getPeriodeLabel(year, month, true),
      entryCount: 0,
      photoCount: 0,
    };
    await writeKey('archives', map);
  }
  return map;
}

async function syncLocalMonthSummary(monthKey: string): Promise<void> {
  const entriesMap = (await readKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`)) || {};
  const entries = Object.values(entriesMap);
  const entryCount = entries.length;
  const photoCount = entries.filter((e) => Boolean(e.photoDataUrl)).length;

  const archivesMap = await ensureLocalArchive(monthKey);
  const { year, month } = parseMonthKey(monthKey);
  archivesMap[monthKey] = {
    ...archivesMap[monthKey],
    id: monthKey,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    year,
    month,
    periodeLabel: getPeriodeLabel(year, month, true),
    entryCount,
    photoCount,
  };
  await writeKey('archives', archivesMap);
}

export function subscribeLocalMonthlyArchives(
  onData: (archives: MonthlyArchive[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, MonthlyArchive>>('archives', (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    onData(list);
  });
}

export function subscribeLocalMonthEntries(
  monthKey: string,
  onData: (entries: DailyMenuEntry[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso));
    onData(list);
  });
}

export async function fetchLocalMonthEntriesOnce(monthKey: string): Promise<DailyMenuEntry[]> {
  const map = (await readKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`)) || {};
  const list = Object.values(map);
  list.sort((a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso));
  return list;
}

export async function upsertLocalDailyMenuEntry(
  monthKey: string,
  input: {
    entryId?: string;
    dateIso: string;
    hariKe: number;
    namaMenu: string;
    photoDataUrl: string;
  }
): Promise<void> {
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entryId = input.entryId || `${input.dateIso}_${uniqueSuffix}`;
  const map = { ...((await readKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`)) || {}) };
  const existing = map[entryId];

  map[entryId] = {
    ...(existing || {}),
    id: entryId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    dateIso: input.dateIso,
    hariKe: Math.max(1, Math.min(366, Math.round(input.hariKe))),
    namaMenu: clampString(input.namaMenu, 1000),
    photoDataUrl: input.photoDataUrl.slice(0, 350000),
  };

  await writeKey(`entries:${monthKey}`, map);
  await syncLocalMonthSummary(monthKey);
}

export async function updateLocalEntryNutritionMap(
  monthKey: string,
  entryId: string,
  nutritionByCategory: Partial<Record<TargetCategoryId, NutritionValues>>,
  updatedNamaMenu?: string
): Promise<void> {
  const map = { ...((await readKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`)) || {}) };
  const existing = map[entryId];
  if (!existing) return;

  const sanitizedMap: Partial<Record<TargetCategoryId, NutritionValues>> = {};
  (Object.keys(nutritionByCategory) as TargetCategoryId[]).forEach((key) => {
    const val = nutritionByCategory[key];
    if (val) {
      sanitizedMap[key] = sanitizeNutritionValues(val);
    }
  });

  map[entryId] = {
    ...existing,
    nutritionByCategory: sanitizedMap,
    ...(updatedNamaMenu !== undefined && updatedNamaMenu.trim().length > 0
      ? { namaMenu: clampString(updatedNamaMenu, 1000) }
      : {}),
  };

  await writeKey(`entries:${monthKey}`, map);
}

export async function saveLocalMonthNutritionConfig(
  monthKey: string,
  selectedCategories: TargetCategoryId[],
  akgTargets?: AkgTargetsConfig
): Promise<void> {
  const archivesMap = await ensureLocalArchive(monthKey);
  const cleanAkg: AkgTargetsConfig | undefined = akgTargets
    ? {
        energi: Math.max(0, Math.round(akgTargets.energi * 10) / 10),
        protein: Math.max(0, Math.round(akgTargets.protein * 10) / 10),
        lemak: Math.max(0, Math.round(akgTargets.lemak * 10) / 10),
        karbohidrat: Math.max(0, Math.round(akgTargets.karbohidrat * 10) / 10),
        serat: Math.max(0, Math.round(akgTargets.serat * 10) / 10),
        targetOrang: Math.max(0, Math.round(akgTargets.targetOrang)),
        customTitle: clampString(akgTargets.customTitle || '', 80),
      }
    : archivesMap[monthKey]?.akgTargets;

  archivesMap[monthKey] = {
    ...archivesMap[monthKey],
    selectedCategories,
    ...(cleanAkg ? { akgTargets: cleanAkg } : {}),
  };
  await writeKey('archives', archivesMap);
}

export async function deleteLocalDailyMenuEntry(
  monthKey: string,
  entryId: string
): Promise<void> {
  const map = { ...((await readKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`)) || {}) };
  delete map[entryId];
  await writeKey(`entries:${monthKey}`, map);
  await syncLocalMonthSummary(monthKey);
}

export async function renumberLocalMonthEntriesChronologically(
  monthKey: string,
  entries: DailyMenuEntry[]
): Promise<void> {
  const map = { ...((await readKey<Record<string, DailyMenuEntry>>(`entries:${monthKey}`)) || {}) };
  const sorted = [...entries].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  let changed = false;
  sorted.forEach((entry, index) => {
    const expected = index + 1;
    if (map[entry.id] && map[entry.id].hariKe !== expected) {
      map[entry.id] = { ...map[entry.id], hariKe: expected };
      changed = true;
    }
  });
  if (changed) {
    await writeKey(`entries:${monthKey}`, map);
  }
}

// --- Sample Pertinggal (FR/PK/20) ---

export function subscribeLocalSampleFormConfig(
  monthKey: string,
  onData: (config: SampleFormConfig | null) => void
): Unsubscribe {
  return subscribeKey<SampleFormConfig>(`sampleConfig:${monthKey}`, (cfg) => {
    onData(cfg || null);
  });
}

export async function saveLocalSampleFormConfig(
  monthKey: string,
  input: Omit<SampleFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>,
  defaultColLabels: SampleColumnLabels
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const labels = input.colLabels || defaultColLabels;
  const payload: SampleFormConfig = {
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    logoCaption: clampString(input.logoCaption, 80),
    unitName: clampString(input.unitName, 150),
    formLabel: clampString(input.formLabel, 60),
    formTitle: clampString(input.formTitle, 100),
    docNumber: clampString(input.docNumber, 60),
    revision: clampString(input.revision, 30),
    effectiveDate: clampString(input.effectiveDate, 60),
    bulanLabel: clampString(input.bulanLabel, 40),
    tahunLabel: clampString(input.tahunLabel, 20),
    colLabels: {
      kodeIdentitas: clampString(labels.kodeIdentitas || 'Kode Identitas Makanan', 60),
      jumlahSampel: clampString(labels.jumlahSampel || 'Jumlah Sampel', 60),
      kondisiSampel: clampString(labels.kondisiSampel || 'Kondisi Sampel', 60),
      ok: clampString(labels.ok || 'OK', 20),
      nok: clampString(labels.nok || 'NOK', 20),
      penanggungJawab: clampString(labels.penanggungJawab || 'Nama Penanggung Jawab', 60),
      masukChiler: clampString(labels.masukChiler || 'Masuk Chiler', 60),
      keluarChiler: clampString(labels.keluarChiler || 'Keluar Chiler', 60),
      tanggal: clampString(labels.tanggal || 'Tanggal', 30),
      jam: clampString(labels.jam || 'Jam', 30),
    },
    verifierLine1: clampString(input.verifierLine1, 80),
    verifierLine2: clampString(input.verifierLine2, 80),
    verifierName: clampString(input.verifierName, 150),
  };
  await writeKey(`sampleConfig:${monthKey}`, payload);
}

export function subscribeLocalSampleRows(
  monthKey: string,
  onData: (rows: SamplePertinggalRow[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, SamplePertinggalRow>>(`sampleRows:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.rowOrder - b.rowOrder);
    onData(list);
  });
}

export async function upsertLocalSampleRow(
  monthKey: string,
  input: Omit<SamplePertinggalRow, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const uniqueId =
    input.id || `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const map = {
    ...((await readKey<Record<string, SamplePertinggalRow>>(`sampleRows:${monthKey}`)) || {}),
  };
  map[uniqueId] = {
    id: uniqueId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    rowOrder: Math.max(1, Math.min(500, Math.round(input.rowOrder))),
    kodeIdentitas: clampString(input.kodeIdentitas, 150),
    jumlahSampel: clampString(input.jumlahSampel, 60),
    kondisiOk: clampString(input.kondisiOk, 20),
    kondisiNok: clampString(input.kondisiNok, 20),
    penanggungJawab: clampString(input.penanggungJawab, 150),
    masukTanggal: clampString(input.masukTanggal, 60),
    masukJam: clampString(input.masukJam, 30),
    keluarTanggal: clampString(input.keluarTanggal, 60),
    keluarJam: clampString(input.keluarJam, 30),
  };
  await writeKey(`sampleRows:${monthKey}`, map);
}

export async function deleteLocalSampleRow(monthKey: string, rowId: string): Promise<void> {
  const map = {
    ...((await readKey<Record<string, SamplePertinggalRow>>(`sampleRows:${monthKey}`)) || {}),
  };
  delete map[rowId];
  await writeKey(`sampleRows:${monthKey}`, map);
}

// --- Temperature Monitoring (FR/PK/23) ---

export function subscribeLocalTempFormConfig(
  monthKey: string,
  onData: (config: TempFormConfig | null) => void
): Unsubscribe {
  return subscribeKey<TempFormConfig>(`tempConfig:${monthKey}`, (cfg) => {
    onData(cfg || null);
  });
}

export async function saveLocalTempFormConfig(
  monthKey: string,
  input: Omit<TempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>,
  defaultTableLabels: TempTableLabels
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const labels = input.tableLabels || defaultTableLabels;
  const payload: TempFormConfig = {
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    logoCaption: clampString(input.logoCaption, 80),
    unitName: clampString(input.unitName, 150),
    formLabel: clampString(input.formLabel, 60),
    formTitle: clampString(input.formTitle, 120),
    docNumber: clampString(input.docNumber, 60),
    revision: clampString(input.revision, 30),
    effectiveDate: clampString(input.effectiveDate, 60),
    periodeLabel: clampString(input.periodeLabel, 60),
    tableLabels: {
      kegiatan: clampString(labels.kegiatan || 'Kegiatan', 40),
      tanggal: clampString(labels.tanggal || 'TANGGAL', 40),
      jam: clampString(labels.jam || 'Jam', 30),
      suhu: clampString(labels.suhu || 'Suhu (°C)', 40),
      rh: clampString(labels.rh || 'RH (%)', 40),
      paraf: clampString(labels.paraf || 'PARAF PETUGAS', 40),
      namaPetugas: clampString(labels.namaPetugas || 'NAMA PETUGAS', 40),
    },
    sopTitle: clampString(input.sopTitle, 150),
    sopSubtitle: clampString(input.sopSubtitle, 300),
  };
  await writeKey(`tempConfig:${monthKey}`, payload);
}

export function subscribeLocalTempRooms(
  monthKey: string,
  onData: (rooms: TempMonitoringRoom[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, TempMonitoringRoom>>(`tempRooms:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.roomOrder - b.roomOrder);
    onData(list);
  });
}

export async function createLocalTempRoom(
  monthKey: string,
  input: {
    roomName: string;
    roomOrder: number;
    presetKey?: string;
    standardSuhu?: string;
    standardRh?: string;
    sopNote?: string;
  }
): Promise<string> {
  await ensureLocalArchive(monthKey);
  const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const matched = matchPresetByRoomName(input.roomName);
  const map = {
    ...((await readKey<Record<string, TempMonitoringRoom>>(`tempRooms:${monthKey}`)) || {}),
  };
  map[roomId] = {
    id: roomId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    roomOrder: Math.max(1, Math.min(200, Math.round(input.roomOrder))),
    roomName: clampString(input.roomName, 120) || 'Gudang Basah',
    presetKey: clampString(input.presetKey || matched.presetKey, 60),
    standardSuhu: clampString(input.standardSuhu || matched.standardSuhu, 120),
    standardRh: clampString(input.standardRh || matched.standardRh, 80),
    sopNote: clampString(input.sopNote || matched.sopNote, 300),
  };
  await writeKey(`tempRooms:${monthKey}`, map);
  return roomId;
}

export async function seedAllLocalPresetTempRooms(
  monthKey: string,
  existingRooms: TempMonitoringRoom[]
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const map = {
    ...((await readKey<Record<string, TempMonitoringRoom>>(`tempRooms:${monthKey}`)) || {}),
  };
  const existingNames = new Set(existingRooms.map((r) => r.roomName.trim().toLowerCase()));
  let nextOrder = existingRooms.reduce((m, r) => Math.max(m, r.roomOrder), 0);
  let added = false;

  SOP_BGN_ROOM_PRESETS.forEach((preset, idx) => {
    if (existingNames.has(preset.label.toLowerCase())) return;
    nextOrder += 1;
    added = true;
    const roomId = `room_${preset.presetKey}_${Date.now().toString(36)}_${idx}`;
    map[roomId] = {
      id: roomId,
      uid: LOCAL_WORKSPACE_UID,
      monthKey,
      roomOrder: Math.min(200, nextOrder),
      roomName: preset.label,
      presetKey: preset.presetKey,
      standardSuhu: preset.standardSuhu,
      standardRh: preset.standardRh,
      sopNote: preset.sopNote,
    };
  });

  if (added) {
    await writeKey(`tempRooms:${monthKey}`, map);
  }
}

export async function updateLocalTempRoom(
  monthKey: string,
  roomId: string,
  input: {
    roomOrder: number;
    roomName: string;
    presetKey: string;
    standardSuhu: string;
    standardRh: string;
    sopNote: string;
  }
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, TempMonitoringRoom>>(`tempRooms:${monthKey}`)) || {}),
  };
  if (!map[roomId]) return;
  map[roomId] = {
    ...map[roomId],
    roomOrder: Math.max(1, Math.min(200, Math.round(input.roomOrder))),
    roomName: clampString(input.roomName, 120) || 'Ruangan',
    presetKey: clampString(input.presetKey, 60),
    standardSuhu: clampString(input.standardSuhu, 120),
    standardRh: clampString(input.standardRh, 80),
    sopNote: clampString(input.sopNote, 300),
  };
  await writeKey(`tempRooms:${monthKey}`, map);
}

export async function deleteLocalTempRoom(monthKey: string, roomId: string): Promise<void> {
  const map = {
    ...((await readKey<Record<string, TempMonitoringRoom>>(`tempRooms:${monthKey}`)) || {}),
  };
  delete map[roomId];
  await writeKey(`tempRooms:${monthKey}`, map);
  await writeKey(`tempDays:${monthKey}:${roomId}`, {});
}

export function subscribeLocalRoomDayReadings(
  monthKey: string,
  roomId: string,
  onData: (readings: TempDayReading[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, TempDayReading>>(
    `tempDays:${monthKey}:${roomId}`,
    (map) => {
      const list = Object.values(map || {});
      list.sort((a, b) => a.day - b.day);
      onData(list);
    }
  );
}

export async function fetchLocalRoomDayReadingsOnce(
  monthKey: string,
  roomId: string
): Promise<TempDayReading[]> {
  const map =
    (await readKey<Record<string, TempDayReading>>(`tempDays:${monthKey}:${roomId}`)) || {};
  const list = Object.values(map);
  list.sort((a, b) => a.day - b.day);
  return list;
}

export async function upsertLocalTempDayReading(
  monthKey: string,
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
): Promise<void> {
  const safeDay = Math.max(1, Math.min(31, Math.round(input.day)));
  const dayId = String(safeDay);
  const map = {
    ...((await readKey<Record<string, TempDayReading>>(`tempDays:${monthKey}:${roomId}`)) || {}),
  };
  map[dayId] = {
    id: dayId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    roomId,
    day: safeDay,
    jam: clampString(input.jam, 20),
    suhu: clampString(input.suhu, 30),
    rh: clampString(input.rh, 30),
    paraf: clampString(input.paraf, 40),
    namaPetugas: clampString(input.namaPetugas, 120),
    photoDataUrl: (input.photoDataUrl || '').slice(0, 180000),
    detectedNote: clampString(input.detectedNote || '', 250),
  };
  await writeKey(`tempDays:${monthKey}:${roomId}`, map);
}

// --- Freezer & Chiller (FR/JM/06) ---

export function subscribeLocalFreezerFormConfig(
  monthKey: string,
  onData: (config: FreezerFormConfig | null) => void
): Unsubscribe {
  return subscribeKey<FreezerFormConfig>(`freezerConfig:${monthKey}`, (cfg) => {
    onData(cfg || null);
  });
}

export async function saveLocalFreezerFormConfig(
  monthKey: string,
  input: Omit<FreezerFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>,
  defaultColLabels: FreezerColumnLabels
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const l = input.colLabels || defaultColLabels;
  const payload: FreezerFormConfig = {
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    logoCaption: clampString(input.logoCaption, 80),
    unitName: clampString(input.unitName, 150),
    formLabel: clampString(input.formLabel, 60),
    formTitle: clampString(input.formTitle, 120),
    docNumber: clampString(input.docNumber, 60),
    revision: clampString(input.revision, 30),
    effectiveDate: clampString(input.effectiveDate, 60),
    periodeLabel: clampString(input.periodeLabel, 60),
    colLabels: {
      namaMesin: clampString(l.namaMesin || 'Nama Mesin', 40),
      merk: clampString(l.merk || 'Merk', 40),
      noMesin: clampString(l.noMesin || 'No. Mesin', 40),
      lokasi: clampString(l.lokasi || 'Lokasi', 40),
      periode: clampString(l.periode || 'Periode', 40),
      no: clampString(l.no || 'No', 20),
      tanggal: clampString(l.tanggal || 'Tanggal', 30),
      jamCek1: clampString(l.jamCek1 || 'Jam Cek (I)', 30),
      suhu1: clampString(l.suhu1 || 'Suhu', 20),
      pic1: clampString(l.pic1 || 'PIC', 20),
      jamCek2: clampString(l.jamCek2 || 'Jam Cek (II)', 30),
      suhu2: clampString(l.suhu2 || 'Suhu', 20),
      pic2: clampString(l.pic2 || 'PIC', 20),
      jamCek3: clampString(l.jamCek3 || 'Jam Cek (III)', 30),
      suhu3: clampString(l.suhu3 || 'Suhu', 20),
      pic3: clampString(l.pic3 || 'PIC', 20),
      keterangan: clampString(l.keterangan || 'Keterangan', 40),
    },
  };
  await writeKey(`freezerConfig:${monthKey}`, payload);
}

export function subscribeLocalFreezerMachines(
  monthKey: string,
  onData: (machines: FreezerMachine[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, FreezerMachine>>(
    `freezerMachines:${monthKey}`,
    (map) => {
      const list = Object.values(map || {});
      list.sort((a, b) => a.machineOrder - b.machineOrder);
      onData(list);
    }
  );
}

export async function createLocalFreezerMachine(
  monthKey: string,
  input: {
    machineOrder: number;
    machineType: FreezerMachineType;
    namaMesin: string;
    merk?: string;
    noMesin?: string;
    lokasi?: string;
    normalSuhuBgn?: string;
    bgnSopNote?: string;
  }
): Promise<string> {
  await ensureLocalArchive(monthKey);
  const machineId = `unit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const bgnDefault = BGN_FREEZER_CHILLER_DEFAULTS[input.machineType];

  const machinesMap = {
    ...((await readKey<Record<string, FreezerMachine>>(`freezerMachines:${monthKey}`)) || {}),
  };
  machinesMap[machineId] = {
    id: machineId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    machineOrder: Math.max(1, Math.min(200, Math.round(input.machineOrder))),
    machineType: input.machineType,
    namaMesin: clampString(input.namaMesin, 120) || bgnDefault.label,
    merk: clampString(input.merk || '-', 100),
    noMesin: clampString(input.noMesin || '-', 100),
    lokasi: clampString(input.lokasi || 'Gudang Basah', 120),
    normalSuhuBgn: clampString(input.normalSuhuBgn || bgnDefault.normalSuhuBgn, 120),
    bgnSopNote: clampString(input.bgnSopNote || bgnDefault.bgnSopNote, 300),
    conclusionHeader: 'Kesimpulan Hasil Pemeriksaan',
    repairPrompt: 'Perlu Perbaikan: Ya/Tidak*',
    repairNote: '* Coret salah satu',
  };

  const firstRows: Record<string, FreezerLogRow> = {
    row_1: {
      id: 'row_1',
      uid: LOCAL_WORKSPACE_UID,
      monthKey,
      machineId,
      rowOrder: 1,
      noLabel: '1',
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
    },
  };

  await writeKey(`freezerMachines:${monthKey}`, machinesMap);
  await writeKey(`freezerRows:${monthKey}:${machineId}`, firstRows);
  return machineId;
}

export async function updateLocalFreezerMachine(
  monthKey: string,
  machineId: string,
  input: Omit<FreezerMachine, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, FreezerMachine>>(`freezerMachines:${monthKey}`)) || {}),
  };
  if (!map[machineId]) return;
  map[machineId] = {
    ...map[machineId],
    machineOrder: Math.max(1, Math.min(200, Math.round(input.machineOrder))),
    machineType: input.machineType,
    namaMesin: clampString(input.namaMesin, 120) || 'Mesin',
    merk: clampString(input.merk, 100),
    noMesin: clampString(input.noMesin, 100),
    lokasi: clampString(input.lokasi, 120),
    normalSuhuBgn: clampString(input.normalSuhuBgn, 120),
    bgnSopNote: clampString(input.bgnSopNote, 300),
    conclusionHeader: clampString(input.conclusionHeader, 100),
    repairPrompt: clampString(input.repairPrompt, 100),
    repairNote: clampString(input.repairNote, 100),
  };
  await writeKey(`freezerMachines:${monthKey}`, map);
}

export async function deleteLocalFreezerMachine(
  monthKey: string,
  machineId: string
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, FreezerMachine>>(`freezerMachines:${monthKey}`)) || {}),
  };
  delete map[machineId];
  await writeKey(`freezerMachines:${monthKey}`, map);
  await writeKey(`freezerRows:${monthKey}:${machineId}`, {});
}

export function subscribeLocalFreezerLogRows(
  monthKey: string,
  machineId: string,
  onData: (rows: FreezerLogRow[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, FreezerLogRow>>(
    `freezerRows:${monthKey}:${machineId}`,
    (map) => {
      const list = Object.values(map || {});
      list.sort((a, b) => a.rowOrder - b.rowOrder);
      onData(list);
    }
  );
}

export async function fetchLocalFreezerLogRowsOnce(
  monthKey: string,
  machineId: string
): Promise<FreezerLogRow[]> {
  const map =
    (await readKey<Record<string, FreezerLogRow>>(`freezerRows:${monthKey}:${machineId}`)) || {};
  const list = Object.values(map);
  list.sort((a, b) => a.rowOrder - b.rowOrder);
  return list;
}

export async function upsertLocalFreezerLogRow(
  monthKey: string,
  machineId: string,
  input: Omit<
    FreezerLogRow,
    'id' | 'uid' | 'monthKey' | 'machineId' | 'createdAt' | 'updatedAt'
  > & { id?: string }
): Promise<void> {
  const rowId =
    input.id || `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const map = {
    ...((await readKey<Record<string, FreezerLogRow>>(`freezerRows:${monthKey}:${machineId}`)) ||
      {}),
  };
  map[rowId] = {
    id: rowId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    machineId,
    rowOrder: Math.max(1, Math.min(500, Math.round(input.rowOrder))),
    noLabel: clampString(input.noLabel, 20),
    tanggal: clampString(input.tanggal, 60),
    jamCek1: clampString(input.jamCek1, 30),
    suhu1: clampString(input.suhu1, 30),
    pic1: clampString(input.pic1, 80),
    jamCek2: clampString(input.jamCek2, 30),
    suhu2: clampString(input.suhu2, 30),
    pic2: clampString(input.pic2, 80),
    jamCek3: clampString(input.jamCek3, 30),
    suhu3: clampString(input.suhu3, 30),
    pic3: clampString(input.pic3, 80),
    keterangan: clampString(input.keterangan, 250),
  };
  await writeKey(`freezerRows:${monthKey}:${machineId}`, map);
}

export async function deleteLocalFreezerLogRow(
  monthKey: string,
  machineId: string,
  rowId: string
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, FreezerLogRow>>(`freezerRows:${monthKey}:${machineId}`)) ||
      {}),
  };
  delete map[rowId];
  await writeKey(`freezerRows:${monthKey}:${machineId}`, map);
}

// --- Laporan Suhu Makanan Masak & Masuk Ompreng ---

function sanitizeFoodItems(items: FoodTempItemRow[]): FoodTempItemRow[] {
  const normalized = (items || []).slice(0, 20).map((item) => ({
    namaMakanan: clampString(item.namaMakanan || '', 150),
    suhu: clampString(item.suhu || '', 30),
  }));
  while (normalized.length === 0) {
    normalized.push({ namaMakanan: '', suhu: '' });
  }
  return normalized;
}

export function subscribeLocalFoodTempFormConfig(
  monthKey: string,
  onData: (config: FoodTempFormConfig | null) => void
): Unsubscribe {
  return subscribeKey<FoodTempFormConfig>(`foodTempConfig:${monthKey}`, (cfg) => {
    onData(cfg || null);
  });
}

export async function saveLocalFoodTempFormConfig(
  monthKey: string,
  input: Omit<FoodTempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>,
  defaultColLabels: FoodTempColumnLabels
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const l = input.colLabels || defaultColLabels;
  const payload: FoodTempFormConfig = {
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    logoLeftDataUrl: (input.logoLeftDataUrl || '').slice(0, 200000),
    logoLeftWidthPx: input.logoLeftWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    headerLine1: clampString(input.headerLine1, 120),
    headerLine2: clampString(input.headerLine2, 150),
    headerLine3: clampString(input.headerLine3, 150),
    headerLine4: clampString(input.headerLine4, 250),
    titleMasak: clampString(input.titleMasak, 120),
    titleOmpreng: clampString(input.titleOmpreng, 120),
    bulanLabel: clampString(input.bulanLabel, 60),
    colLabels: {
      tanggal: clampString(l.tanggal || 'Tanggal', 40),
      namaMakanan: clampString(l.namaMakanan || 'Nama Makanan', 60),
      suhuMakanan: clampString(l.suhuMakanan || 'Suhu Makanan (°C)', 60),
      paraf: clampString(l.paraf || 'Paraf', 40),
    },
    signerLine1: clampString(input.signerLine1, 100),
    signerLine2: clampString(input.signerLine2, 150),
    signerName: clampString(input.signerName, 150),
  };
  await writeKey(`foodTempConfig:${monthKey}`, payload);
}

export function subscribeLocalFoodTempDayBlocks(
  monthKey: string,
  onData: (blocks: FoodTempDayBlock[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, FoodTempDayBlock>>(
    `foodTempBlocks:${monthKey}`,
    (map) => {
      const list = Object.values(map || {});
      list.sort(
        (a, b) =>
          a.sheetType.localeCompare(b.sheetType) || a.blockOrder - b.blockOrder
      );
      onData(list);
    }
  );
}

export async function fetchLocalFoodTempDayBlocksOnce(
  monthKey: string
): Promise<FoodTempDayBlock[]> {
  const map =
    (await readKey<Record<string, FoodTempDayBlock>>(`foodTempBlocks:${monthKey}`)) || {};
  const list = Object.values(map);
  list.sort(
    (a, b) => a.sheetType.localeCompare(b.sheetType) || a.blockOrder - b.blockOrder
  );
  return list;
}

export async function upsertLocalFoodTempDayBlock(
  monthKey: string,
  input: Omit<FoodTempDayBlock, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Promise<string> {
  await ensureLocalArchive(monthKey);
  const blockId =
    input.id ||
    `ftb_${input.sheetType}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const map = {
    ...((await readKey<Record<string, FoodTempDayBlock>>(`foodTempBlocks:${monthKey}`)) || {}),
  };
  map[blockId] = {
    id: blockId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    sheetType: input.sheetType,
    blockOrder: Math.max(1, Math.min(200, Math.round(input.blockOrder))),
    tanggal: clampString(input.tanggal, 60),
    paraf: clampString(input.paraf, 60),
    items: sanitizeFoodItems(input.items),
  };
  await writeKey(`foodTempBlocks:${monthKey}`, map);
  return blockId;
}

export async function deleteLocalFoodTempDayBlock(
  monthKey: string,
  blockId: string
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, FoodTempDayBlock>>(`foodTempBlocks:${monthKey}`)) || {}),
  };
  delete map[blockId];
  await writeKey(`foodTempBlocks:${monthKey}`, map);
}

export async function seedDefaultLocalFoodTempBlocks(
  monthKey: string,
  sheetType: FoodTempSheetType,
  count = 5
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const map = {
    ...((await readKey<Record<string, FoodTempDayBlock>>(`foodTempBlocks:${monthKey}`)) || {}),
  };
  const existingForSheet = Object.values(map).filter((b) => b.sheetType === sheetType);
  if (existingForSheet.length > 0) return;

  for (let i = 1; i <= count; i++) {
    const blockId = `ftb_${sheetType}_init_${i}`;
    map[blockId] = {
      id: blockId,
      uid: LOCAL_WORKSPACE_UID,
      monthKey,
      sheetType,
      blockOrder: i,
      tanggal: '',
      paraf: '',
      items: Array.from({ length: 5 }, () => ({ namaMakanan: '', suhu: '' })),
    };
  }
  await writeKey(`foodTempBlocks:${monthKey}`, map);
}

// Keep unused-import-free reference to INDONESIAN_MONTHS if needed by future helpers
void INDONESIAN_MONTHS;

// --- TKPI 2020 & Spreadsheet Sync ---

export function subscribeLocalTkpiSyncConfig(
  onData: (config: TkpiSyncConfig | null) => void
): Unsubscribe {
  return subscribeKey<TkpiSyncConfig>('tkpiConfig', (cfg) => {
    onData(cfg || null);
  });
}

export async function saveLocalTkpiSyncConfig(
  input: Omit<TkpiSyncConfig, 'uid' | 'updatedAt'>
): Promise<void> {
  const payload: TkpiSyncConfig = {
    uid: LOCAL_WORKSPACE_UID,
    spreadsheetUrl: clampString(input.spreadsheetUrl || '', 500),
    lastSyncedAt: clampString(input.lastSyncedAt || '', 60),
    syncedItems: Array.isArray(input.syncedItems) ? input.syncedItems.slice(0, 3000) : [],
    customItems: Array.isArray(input.customItems) ? input.customItems.slice(0, 500) : [],
  };
  await writeKey('tkpiConfig', payload);
}

// --- Update PM (Penerima Manfaat) ---

export function subscribeLocalMonthPmRecords(
  monthKey: string,
  onData: (records: DailyPmRecord[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, DailyPmRecord>>(`pmDays:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    onData(list);
  });
}

export async function upsertLocalDailyPmRecord(
  monthKey: string,
  input: Omit<DailyPmRecord, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const recordId = input.dateIso;
  const map = {
    ...((await readKey<Record<string, DailyPmRecord>>(`pmDays:${monthKey}`)) || {}),
  };
  map[recordId] = {
    id: recordId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    dateIso: input.dateIso,
    hariKe: Math.max(1, Math.min(366, Math.round(input.hariKe || 1))),
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    titleSpecific: clampString(input.titleSpecific || 'UPDATE DATA SPESIFIK', 120),
    titleSummary: clampString(input.titleSummary || 'UPDATE DATA PENERIMA MANFAAT', 120),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    specificRows: (input.specificRows || []).slice(0, 200),
    summaryOverrides: input.summaryOverrides || {},
  };
  await writeKey(`pmDays:${monthKey}`, map);
}

export async function deleteLocalDailyPmRecord(
  monthKey: string,
  dateIso: string
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, DailyPmRecord>>(`pmDays:${monthKey}`)) || {}),
  };
  delete map[dateIso];
  await writeKey(`pmDays:${monthKey}`, map);
}

// --- Nilai Gizi & Food Cost ---

export function subscribeLocalMonthFoodCostPlans(
  monthKey: string,
  onData: (plans: FoodCostDayPlan[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, FoodCostDayPlan>>(`foodCostDays:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    onData(list);
  });
}

export async function upsertLocalFoodCostDayPlan(
  monthKey: string,
  input: Omit<FoodCostDayPlan, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const planId = input.dateIso;
  const map = {
    ...((await readKey<Record<string, FoodCostDayPlan>>(`foodCostDays:${monthKey}`)) || {}),
  };
  map[planId] = {
    id: planId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    dateIso: input.dateIso,
    hariKe: Math.max(1, Math.min(366, Math.round(input.hariKe || 1))),
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    worksheets: (input.worksheets || []).slice(0, 30),
  };
  await writeKey(`foodCostDays:${monthKey}`, map);
}

export async function deleteLocalFoodCostDayPlan(
  monthKey: string,
  dateIso: string
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, FoodCostDayPlan>>(`foodCostDays:${monthKey}`)) || {}),
  };
  delete map[dateIso];
  await writeKey(`foodCostDays:${monthKey}`, map);
}

// --- Rekap Bahan Baku & Nota Pesanan (PO) ---

export function subscribeLocalMonthPoRecaps(
  monthKey: string,
  onData: (recaps: RawMaterialRecapDayConfig[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, RawMaterialRecapDayConfig>>(`poDays:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    onData(list);
  });
}

export async function upsertLocalRawMaterialRecapDayConfig(
  monthKey: string,
  input: Omit<
    RawMaterialRecapDayConfig,
    'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'
  >
): Promise<void> {
  await ensureLocalArchive(monthKey);
  const recapId = input.dateIso;
  const map = {
    ...((await readKey<Record<string, RawMaterialRecapDayConfig>>(`poDays:${monthKey}`)) || {}),
  };
  map[recapId] = {
    id: recapId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    dateIso: input.dateIso,
    hariKe: Math.max(1, Math.min(366, Math.round(input.hariKe || 1))),
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    recapTitle: clampString(
      input.recapTitle || 'REKAPAN TOTAL KEBUTUHAN BAHAN BAKU KESELURUHAN',
      150
    ),
    sideLabel: clampString(input.sideLabel || 'REKAPAN / PO', 60),
    bufferPercent: Math.max(0, Number(input.bufferPercent) || 0),
    bumbuPercent: Math.max(0, Number(input.bumbuPercent) || 0),
    rabPorsiKecilRate: Math.max(0, Number(input.rabPorsiKecilRate) || 0),
    rabPorsiBesarRate: Math.max(0, Number(input.rabPorsiBesarRate) || 0),
    poJudul: clampString(input.poJudul || `NOTA PESANAN HARI ${input.hariKe || 1}`, 120),
    poDari: clampString(input.poDari || '', 150),
    poKepada: clampString(input.poKepada || '', 150),
    poAlamat: clampString(input.poAlamat || '', 250),
    poSignerLabel1: clampString(input.poSignerLabel1 || 'Mengetahui,', 100),
    poSignerLabel2: clampString(
      input.poSignerLabel2 || 'Kepala Satuan Pelayanan Pemenuhan Gizi',
      150
    ),
    poSignerName: clampString(input.poSignerName || '', 150),
    itemOverrides: input.itemOverrides || {},
  };
  await writeKey(`poDays:${monthKey}`, map);
}

// --- Master Menu (1-4 Minggu / Bulanan) ---

export function subscribeLocalMonthMasterMenus(
  monthKey: string,
  onData: (plans: MasterMenuPlan[]) => void
): Unsubscribe {
  return subscribeKey<Record<string, MasterMenuPlan>>(`masterMenus:${monthKey}`, (map) => {
    const list = Object.values(map || {});
    list.sort((a, b) => a.title.localeCompare(b.title));
    onData(list);
  });
}

export async function upsertLocalMasterMenuPlan(
  monthKey: string,
  input: Omit<MasterMenuPlan, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  await ensureLocalArchive(monthKey);
  const planId =
    input.id || `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const map = {
    ...((await readKey<Record<string, MasterMenuPlan>>(`masterMenus:${monthKey}`)) || {}),
  };
  const cycleMode = input.cycleMode || '4_minggu';
  const categoryIds: TargetCategoryId[] =
    input.categoryIds && input.categoryIds.length > 0 ? input.categoryIds : ['sd_1_3'];

  map[planId] = {
    id: planId,
    uid: LOCAL_WORKSPACE_UID,
    monthKey,
    title: clampString(
      input.title || formatMasterMenuDefaultTitle(categoryIds, cycleMode, monthKey),
      160
    ),
    categoryIds,
    cycleMode,
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: input.logoWidthPx || 56,
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: input.logoRightWidthPx || 56,
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    rowLabels: {
      ...DEFAULT_MASTER_MENU_ROW_LABELS,
      ...(input.rowLabels || {}),
    },
    weeks:
      input.weeks && input.weeks.length > 0
        ? input.weeks.slice(0, 6)
        : generateMasterMenuWeeks(monthKey, cycleMode),
  };
  await writeKey(`masterMenus:${monthKey}`, map);
  return planId;
}

export async function deleteLocalMasterMenuPlan(
  monthKey: string,
  planId: string
): Promise<void> {
  const map = {
    ...((await readKey<Record<string, MasterMenuPlan>>(`masterMenus:${monthKey}`)) || {}),
  };
  delete map[planId];
  await writeKey(`masterMenus:${monthKey}`, map);
}



