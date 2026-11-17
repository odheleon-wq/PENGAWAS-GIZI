import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AkgTargetsConfig,
  DailyMenuEntry,
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
  FreezerColumnLabels,
  FreezerFormConfig,
  FreezerLogRow,
  FreezerMachine,
  FreezerMachineType,
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
import {
  BGN_FREEZER_CHILLER_DEFAULTS,
  matchPresetByRoomName,
  SOP_BGN_ROOM_PRESETS,
} from '../constants/temperatureStandards';
import { getPeriodeLabel, INDONESIAN_MONTHS, parseMonthKey } from '../utils/dateUtils';
import { normalizeLogoSettings } from '../utils/logoResolver';
import {
  DEFAULT_MASTER_MENU_ROW_LABELS,
  formatMasterMenuDefaultTitle,
  generateMasterMenuWeeks,
} from '../utils/masterMenuHelper';
import {
  createLocalFreezerMachine,
  createLocalTempRoom,
  deleteLocalDailyMenuEntry,
  deleteLocalFoodTempDayBlock,
  deleteLocalFreezerLogRow,
  deleteLocalFreezerMachine,
  deleteLocalSampleRow,
  deleteLocalTempRoom,
  fetchLocalFoodTempDayBlocksOnce,
  fetchLocalFreezerLogRowsOnce,
  fetchLocalMonthEntriesOnce,
  fetchLocalRoomDayReadingsOnce,
  LOCAL_WORKSPACE_UID,
  renumberLocalMonthEntriesChronologically,
  saveLocalFoodTempFormConfig,
  saveLocalFreezerFormConfig,
  saveLocalMonthNutritionConfig,
  saveLocalSampleFormConfig,
  saveLocalTempFormConfig,
  saveLocalUserProfile,
  seedAllLocalPresetTempRooms,
  seedDefaultLocalFoodTempBlocks,
  subscribeLocalFoodTempDayBlocks,
  subscribeLocalFoodTempFormConfig,
  subscribeLocalFreezerFormConfig,
  subscribeLocalFreezerLogRows,
  subscribeLocalFreezerMachines,
  subscribeLocalMonthEntries,
  subscribeLocalMonthlyArchives,
  subscribeLocalRoomDayReadings,
  subscribeLocalSampleFormConfig,
  subscribeLocalSampleRows,
  subscribeLocalTempFormConfig,
  subscribeLocalTempRooms,
  subscribeLocalUserProfile,
  updateLocalEntryNutritionMap,
  updateLocalFreezerMachine,
  updateLocalTempRoom,
  upsertLocalDailyMenuEntry,
  upsertLocalFoodTempDayBlock,
  upsertLocalFreezerLogRow,
  upsertLocalSampleRow,
  upsertLocalTempDayReading,
  subscribeLocalTkpiSyncConfig,
  saveLocalTkpiSyncConfig,
  subscribeLocalMonthPmRecords,
  upsertLocalDailyPmRecord,
  deleteLocalDailyPmRecord,
  subscribeLocalMonthFoodCostPlans,
  upsertLocalFoodCostDayPlan,
  deleteLocalFoodCostDayPlan,
  subscribeLocalMonthPoRecaps,
  upsertLocalRawMaterialRecapDayConfig,
  subscribeLocalMonthMasterMenus,
  upsertLocalMasterMenuPlan,
  deleteLocalMasterMenuPlan,
} from './localSppgStore';

export { LOCAL_WORKSPACE_UID };

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function sanitizeLogoWidthPx(val: unknown, fallback = 56): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(20, Math.min(180, Math.round(n)));
}

function sanitizeNutritionValues(v: NutritionValues): NutritionValues {
  const num = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0);
  return {
    energi: num(v.energi),
    protein: num(v.protein),
    lemak: num(v.lemak),
    karbohidrat: num(v.karbohidrat),
    serat: num(v.serat),
    jumlahManfaat: Number.isFinite(v.jumlahManfaat) && v.jumlahManfaat >= 0 ? Math.round(v.jumlahManfaat) : 0,
  };
}

