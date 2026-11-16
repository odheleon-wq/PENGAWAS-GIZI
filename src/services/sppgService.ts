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
import type { DailyMenuEntry, MonthlyArchive, SppgUserProfile } from '../types';
import { getPeriodeLabel, parseMonthKey } from '../utils/dateUtils';

function clampString(val: string, max: number): string {
  return val.trim().slice(0, max);
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
  };
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: SppgUserProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
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
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

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

export async function deleteDailyMenuEntry(
  uid: string,
  monthKey: string,
  entryId: string
): Promise<void> {
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