export function getDefaultProfileDraft(uid: string, email: string): SppgUserProfile {
  return {
    uid,
    email,
    reportTitle: 'REKAPAN MENU SMP',
    namaSppg: '',
    idSppg: '',
    alamat: '',
    kabKota: '',
    provinsi: '',
    namaSppi: '',
    nomorHp: '',
    logoSettings: normalizeLogoSettings(undefined),
  };
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: SppgUserProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalUserProfile(onData);
  }
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as SppgUserProfile);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveUserProfile(
  uid: string,
  email: string,
  input: Omit<SppgUserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalUserProfile(input);
  }
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  const normalizedLogo = normalizeLogoSettings(input.logoSettings);
  const logoSettings = {
    ...normalizedLogo,
    leftLogoDataUrl: (normalizedLogo.leftLogoDataUrl || '').slice(0, 200000),
    rightLogoDataUrl: (normalizedLogo.rightLogoDataUrl || '').slice(0, 200000),
  };

  const sanitized = {
    uid,
    email: clampString(email, 200),
    reportTitle: clampString(input.reportTitle || 'REKAPAN MENU SMP', 100),
    namaSppg: clampString(input.namaSppg, 150),
    idSppg: clampString(input.idSppg.toUpperCase(), 40),
    alamat: clampString(input.alamat, 300),
    kabKota: clampString(input.kabKota.toUpperCase(), 100),
    provinsi: clampString(input.provinsi.toUpperCase(), 100),
    namaSppi: clampString(input.namaSppi, 150),
    nomorHp: clampString(input.nomorHp, 30),
    logoSettings,
  };

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        email: sanitized.email,
        reportTitle: sanitized.reportTitle,
        namaSppg: sanitized.namaSppg,
        idSppg: sanitized.idSppg,
        alamat: sanitized.alamat,
        kabKota: sanitized.kabKota,
        provinsi: sanitized.provinsi,
        namaSppi: sanitized.namaSppi,
        nomorHp: sanitized.nomorHp,
        logoSettings: sanitized.logoSettings,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeMonthlyArchives(
  uid: string,
  onData: (archives: MonthlyArchive[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalMonthlyArchives(onData);
  }
  const path = `users/${uid}/months`;
  const q = query(
    collection(db, 'users', uid, 'months'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MonthlyArchive[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MonthlyArchive, 'id'>),
      }));
      list.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeMonthEntries(
  uid: string,
  monthKey: string,
  onData: (entries: DailyMenuEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalMonthEntries(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/entries`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'entries'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyMenuEntry[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DailyMenuEntry, 'id'>),
      }));
      list.sort((a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchMonthEntriesOnce(
  uid: string,
  monthKey: string
): Promise<DailyMenuEntry[]> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return fetchLocalMonthEntriesOnce(monthKey);
  }
  const path = `users/${uid}/months/${monthKey}/entries`;
  try {
    const q = query(
      collection(db, 'users', uid, 'months', monthKey, 'entries'),
      where('uid', '==', uid)
    );
    const snap = await getDocs(q);
    const list: DailyMenuEntry[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<DailyMenuEntry, 'id'>),
    }));
    list.sort((a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso));
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

async function syncMonthSummary(uid: string, monthKey: string): Promise<void> {
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const entriesRef = collection(db, 'users', uid, 'months', monthKey, 'entries');
  const entriesQuery = query(entriesRef, where('uid', '==', uid));
  const entriesSnap = await getDocs(entriesQuery);

  const entryCount = entriesSnap.size;
  let photoCount = 0;
  entriesSnap.forEach((docSnap) => {
    const data = docSnap.data() as Partial<DailyMenuEntry>;
    if (data.photoDataUrl && data.photoDataUrl.length > 0) {
      photoCount += 1;
    }
  });

  const monthSnap = await getDoc(monthRef);
  const { year, month } = parseMonthKey(monthKey);
  const periodeLabel = getPeriodeLabel(year, month, true);

  if (!monthSnap.exists()) {
    await setDoc(monthRef, {
      uid,
      monthKey,
      year,
      month,
      periodeLabel,
      entryCount,
      photoCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(monthRef, {
      periodeLabel,
      entryCount,
      photoCount,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function upsertDailyMenuEntry(
  uid: string,
  monthKey: string,
  input: {
    entryId?: string;
    dateIso: string;
    hariKe: number;
    namaMenu: string;
    photoDataUrl: string;
  }
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalDailyMenuEntry(monthKey, input);
  }
  const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entryId = input.entryId || `${input.dateIso}_${uniqueSuffix}`;
  const path = `users/${uid}/months/${monthKey}/entries/${entryId}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const entryRef = doc(db, 'users', uid, 'months', monthKey, 'entries', entryId);

  const safeHariKe = Math.max(1, Math.min(366, Math.round(input.hariKe)));
  const safeNamaMenu = clampString(input.namaMenu, 1000);
  const safePhoto = input.photoDataUrl.slice(0, 350000);
  const { year, month } = parseMonthKey(monthKey);
  const periodeLabel = getPeriodeLabel(year, month, true);

  try {
    const [monthSnap, entrySnap] = await Promise.all([getDoc(monthRef), getDoc(entryRef)]);

    if (!entrySnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel,
          entryCount: 1,
          photoCount: safePhoto.length > 0 ? 1 : 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(entryRef, {
        uid,
        monthKey,
        dateIso: input.dateIso,
        hariKe: safeHariKe,
        namaMenu: safeNamaMenu,
        photoDataUrl: safePhoto,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(entryRef, {
        dateIso: input.dateIso,
        hariKe: safeHariKe,
        namaMenu: safeNamaMenu,
        photoDataUrl: safePhoto,
        updatedAt: serverTimestamp(),
      });
    }

    await syncMonthSummary(uid, monthKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateEntryNutritionMap(
  uid: string,
  monthKey: string,
  entryId: string,
  nutritionByCategory: Partial<Record<TargetCategoryId, NutritionValues>>,
  updatedNamaMenu?: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return updateLocalEntryNutritionMap(monthKey, entryId, nutritionByCategory, updatedNamaMenu);
  }
  const path = `users/${uid}/months/${monthKey}/entries/${entryId}`;
  const entryRef = doc(db, 'users', uid, 'months', monthKey, 'entries', entryId);

  const sanitizedMap: Partial<Record<TargetCategoryId, NutritionValues>> = {};
  (Object.keys(nutritionByCategory) as TargetCategoryId[]).forEach((key) => {
    const val = nutritionByCategory[key];
    if (val) {
      sanitizedMap[key] = sanitizeNutritionValues(val);
    }
  });

  try {
    const payload: Record<string, unknown> = {
      nutritionByCategory: sanitizedMap,
      updatedAt: serverTimestamp(),
    };
    if (updatedNamaMenu !== undefined && updatedNamaMenu.trim().length > 0) {
      payload.namaMenu = clampString(updatedNamaMenu, 1000);
    }
    await updateDoc(entryRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveMonthNutritionConfig(
  uid: string,
  monthKey: string,
  selectedCategories: TargetCategoryId[],
  akgTargets?: AkgTargetsConfig
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalMonthNutritionConfig(monthKey, selectedCategories, akgTargets);
  }
  const path = `users/${uid}/months/${monthKey}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const { year, month } = parseMonthKey(monthKey);
  const periodeLabel = getPeriodeLabel(year, month, true);

  try {
    const snap = await getDoc(monthRef);
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
      : undefined;

    if (!snap.exists()) {
      await setDoc(monthRef, {
        uid,
        monthKey,
        year,
        month,
        periodeLabel,
        entryCount: 0,
        photoCount: 0,
        selectedCategories,
        ...(cleanAkg ? { akgTargets: cleanAkg } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(monthRef, {
        selectedCategories,
        ...(cleanAkg ? { akgTargets: cleanAkg } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDailyMenuEntry(
  uid: string,
  monthKey: string,
  entryId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalDailyMenuEntry(monthKey, entryId);
  }
  const path = `users/${uid}/months/${monthKey}/entries/${entryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'months', monthKey, 'entries', entryId));
    await syncMonthSummary(uid, monthKey);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function renumberMonthEntriesChronologically(
  uid: string,
  monthKey: string,
  entries: DailyMenuEntry[]
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return renumberLocalMonthEntriesChronologically(monthKey, entries);
  }
  const path = `users/${uid}/months/${monthKey}/entries`;
  try {
    const sorted = [...entries].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    const batch = writeBatch(db);
    let changed = 0;
    sorted.forEach((entry, index) => {
      const expected = index + 1;
      if (entry.hariKe !== expected) {
        changed += 1;
        const ref = doc(db, 'users', uid, 'months', monthKey, 'entries', entry.id);
        batch.update(ref, {
          hariKe: expected,
          updatedAt: serverTimestamp(),
        });
      }
    });
    if (changed > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export const DEFAULT_SAMPLE_COLUMN_LABELS: SampleColumnLabels = {
  kodeIdentitas: 'Kode Identitas Makanan',
  jumlahSampel: 'Jumlah Sampel',
  kondisiSampel: 'Kondisi Sampel',
  ok: 'OK',
  nok: 'NOK',
  penanggungJawab: 'Nama Penanggung Jawab',
  masukChiler: 'Masuk Chiler',
  keluarChiler: 'Keluar Chiler',
  tanggal: 'Tanggal',
  jam: 'Jam',
};

export function getDefaultSampleFormConfig(
  uid: string,
  monthKey: string,
  profile: SppgUserProfile
): SampleFormConfig {
  const { year, month } = parseMonthKey(monthKey);
  const monthName = INDONESIAN_MONTHS[month - 1] || 'November';
  return {
    uid,
    monthKey,
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    logoCaption: 'Badan Gizi Nasional',
    unitName: profile.namaSppg || 'SPPG',
    formLabel: 'FORM',
    formTitle: 'SAMPEL PERTINGGAL',
    docNumber: 'FR/PK/20',
    revision: '00',
    effectiveDate: `01 ${monthName} ${year}`,
    bulanLabel: monthName,
    tahunLabel: String(year),
    colLabels: { ...DEFAULT_SAMPLE_COLUMN_LABELS },
    verifierLine1: 'Diverifikasi Oleh,',
    verifierLine2: 'Pengawas Gizi',
    verifierName: profile.namaSppi || '',
  };
}

export function subscribeSampleFormConfig(
  uid: string,
  monthKey: string,
  onData: (config: SampleFormConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalSampleFormConfig(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/forms/sampel_pertinggal`;
  return onSnapshot(
    doc(db, 'users', uid, 'months', monthKey, 'forms', 'sampel_pertinggal'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as SampleFormConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveSampleFormConfig(
  uid: string,
  monthKey: string,
  input: Omit<SampleFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalSampleFormConfig(monthKey, input, DEFAULT_SAMPLE_COLUMN_LABELS);
  }
  const path = `users/${uid}/months/${monthKey}/forms/sampel_pertinggal`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const formRef = doc(db, 'users', uid, 'months', monthKey, 'forms', 'sampel_pertinggal');
  const { year, month } = parseMonthKey(monthKey);
  const periodeLabel = getPeriodeLabel(year, month, true);

  const labels = input.colLabels || DEFAULT_SAMPLE_COLUMN_LABELS;
  const sanitizedColLabels: SampleColumnLabels = {
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
  };

  const payloadData = {
    uid,
    monthKey,
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
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
    colLabels: sanitizedColLabels,
    verifierLine1: clampString(input.verifierLine1, 80),
    verifierLine2: clampString(input.verifierLine2, 80),
    verifierName: clampString(input.verifierName, 150),
  };

  try {
    const [monthSnap, formSnap] = await Promise.all([getDoc(monthRef), getDoc(formRef)]);

    if (!formSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(formRef, {
        ...payloadData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(formRef, {
        logoDataUrl: payloadData.logoDataUrl,
        logoWidthPx: payloadData.logoWidthPx,
        logoRightDataUrl: payloadData.logoRightDataUrl,
        logoRightWidthPx: payloadData.logoRightWidthPx,
        followGlobalLeftLogo: payloadData.followGlobalLeftLogo,
        followGlobalRightLogo: payloadData.followGlobalRightLogo,
        logoCaption: payloadData.logoCaption,
        unitName: payloadData.unitName,
        formLabel: payloadData.formLabel,
        formTitle: payloadData.formTitle,
        docNumber: payloadData.docNumber,
        revision: payloadData.revision,
        effectiveDate: payloadData.effectiveDate,
        bulanLabel: payloadData.bulanLabel,
        tahunLabel: payloadData.tahunLabel,
        colLabels: payloadData.colLabels,
        verifierLine1: payloadData.verifierLine1,
        verifierLine2: payloadData.verifierLine2,
        verifierName: payloadData.verifierName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeSampleRows(
  uid: string,
  monthKey: string,
  onData: (rows: SamplePertinggalRow[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalSampleRows(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/sampleRows`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'sampleRows'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SamplePertinggalRow[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SamplePertinggalRow, 'id'>),
      }));
      list.sort((a, b) => a.rowOrder - b.rowOrder);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertSampleRow(
  uid: string,
  monthKey: string,
  input: Omit<SamplePertinggalRow, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalSampleRow(monthKey, input);
  }
  const uniqueId =
    input.id || `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/months/${monthKey}/sampleRows/${uniqueId}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const rowRef = doc(db, 'users', uid, 'months', monthKey, 'sampleRows', uniqueId);
  const { year, month } = parseMonthKey(monthKey);
  const periodeLabel = getPeriodeLabel(year, month, true);

  const clean = {
    uid,
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

  try {
    const [monthSnap, rowSnap] = await Promise.all([getDoc(monthRef), getDoc(rowRef)]);

    if (!rowSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(rowRef, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(rowRef, {
        rowOrder: clean.rowOrder,
        kodeIdentitas: clean.kodeIdentitas,
        jumlahSampel: clean.jumlahSampel,
        kondisiOk: clean.kondisiOk,
        kondisiNok: clean.kondisiNok,
        penanggungJawab: clean.penanggungJawab,
        masukTanggal: clean.masukTanggal,
        masukJam: clean.masukJam,
        keluarTanggal: clean.keluarTanggal,
        keluarJam: clean.keluarJam,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSampleRow(
  uid: string,
  monthKey: string,
  rowId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalSampleRow(monthKey, rowId);
  }
  const path = `users/${uid}/months/${monthKey}/sampleRows/${rowId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'months', monthKey, 'sampleRows', rowId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Monitoring Suhu & Kelembapan Ruangan (FR/PK/23) ---

export const DEFAULT_TEMP_TABLE_LABELS: TempTableLabels = {
  kegiatan: 'Kegiatan',
  tanggal: 'TANGGAL',
  jam: 'Jam',
  suhu: 'Suhu (°C)',
  rh: 'RH (%)',
  paraf: 'PARAF PETUGAS',
  namaPetugas: 'NAMA PETUGAS',
};

export function getDefaultTempFormConfig(
  uid: string,
  monthKey: string,
  profile: SppgUserProfile
): TempFormConfig {
  const { year, month } = parseMonthKey(monthKey);
  const monthName = INDONESIAN_MONTHS[month - 1] || 'November';
  return {
    uid,
    monthKey,
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    logoCaption: 'Badan Gizi Nasional',
    unitName: profile.namaSppg || 'SPPG',
    formLabel: 'FORM',
    formTitle: 'MONITORING SUHU & KELEMBAPAN RUANGAN',
    docNumber: 'FR/PK/23',
    revision: '00',
    effectiveDate: `01 Desember ${year}`,
    periodeLabel: monthName,
    tableLabels: { ...DEFAULT_TEMP_TABLE_LABELS },
    sopTitle: 'STANDAR SUHU & KELEMBAPAN RUANGAN BERDASARKAN SOP BGN PUSAT',
    sopSubtitle:
      'Acuan baku pengendalian suhu dan kelembapan relatif (RH) area penyimpanan, persiapan, produksi, dan pemorsian SPPG Badan Gizi Nasional.',
  };
}

export function subscribeTempFormConfig(
  uid: string,
  monthKey: string,
  onData: (config: TempFormConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalTempFormConfig(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/tempForms/monitoring_suhu`;
  return onSnapshot(
    doc(db, 'users', uid, 'months', monthKey, 'tempForms', 'monitoring_suhu'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as TempFormConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveTempFormConfig(
  uid: string,
  monthKey: string,
  input: Omit<TempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalTempFormConfig(monthKey, input, DEFAULT_TEMP_TABLE_LABELS);
  }
  const path = `users/${uid}/months/${monthKey}/tempForms/monitoring_suhu`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const formRef = doc(db, 'users', uid, 'months', monthKey, 'tempForms', 'monitoring_suhu');
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const labels = input.tableLabels || DEFAULT_TEMP_TABLE_LABELS;
  const sanitizedTableLabels: TempTableLabels = {
    kegiatan: clampString(labels.kegiatan || 'Kegiatan', 40),
    tanggal: clampString(labels.tanggal || 'TANGGAL', 40),
    jam: clampString(labels.jam || 'Jam', 30),
    suhu: clampString(labels.suhu || 'Suhu (°C)', 40),
    rh: clampString(labels.rh || 'RH (%)', 40),
    paraf: clampString(labels.paraf || 'PARAF PETUGAS', 40),
    namaPetugas: clampString(labels.namaPetugas || 'NAMA PETUGAS', 40),
  };

  const payloadData = {
    uid,
    monthKey,
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
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
    tableLabels: sanitizedTableLabels,
    sopTitle: clampString(input.sopTitle, 150),
    sopSubtitle: clampString(input.sopSubtitle, 300),
  };

  try {
    const [monthSnap, formSnap] = await Promise.all([getDoc(monthRef), getDoc(formRef)]);
    if (!formSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(formRef, {
        ...payloadData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(formRef, {
        logoDataUrl: payloadData.logoDataUrl,
        logoWidthPx: payloadData.logoWidthPx,
        logoRightDataUrl: payloadData.logoRightDataUrl,
        logoRightWidthPx: payloadData.logoRightWidthPx,
        followGlobalLeftLogo: payloadData.followGlobalLeftLogo,
        followGlobalRightLogo: payloadData.followGlobalRightLogo,
        logoCaption: payloadData.logoCaption,
        unitName: payloadData.unitName,
        formLabel: payloadData.formLabel,
        formTitle: payloadData.formTitle,
        docNumber: payloadData.docNumber,
        revision: payloadData.revision,
        effectiveDate: payloadData.effectiveDate,
        periodeLabel: payloadData.periodeLabel,
        tableLabels: payloadData.tableLabels,
        sopTitle: payloadData.sopTitle,
        sopSubtitle: payloadData.sopSubtitle,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeTempRooms(
  uid: string,
  monthKey: string,
  onData: (rooms: TempMonitoringRoom[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalTempRooms(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/tempRooms`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'tempRooms'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: TempMonitoringRoom[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TempMonitoringRoom, 'id'>),
      }));
      list.sort((a, b) => a.roomOrder - b.roomOrder);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createTempRoom(
  uid: string,
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
  if (uid === LOCAL_WORKSPACE_UID) {
    return createLocalTempRoom(monthKey, input);
  }
  const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/months/${monthKey}/tempRooms/${roomId}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const roomRef = doc(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const matched = matchPresetByRoomName(input.roomName);

  try {
    const monthSnap = await getDoc(monthRef);
    const batch = writeBatch(db);
    if (!monthSnap.exists()) {
      batch.set(monthRef, {
        uid,
        monthKey,
        year,
        month,
        periodeLabel: monthPeriodeLabel,
        entryCount: 0,
        photoCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(roomRef, {
      uid,
      monthKey,
      roomOrder: Math.max(1, Math.min(200, Math.round(input.roomOrder))),
      roomName: clampString(input.roomName, 120) || 'Gudang Basah',
      presetKey: clampString(input.presetKey || matched.presetKey, 60),
      standardSuhu: clampString(input.standardSuhu || matched.standardSuhu, 120),
      standardRh: clampString(input.standardRh || matched.standardRh, 80),
      sopNote: clampString(input.sopNote || matched.sopNote, 300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return roomId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function seedAllPresetTempRooms(
  uid: string,
  monthKey: string,
  existingRooms: TempMonitoringRoom[]
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return seedAllLocalPresetTempRooms(monthKey, existingRooms);
  }
  const path = `users/${uid}/months/${monthKey}/tempRooms`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);
  const existingNames = new Set(existingRooms.map((r) => r.roomName.trim().toLowerCase()));
  let nextOrder = existingRooms.reduce((m, r) => Math.max(m, r.roomOrder), 0);

  try {
    const monthSnap = await getDoc(monthRef);
    const batch = writeBatch(db);
    if (!monthSnap.exists()) {
      batch.set(monthRef, {
        uid,
        monthKey,
        year,
        month,
        periodeLabel: monthPeriodeLabel,
        entryCount: 0,
        photoCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    let added = 0;
    SOP_BGN_ROOM_PRESETS.forEach((preset, idx) => {
      if (existingNames.has(preset.label.toLowerCase())) return;
      nextOrder += 1;
      added += 1;
      const roomId = `room_${preset.presetKey}_${Date.now().toString(36)}_${idx}`;
      const roomRef = doc(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId);
      batch.set(roomRef, {
        uid,
        monthKey,
        roomOrder: Math.min(200, nextOrder),
        roomName: preset.label,
        presetKey: preset.presetKey,
        standardSuhu: preset.standardSuhu,
        standardRh: preset.standardRh,
        sopNote: preset.sopNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    if (added > 0 || !monthSnap.exists()) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateTempRoom(
  uid: string,
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
  if (uid === LOCAL_WORKSPACE_UID) {
    return updateLocalTempRoom(monthKey, roomId, input);
  }
  const path = `users/${uid}/months/${monthKey}/tempRooms/${roomId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId), {
      roomOrder: Math.max(1, Math.min(200, Math.round(input.roomOrder))),
      roomName: clampString(input.roomName, 120) || 'Ruangan',
      presetKey: clampString(input.presetKey, 60),
      standardSuhu: clampString(input.standardSuhu, 120),
      standardRh: clampString(input.standardRh, 80),
      sopNote: clampString(input.sopNote, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTempRoom(
  uid: string,
  monthKey: string,
  roomId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalTempRoom(monthKey, roomId);
  }
  const path = `users/${uid}/months/${monthKey}/tempRooms/${roomId}`;
  try {
    // Delete daily readings subcollection documents first
    const daysRef = collection(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId, 'days');
    const daysSnap = await getDocs(query(daysRef, where('uid', '==', uid)));
    const batch = writeBatch(db);
    daysSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeRoomDayReadings(
  uid: string,
  monthKey: string,
  roomId: string,
  onData: (readings: TempDayReading[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalRoomDayReadings(monthKey, roomId, onData);
  }
  const path = `users/${uid}/months/${monthKey}/tempRooms/${roomId}/days`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId, 'days'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: TempDayReading[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TempDayReading, 'id'>),
      }));
      list.sort((a, b) => a.day - b.day);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchRoomDayReadingsOnce(
  uid: string,
  monthKey: string,
  roomId: string
): Promise<TempDayReading[]> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return fetchLocalRoomDayReadingsOnce(monthKey, roomId);
  }
  const path = `users/${uid}/months/${monthKey}/tempRooms/${roomId}/days`;
  try {
    const q = query(
      collection(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId, 'days'),
      where('uid', '==', uid)
    );
    const snap = await getDocs(q);
    const list: TempDayReading[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TempDayReading, 'id'>),
    }));
    list.sort((a, b) => a.day - b.day);
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function upsertTempDayReading(
  uid: string,
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
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalTempDayReading(monthKey, roomId, input);
  }
  const safeDay = Math.max(1, Math.min(31, Math.round(input.day)));
  const dayId = String(safeDay);
  const path = `users/${uid}/months/${monthKey}/tempRooms/${roomId}/days/${dayId}`;
  const dayRef = doc(db, 'users', uid, 'months', monthKey, 'tempRooms', roomId, 'days', dayId);

  const payload = {
    uid,
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

  try {
    const snap = await getDoc(dayRef);
    if (!snap.exists()) {
      await setDoc(dayRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(dayRef, {
        jam: payload.jam,
        suhu: payload.suhu,
        rh: payload.rh,
        paraf: payload.paraf,
        namaPetugas: payload.namaPetugas,
        photoDataUrl: payload.photoDataUrl,
        detectedNote: payload.detectedNote,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Pencatatan Suhu Freezer & Chiller (FR/JM/06) ---

export const DEFAULT_FREEZER_COL_LABELS: FreezerColumnLabels = {
  namaMesin: 'Nama Mesin',
  merk: 'Merk',
  noMesin: 'No. Mesin',
  lokasi: 'Lokasi',
  periode: 'Periode',
  no: 'No',
  tanggal: 'Tanggal',
  jamCek1: 'Jam Cek\n(I)',
  suhu1: 'Suhu',
  pic1: 'PIC',
  jamCek2: 'Jam Cek\n(II)',
  suhu2: 'Suhu',
  pic2: 'PIC',
  jamCek3: 'Jam Cek\n(III)',
  suhu3: 'Suhu',
  pic3: 'PIC',
  keterangan: 'Keterangan',
};

export function getDefaultFreezerFormConfig(
  uid: string,
  monthKey: string,
  profile: SppgUserProfile
): FreezerFormConfig {
  const { year, month } = parseMonthKey(monthKey);
  const monthName = INDONESIAN_MONTHS[month - 1] || 'November';
  return {
    uid,
    monthKey,
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    logoCaption: 'Badan Gizi Nasional',
    unitName: profile.namaSppg || 'SPPG',
    formLabel: 'FORM',
    formTitle: 'PENCATATAN SUHU FREEZER & CHILLER',
    docNumber: 'FR/JM/06',
    revision: '00',
    effectiveDate: `01 November ${year}`,
    periodeLabel: `${monthName} ${year}`,
    colLabels: { ...DEFAULT_FREEZER_COL_LABELS },
  };
}

export function subscribeFreezerFormConfig(
  uid: string,
  monthKey: string,
  onData: (config: FreezerFormConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalFreezerFormConfig(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/freezerForms/freezer_chiller`;
  return onSnapshot(
    doc(db, 'users', uid, 'months', monthKey, 'freezerForms', 'freezer_chiller'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as FreezerFormConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveFreezerFormConfig(
  uid: string,
  monthKey: string,
  input: Omit<FreezerFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalFreezerFormConfig(monthKey, input, DEFAULT_FREEZER_COL_LABELS);
  }
  const path = `users/${uid}/months/${monthKey}/freezerForms/freezer_chiller`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const formRef = doc(db, 'users', uid, 'months', monthKey, 'freezerForms', 'freezer_chiller');
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const l = input.colLabels || DEFAULT_FREEZER_COL_LABELS;
  const sanitizedColLabels: FreezerColumnLabels = {
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
  };

  const payloadData = {
    uid,
    monthKey,
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
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
    colLabels: sanitizedColLabels,
  };

  try {
    const [monthSnap, formSnap] = await Promise.all([getDoc(monthRef), getDoc(formRef)]);
    if (!formSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(formRef, {
        ...payloadData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(formRef, {
        logoDataUrl: payloadData.logoDataUrl,
        logoWidthPx: payloadData.logoWidthPx,
        logoRightDataUrl: payloadData.logoRightDataUrl,
        logoRightWidthPx: payloadData.logoRightWidthPx,
        followGlobalLeftLogo: payloadData.followGlobalLeftLogo,
        followGlobalRightLogo: payloadData.followGlobalRightLogo,
        logoCaption: payloadData.logoCaption,
        unitName: payloadData.unitName,
        formLabel: payloadData.formLabel,
        formTitle: payloadData.formTitle,
        docNumber: payloadData.docNumber,
        revision: payloadData.revision,
        effectiveDate: payloadData.effectiveDate,
        periodeLabel: payloadData.periodeLabel,
        colLabels: payloadData.colLabels,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeFreezerMachines(
  uid: string,
  monthKey: string,
  onData: (machines: FreezerMachine[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalFreezerMachines(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/freezerMachines`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'freezerMachines'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FreezerMachine[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FreezerMachine, 'id'>),
      }));
      list.sort((a, b) => a.machineOrder - b.machineOrder);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createFreezerMachine(
  uid: string,
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
  if (uid === LOCAL_WORKSPACE_UID) {
    return createLocalFreezerMachine(monthKey, input);
  }
  const machineId = `unit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const machineRef = doc(db, 'users', uid, 'months', monthKey, 'freezerMachines', machineId);
  const firstRowRef = doc(
    db,
    'users',
    uid,
    'months',
    monthKey,
    'freezerMachines',
    machineId,
    'rows',
    'row_1'
  );
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const bgnDefault = BGN_FREEZER_CHILLER_DEFAULTS[input.machineType];

  try {
    const monthSnap = await getDoc(monthRef);
    const batch = writeBatch(db);
    if (!monthSnap.exists()) {
      batch.set(monthRef, {
        uid,
        monthKey,
        year,
        month,
        periodeLabel: monthPeriodeLabel,
        entryCount: 0,
        photoCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(machineRef, {
      uid,
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(firstRowRef, {
      uid,
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return machineId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateFreezerMachine(
  uid: string,
  monthKey: string,
  machineId: string,
  input: Omit<FreezerMachine, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return updateLocalFreezerMachine(monthKey, machineId, input);
  }
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'months', monthKey, 'freezerMachines', machineId), {
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
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFreezerMachine(
  uid: string,
  monthKey: string,
  machineId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalFreezerMachine(monthKey, machineId);
  }
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}`;
  try {
    const rowsRef = collection(
      db,
      'users',
      uid,
      'months',
      monthKey,
      'freezerMachines',
      machineId,
      'rows'
    );
    const rowsSnap = await getDocs(query(rowsRef, where('uid', '==', uid)));
    const batch = writeBatch(db);
    rowsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid, 'months', monthKey, 'freezerMachines', machineId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeFreezerLogRows(
  uid: string,
  monthKey: string,
  machineId: string,
  onData: (rows: FreezerLogRow[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalFreezerLogRows(monthKey, machineId, onData);
  }
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}/rows`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'freezerMachines', machineId, 'rows'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FreezerLogRow[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FreezerLogRow, 'id'>),
      }));
      list.sort((a, b) => a.rowOrder - b.rowOrder);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchFreezerLogRowsOnce(
  uid: string,
  monthKey: string,
  machineId: string
): Promise<FreezerLogRow[]> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return fetchLocalFreezerLogRowsOnce(monthKey, machineId);
  }
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}/rows`;
  try {
    const q = query(
      collection(db, 'users', uid, 'months', monthKey, 'freezerMachines', machineId, 'rows'),
      where('uid', '==', uid)
    );
    const snap = await getDocs(q);
    const list: FreezerLogRow[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FreezerLogRow, 'id'>),
    }));
    list.sort((a, b) => a.rowOrder - b.rowOrder);
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function upsertFreezerLogRow(
  uid: string,
  monthKey: string,
  machineId: string,
  input: Omit<
    FreezerLogRow,
    'id' | 'uid' | 'monthKey' | 'machineId' | 'createdAt' | 'updatedAt'
  > & { id?: string }
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalFreezerLogRow(monthKey, machineId, input);
  }
  const rowId =
    input.id || `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}/rows/${rowId}`;
  const rowRef = doc(
    db,
    'users',
    uid,
    'months',
    monthKey,
    'freezerMachines',
    machineId,
    'rows',
    rowId
  );

  const clean = {
    uid,
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

  try {
    const snap = await getDoc(rowRef);
    if (!snap.exists()) {
      await setDoc(rowRef, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(rowRef, {
        rowOrder: clean.rowOrder,
        noLabel: clean.noLabel,
        tanggal: clean.tanggal,
        jamCek1: clean.jamCek1,
        suhu1: clean.suhu1,
        pic1: clean.pic1,
        jamCek2: clean.jamCek2,
        suhu2: clean.suhu2,
        pic2: clean.pic2,
        jamCek3: clean.jamCek3,
        suhu3: clean.suhu3,
        pic3: clean.pic3,
        keterangan: clean.keterangan,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFreezerLogRow(
  uid: string,
  monthKey: string,
  machineId: string,
  rowId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalFreezerLogRow(monthKey, machineId, rowId);
  }
  const path = `users/${uid}/months/${monthKey}/freezerMachines/${machineId}/rows/${rowId}`;
  try {
    await deleteDoc(
      doc(db, 'users', uid, 'months', monthKey, 'freezerMachines', machineId, 'rows', rowId)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Laporan Suhu Makanan Masak & Masuk Ompreng ---

export const DEFAULT_FOOD_TEMP_COL_LABELS: FoodTempColumnLabels = {
  tanggal: 'Tanggal',
  namaMakanan: 'Nama Makanan',
  suhuMakanan: 'Suhu Makanan (°C)',
  paraf: 'Paraf',
};

function sanitizeFoodItemsForService(items: FoodTempItemRow[]): FoodTempItemRow[] {
  const normalized = (items || []).slice(0, 20).map((item) => ({
    namaMakanan: clampString(item.namaMakanan || '', 150),
    suhu: clampString(item.suhu || '', 30),
  }));
  while (normalized.length === 0) {
    normalized.push({ namaMakanan: '', suhu: '' });
  }
  return normalized;
}

export function getDefaultFoodTempFormConfig(
  uid: string,
  monthKey: string,
  profile: SppgUserProfile
): FoodTempFormConfig {
  const { year, month } = parseMonthKey(monthKey);
  const monthName = INDONESIAN_MONTHS[month - 1] || 'November';
  const defaultKabLine = profile.kabKota
    ? `KECAMATAN SAWERIGADI KAB. ${profile.kabKota.toUpperCase()}`
    : 'KECAMATAN SAWERIGADI KAB. MUNA BARAT';

  return {
    uid,
    monthKey,
    logoLeftDataUrl: '',
    logoLeftWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    headerLine1: 'BADAN GIZI NASIONAL',
    headerLine2: 'SATUAN PELAYANAN PEMENUHAN GIZI',
    headerLine3: defaultKabLine,
    headerLine4: profile.alamat
      ? `Alamat: ${profile.alamat}`
      : 'Alamat: Jln. Poros Lagadi-Todasi, Desa Ondoke, Kecamatan Sawerigadi, Kab. Muna Barat',
    titleMasak: 'LAPORAN SUHU MAKANAN MASAK',
    titleOmpreng: 'LAPORAN SUHU MAKANAN MASUK OMPRENG',
    bulanLabel: `${monthName} ${year}`,
    colLabels: { ...DEFAULT_FOOD_TEMP_COL_LABELS },
    signerLine1: 'Pengawas Gizi',
    signerLine2: profile.namaSppg
      ? profile.namaSppg
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .replace(/^Sppg\b/i, 'SPPG')
      : 'SPPG Muna Barat Sawerigadi Ondoke',
    signerName: profile.namaSppi || '',
  };
}

export function subscribeFoodTempFormConfig(
  uid: string,
  monthKey: string,
  onData: (config: FoodTempFormConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalFoodTempFormConfig(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/foodTempForms/suhu_makanan`;
  return onSnapshot(
    doc(db, 'users', uid, 'months', monthKey, 'foodTempForms', 'suhu_makanan'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as FoodTempFormConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveFoodTempFormConfig(
  uid: string,
  monthKey: string,
  input: Omit<FoodTempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalFoodTempFormConfig(monthKey, input, DEFAULT_FOOD_TEMP_COL_LABELS);
  }
  const path = `users/${uid}/months/${monthKey}/foodTempForms/suhu_makanan`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const formRef = doc(db, 'users', uid, 'months', monthKey, 'foodTempForms', 'suhu_makanan');
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const l = input.colLabels || DEFAULT_FOOD_TEMP_COL_LABELS;
  const sanitizedColLabels: FoodTempColumnLabels = {
    tanggal: clampString(l.tanggal || 'Tanggal', 40),
    namaMakanan: clampString(l.namaMakanan || 'Nama Makanan', 60),
    suhuMakanan: clampString(l.suhuMakanan || 'Suhu Makanan (°C)', 60),
    paraf: clampString(l.paraf || 'Paraf', 40),
  };

  const payloadData = {
    uid,
    monthKey,
    logoLeftDataUrl: (input.logoLeftDataUrl || '').slice(0, 200000),
    logoLeftWidthPx: sanitizeLogoWidthPx(input.logoLeftWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    headerLine1: clampString(input.headerLine1, 120),
    headerLine2: clampString(input.headerLine2, 150),
    headerLine3: clampString(input.headerLine3, 150),
    headerLine4: clampString(input.headerLine4, 250),
    titleMasak: clampString(input.titleMasak, 120),
    titleOmpreng: clampString(input.titleOmpreng, 120),
    bulanLabel: clampString(input.bulanLabel, 60),
    colLabels: sanitizedColLabels,
    signerLine1: clampString(input.signerLine1, 100),
    signerLine2: clampString(input.signerLine2, 150),
    signerName: clampString(input.signerName, 150),
  };

  try {
    const [monthSnap, formSnap] = await Promise.all([getDoc(monthRef), getDoc(formRef)]);
    if (!formSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(formRef, {
        ...payloadData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(formRef, {
        ...payloadData,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeFoodTempDayBlocks(
  uid: string,
  monthKey: string,
  onData: (blocks: FoodTempDayBlock[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalFoodTempDayBlocks(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/foodTempBlocks`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'foodTempBlocks'),
    where('uid', '==', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FoodTempDayBlock[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FoodTempDayBlock, 'id'>),
      }));
      list.sort(
        (a, b) => a.sheetType.localeCompare(b.sheetType) || a.blockOrder - b.blockOrder
      );
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchFoodTempDayBlocksOnce(
  uid: string,
  monthKey: string
): Promise<FoodTempDayBlock[]> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return fetchLocalFoodTempDayBlocksOnce(monthKey);
  }
  const path = `users/${uid}/months/${monthKey}/foodTempBlocks`;
  try {
    const q = query(
      collection(db, 'users', uid, 'months', monthKey, 'foodTempBlocks'),
      where('uid', '==', uid)
    );
    const snap = await getDocs(q);
    const list: FoodTempDayBlock[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FoodTempDayBlock, 'id'>),
    }));
    list.sort(
      (a, b) => a.sheetType.localeCompare(b.sheetType) || a.blockOrder - b.blockOrder
    );
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function upsertFoodTempDayBlock(
  uid: string,
  monthKey: string,
  input: Omit<FoodTempDayBlock, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & {
    id?: string;
  }
): Promise<string> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalFoodTempDayBlock(monthKey, input);
  }
  const blockId =
    input.id ||
    `ftb_${input.sheetType}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/months/${monthKey}/foodTempBlocks/${blockId}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const blockRef = doc(db, 'users', uid, 'months', monthKey, 'foodTempBlocks', blockId);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const clean = {
    uid,
    monthKey,
    sheetType: input.sheetType,
    blockOrder: Math.max(1, Math.min(200, Math.round(input.blockOrder))),
    tanggal: clampString(input.tanggal, 60),
    paraf: clampString(input.paraf, 60),
    items: sanitizeFoodItemsForService(input.items),
  };

  try {
    const [monthSnap, blockSnap] = await Promise.all([getDoc(monthRef), getDoc(blockRef)]);
    if (!blockSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(blockRef, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(blockRef, {
        blockOrder: clean.blockOrder,
        tanggal: clean.tanggal,
        paraf: clean.paraf,
        items: clean.items,
        updatedAt: serverTimestamp(),
      });
    }
    return blockId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFoodTempDayBlock(
  uid: string,
  monthKey: string,
  blockId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalFoodTempDayBlock(monthKey, blockId);
  }
  const path = `users/${uid}/months/${monthKey}/foodTempBlocks/${blockId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'months', monthKey, 'foodTempBlocks', blockId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function seedDefaultFoodTempBlocks(
  uid: string,
  monthKey: string,
  sheetType: FoodTempSheetType,
  count = 5
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return seedDefaultLocalFoodTempBlocks(monthKey, sheetType, count);
  }
  const path = `users/${uid}/months/${monthKey}/foodTempBlocks`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  try {
    const [monthSnap, existingBlocks] = await Promise.all([
      getDoc(monthRef),
      fetchFoodTempDayBlocksOnce(uid, monthKey),
    ]);
    if (existingBlocks.some((b) => b.sheetType === sheetType)) return;

    const batch = writeBatch(db);
    if (!monthSnap.exists()) {
      batch.set(monthRef, {
        uid,
        monthKey,
        year,
        month,
        periodeLabel: monthPeriodeLabel,
        entryCount: 0,
        photoCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    for (let i = 1; i <= count; i++) {
      const blockId = `ftb_${sheetType}_init_${i}`;
      const blockRef = doc(db, 'users', uid, 'months', monthKey, 'foodTempBlocks', blockId);
      batch.set(blockRef, {
        uid,
        monthKey,
        sheetType,
        blockOrder: i,
        tanggal: '',
        paraf: '',
        items: Array.from({ length: 5 }, () => ({ namaMakanan: '', suhu: '' })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- TKPI 2020 & Spreadsheet Sync ---

export function subscribeTkpiSyncConfig(
  uid: string,
  onData: (config: TkpiSyncConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalTkpiSyncConfig(onData);
  }
  const path = `users/${uid}/settings/tkpi`;
  return onSnapshot(
    doc(db, 'users', uid, 'settings', 'tkpi'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as TkpiSyncConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveTkpiSyncConfig(
  uid: string,
  input: Omit<TkpiSyncConfig, 'uid' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return saveLocalTkpiSyncConfig(input);
  }
  const path = `users/${uid}/settings/tkpi`;
  const ref = doc(db, 'users', uid, 'settings', 'tkpi');
  const payload = {
    uid,
    spreadsheetUrl: clampString(input.spreadsheetUrl || '', 500),
    lastSyncedAt: clampString(input.lastSyncedAt || '', 60),
    syncedItems: Array.isArray(input.syncedItems) ? input.syncedItems.slice(0, 1500) : [],
    customItems: Array.isArray(input.customItems) ? input.customItems.slice(0, 500) : [],
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Update PM (Data Spesifik & Data Penerima Manfaat) ---

export function getDefaultDailyPmRecord(
  uid: string,
  monthKey: string,
  dateIso: string,
  hariKe: number,
  profile: SppgUserProfile
): DailyPmRecord {
  return {
    id: dateIso,
    uid,
    monthKey,
    dateIso,
    hariKe,
    headerLine1: 'BADAN GIZI NASIONAL',
    headerLine2: 'SATUAN PELAYANAN PEMENUHAN GIZI',
    headerLine3: profile.namaSppg || 'SPPG',
    headerAlamat: profile.alamat ? `Alamat : ${profile.alamat}` : 'Alamat : -',
    titleSpecific: 'UPDATE DATA SPESIFIK',
    titleSummary: 'UPDATE DATA PENERIMA MANFAAT',
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    specificRows: [],
    summaryOverrides: {},
  };
}

export function subscribeMonthPmRecords(
  uid: string,
  monthKey: string,
  onData: (records: DailyPmRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalMonthPmRecords(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/pmDays`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'pmDays'),
    where('uid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: DailyPmRecord[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DailyPmRecord, 'id'>),
      }));
      list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertDailyPmRecord(
  uid: string,
  monthKey: string,
  input: Omit<DailyPmRecord, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalDailyPmRecord(monthKey, input);
  }
  const path = `users/${uid}/months/${monthKey}/pmDays/${input.dateIso}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const ref = doc(db, 'users', uid, 'months', monthKey, 'pmDays', input.dateIso);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const clean = {
    uid,
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
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    specificRows: (input.specificRows || []).slice(0, 200),
    summaryOverrides: input.summaryOverrides || {},
  };

  try {
    const [monthSnap, docSnap] = await Promise.all([getDoc(monthRef), getDoc(ref)]);
    if (!docSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(ref, {
        ...clean,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDailyPmRecord(
  uid: string,
  monthKey: string,
  dateIso: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalDailyPmRecord(monthKey, dateIso);
  }
  const path = `users/${uid}/months/${monthKey}/pmDays/${dateIso}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'months', monthKey, 'pmDays', dateIso));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Nilai Gizi & Food Cost ---

export function getDefaultFoodCostDayPlan(
  uid: string,
  monthKey: string,
  dateIso: string,
  hariKe: number,
  profile: SppgUserProfile
): FoodCostDayPlan {
  return {
    id: dateIso,
    uid,
    monthKey,
    dateIso,
    hariKe,
    headerLine1: 'BADAN GIZI NASIONAL',
    headerLine2: 'SATUAN PELAYANAN PEMENUHAN GIZI',
    headerLine3: profile.namaSppg || 'SPPG',
    headerAlamat: profile.alamat ? `Alamat : ${profile.alamat}` : 'Alamat : -',
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    worksheets: [
      {
        id: `ws_${Date.now().toString(36)}_1`,
        title: 'NILAI GIZI DAN FOOD COST PORSI KECIL TK/PAUD',
        sideLabel: 'TK / PAUD',
        categoryIds: ['tk_paud_lb'],
        portionScope: 'kecil',
        isAllergySheet: false,
        bumbuPercent: 10,
        rows: [],
      },
    ],
  };
}

export function subscribeMonthFoodCostPlans(
  uid: string,
  monthKey: string,
  onData: (plans: FoodCostDayPlan[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalMonthFoodCostPlans(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/foodCostDays`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'foodCostDays'),
    where('uid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: FoodCostDayPlan[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FoodCostDayPlan, 'id'>),
      }));
      list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertFoodCostDayPlan(
  uid: string,
  monthKey: string,
  input: Omit<FoodCostDayPlan, 'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalFoodCostDayPlan(monthKey, input);
  }
  const path = `users/${uid}/months/${monthKey}/foodCostDays/${input.dateIso}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const ref = doc(db, 'users', uid, 'months', monthKey, 'foodCostDays', input.dateIso);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const clean = {
    uid,
    monthKey,
    dateIso: input.dateIso,
    hariKe: Math.max(1, Math.min(366, Math.round(input.hariKe || 1))),
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    worksheets: (input.worksheets || []).slice(0, 30),
  };

  try {
    const [monthSnap, docSnap] = await Promise.all([getDoc(monthRef), getDoc(ref)]);
    if (!docSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(ref, {
        ...clean,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFoodCostDayPlan(
  uid: string,
  monthKey: string,
  dateIso: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalFoodCostDayPlan(monthKey, dateIso);
  }
  const path = `users/${uid}/months/${monthKey}/foodCostDays/${dateIso}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'months', monthKey, 'foodCostDays', dateIso));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Rekap Bahan Baku & Nota Pesanan (PO) ---

export function getDefaultRawMaterialRecapDayConfig(
  uid: string,
  monthKey: string,
  dateIso: string,
  hariKe: number,
  profile: SppgUserProfile
): RawMaterialRecapDayConfig {
  return {
    id: dateIso,
    uid,
    monthKey,
    dateIso,
    hariKe,
    headerLine1: 'BADAN GIZI NASIONAL',
    headerLine2: 'SATUAN PELAYANAN PEMENUHAN GIZI',
    headerLine3: profile.namaSppg || 'SPPG',
    headerAlamat: profile.alamat ? `Alamat : ${profile.alamat}` : 'Alamat : -',
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    recapTitle: 'REKAPAN TOTAL KEBUTUHAN BAHAN BAKU KESELURUHAN',
    sideLabel: 'REKAPAN / PO',
    bufferPercent: 2.5,
    bumbuPercent: 10,
    rabPorsiKecilRate: 7000,
    rabPorsiBesarRate: 10000,
    poJudul: `NOTA PESANAN HARI ${hariKe}`,
    poDari: profile.namaSppg || 'SPPG',
    poKepada: '',
    poAlamat: '',
    poSignerLabel1: 'Mengetahui,',
    poSignerLabel2: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    poSignerName: '',
    itemOverrides: {},
  };
}

export function subscribeMonthPoRecaps(
  uid: string,
  monthKey: string,
  onData: (recaps: RawMaterialRecapDayConfig[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalMonthPoRecaps(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/poDays`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'poDays'),
    where('uid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: RawMaterialRecapDayConfig[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RawMaterialRecapDayConfig, 'id'>),
      }));
      list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertRawMaterialRecapDayConfig(
  uid: string,
  monthKey: string,
  input: Omit<
    RawMaterialRecapDayConfig,
    'id' | 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'
  >
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalRawMaterialRecapDayConfig(monthKey, input);
  }
  const path = `users/${uid}/months/${monthKey}/poDays/${input.dateIso}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const ref = doc(db, 'users', uid, 'months', monthKey, 'poDays', input.dateIso);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const clean = {
    uid,
    monthKey,
    dateIso: input.dateIso,
    hariKe: Math.max(1, Math.min(366, Math.round(input.hariKe || 1))),
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
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

  try {
    const [monthSnap, docSnap] = await Promise.all([getDoc(monthRef), getDoc(ref)]);
    if (!docSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(ref, {
        ...clean,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Master Menu (1-4 Minggu / Bulanan) ---

export function getDefaultMasterMenuPlan(
  uid: string,
  monthKey: string,
  profile: SppgUserProfile,
  categoryIds: TargetCategoryId[] = ['sd_1_3'],
  cycleMode: MasterMenuPlan['cycleMode'] = '4_minggu'
): MasterMenuPlan {
  return {
    id: `mm_draft_${monthKey}`,
    uid,
    monthKey,
    title: formatMasterMenuDefaultTitle(categoryIds, cycleMode, monthKey),
    categoryIds,
    cycleMode,
    headerLine1: 'BADAN GIZI NASIONAL',
    headerLine2: 'SATUAN PELAYANAN PEMENUHAN GIZI',
    headerLine3: profile.namaSppg || 'SPPG',
    headerAlamat: profile.alamat ? `Alamat : ${profile.alamat}` : 'Alamat : -',
    logoDataUrl: '',
    logoWidthPx: 56,
    logoRightDataUrl: '',
    logoRightWidthPx: 56,
    followGlobalLeftLogo: true,
    followGlobalRightLogo: true,
    rowLabels: { ...DEFAULT_MASTER_MENU_ROW_LABELS },
    weeks: generateMasterMenuWeeks(monthKey, cycleMode),
  };
}

export function subscribeMonthMasterMenus(
  uid: string,
  monthKey: string,
  onData: (plans: MasterMenuPlan[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (uid === LOCAL_WORKSPACE_UID) {
    return subscribeLocalMonthMasterMenus(monthKey, onData);
  }
  const path = `users/${uid}/months/${monthKey}/masterMenus`;
  const q = query(
    collection(db, 'users', uid, 'months', monthKey, 'masterMenus'),
    where('uid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: MasterMenuPlan[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MasterMenuPlan, 'id'>),
      }));
      list.sort((a, b) => a.title.localeCompare(b.title));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertMasterMenuPlan(
  uid: string,
  monthKey: string,
  input: Omit<MasterMenuPlan, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return upsertLocalMasterMenuPlan(monthKey, input);
  }
  const planId =
    input.id && !input.id.startsWith('mm_draft_')
      ? input.id
      : `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `users/${uid}/months/${monthKey}/masterMenus/${planId}`;
  const monthRef = doc(db, 'users', uid, 'months', monthKey);
  const ref = doc(db, 'users', uid, 'months', monthKey, 'masterMenus', planId);
  const { year, month } = parseMonthKey(monthKey);
  const monthPeriodeLabel = getPeriodeLabel(year, month, true);

  const cycleMode = input.cycleMode || '4_minggu';
  const categoryIds: TargetCategoryId[] =
    input.categoryIds && input.categoryIds.length > 0 ? input.categoryIds : ['sd_1_3'];

  const rl = input.rowLabels || DEFAULT_MASTER_MENU_ROW_LABELS;
  const clean = {
    uid,
    monthKey,
    title: clampString(
      input.title || formatMasterMenuDefaultTitle(categoryIds, cycleMode, monthKey),
      160
    ),
    categoryIds: categoryIds.slice(0, 20),
    cycleMode,
    headerLine1: clampString(input.headerLine1 || 'BADAN GIZI NASIONAL', 120),
    headerLine2: clampString(input.headerLine2 || 'SATUAN PELAYANAN PEMENUHAN GIZI', 150),
    headerLine3: clampString(input.headerLine3 || '', 150),
    headerAlamat: clampString(input.headerAlamat || '', 250),
    logoDataUrl: (input.logoDataUrl || '').slice(0, 200000),
    logoWidthPx: sanitizeLogoWidthPx(input.logoWidthPx, 56),
    logoRightDataUrl: (input.logoRightDataUrl || '').slice(0, 200000),
    logoRightWidthPx: sanitizeLogoWidthPx(input.logoRightWidthPx, 56),
    followGlobalLeftLogo: input.followGlobalLeftLogo !== false,
    followGlobalRightLogo: input.followGlobalRightLogo !== false,
    rowLabels: {
      kelompokHeader: clampString(rl.kelompokHeader || 'Kelompok Bahan Makanan', 60),
      makananPokok: clampString(rl.makananPokok || 'Makanan Pokok', 40),
      laukHewani: clampString(rl.laukHewani || 'Lauk Hewani', 40),
      laukNabati: clampString(rl.laukNabati || 'Lauk Nabati', 40),
      sayuran: clampString(rl.sayuran || 'Sayuran', 40),
      buah: clampString(rl.buah || 'Buah', 40),
      susu: clampString(rl.susu || 'Susu', 40),
    },
    weeks:
      input.weeks && input.weeks.length > 0
        ? input.weeks.slice(0, 6)
        : generateMasterMenuWeeks(monthKey, cycleMode),
  };

  try {
    const [monthSnap, docSnap] = await Promise.all([getDoc(monthRef), getDoc(ref)]);
    if (!docSnap.exists()) {
      const batch = writeBatch(db);
      if (!monthSnap.exists()) {
        batch.set(monthRef, {
          uid,
          monthKey,
          year,
          month,
          periodeLabel: monthPeriodeLabel,
          entryCount: 0,
          photoCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await updateDoc(ref, {
        ...clean,
        updatedAt: serverTimestamp(),
      });
    }
    return planId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMasterMenuPlan(
  uid: string,
  monthKey: string,
  planId: string
): Promise<void> {
  if (uid === LOCAL_WORKSPACE_UID) {
    return deleteLocalMasterMenuPlan(monthKey, planId);
  }
  const path = `users/${uid}/months/${monthKey}/masterMenus/${planId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'months', monthKey, 'masterMenus', planId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


