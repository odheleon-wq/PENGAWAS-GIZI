import { type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AdminSpreadsheetConfig,
  UserAccessRecord,
  UserAccessStatus,
} from '../types';
import { getTodayIso } from '../utils/dateUtils';

export const ADMIN_EMAIL = 'odheleon@gmail.com';
export const ADMIN_SETTINGS_DOC_ID = 'odhe_gizi';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export function getLocalTodayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateIso(baseDateIso: string, days: number): string {
  const clean = baseDateIso && /^\d{4}-\d{2}-\d{2}$/.test(baseDateIso)
    ? baseDateIso
    : getLocalTodayIso();
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return getLocalTodayIso(dt);
}

export function isUserAccessBeforeStart(
  record: UserAccessRecord | null,
  now = new Date()
): boolean {
  if (!record || !record.accessStartDate) return false;
  const start = record.accessStartDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  return getLocalTodayIso(now) < start;
}

export function isUserAccessExpired(
  record: UserAccessRecord | null,
  now = new Date()
): boolean {
  if (!record || !record.accessExpiresAt) return false;
  const exp = record.accessExpiresAt.trim();
  if (!exp) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
    return getLocalTodayIso(now) > exp;
  }
  const parsed = Date.parse(exp);
  if (Number.isNaN(parsed)) return false;
  return now.getTime() > parsed;
}

export type EffectiveAccessState =
  | 'waiting'
  | 'approved'
  | 'scheduled'
  | 'expired'
  | 'blocked';

export function getEffectiveAccessState(
  record: UserAccessRecord,
  now = new Date()
): EffectiveAccessState {
  if (isAdminEmail(record.email) || record.role === 'admin') {
    return 'approved';
  }
  if (record.status === 'blocked') return 'blocked';
  if (record.status === 'waiting') return 'waiting';
  if (isUserAccessExpired(record, now)) return 'expired';
  if (isUserAccessBeforeStart(record, now)) return 'scheduled';
  return 'approved';
}

export function formatAccessDateTimeLabel(isoStr?: string): string {
  if (!isoStr) return '-';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  return dt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDateId(dateIso?: string): string {
  if (!dateIso) return 'Tanpa Batas';
  const clean = dateIso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return dateIso;
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function recordUserLoginAttempt(user: User): Promise<void> {
  const path = `userAccess/${user.uid}`;
  const ref = doc(db, 'userAccess', user.uid);
  const nowIso = new Date().toISOString();
  const isAdmin = isAdminEmail(user.email);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        email: (user.email || '').slice(0, 200),
        displayName: (user.displayName || '').slice(0, 150),
        photoUrl: (user.photoURL || '').slice(0, 500),
        status: isAdmin ? 'approved' : 'waiting',
        role: isAdmin ? 'admin' : 'user',
        waitingNote: isAdmin
          ? 'Admin Utama Odhe Gizi'
          : 'Daftar Tunggu - Menunggu ACC Admin Odhe Gizi',
        firstLoginAt: nowIso,
        lastLoginAt: nowIso,
        loginCount: 1,
        accessStartDate: isAdmin ? getTodayIso() : '',
        accessExpiresAt: '',
        approvedBy: isAdmin ? ADMIN_EMAIL : '',
        approvedAt: isAdmin ? nowIso : '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload);
    } else {
      const existing = snap.data() as Partial<UserAccessRecord>;
      await updateDoc(ref, {
        displayName: (user.displayName || existing.displayName || '').slice(0, 150),
        photoUrl: (user.photoURL || existing.photoUrl || '').slice(0, 500),
        lastLoginAt: nowIso,
        loginCount: Math.min(1000000, Math.max(1, Number(existing.loginCount || 0) + 1)),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeMyAccessRecord(
  uid: string,
  onData: (record: UserAccessRecord | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `userAccess/${uid}`;
  return onSnapshot(
    doc(db, 'userAccess', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as UserAccessRecord);
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

export function subscribeAllUserAccess(
  onData: (records: UserAccessRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'userAccess';
  const q = query(collection(db, 'userAccess'));
  return onSnapshot(
    q,
    (snap) => {
      const list: UserAccessRecord[] = snap.docs.map((d) => d.data() as UserAccessRecord);
      list.sort((a, b) => {
        // Prioritize waiting list at the top, then latest login first
        if (a.status === 'waiting' && b.status !== 'waiting') return -1;
        if (a.status !== 'waiting' && b.status === 'waiting') return 1;
        return (b.lastLoginAt || '').localeCompare(a.lastLoginAt || '');
      });
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

export async function updateUserAccessByAdmin(
  targetUid: string,
  patch: {
    status: UserAccessStatus;
    accessStartDate: string;
    accessExpiresAt: string;
    waitingNote: string;
    adminEmail: string;
  }
): Promise<void> {
  const path = `userAccess/${targetUid}`;
  const ref = doc(db, 'userAccess', targetUid);
  const nowIso = new Date().toISOString();

  try {
    await updateDoc(ref, {
      status: patch.status,
      accessStartDate: patch.accessStartDate.trim().slice(0, 30),
      accessExpiresAt: patch.accessExpiresAt.trim().slice(0, 30),
      waitingNote: patch.waitingNote.trim().slice(0, 300),
      approvedBy:
        patch.status === 'approved' ? patch.adminEmail.trim().slice(0, 200) : '',
      approvedAt: patch.status === 'approved' ? nowIso : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserAccessRecord(targetUid: string): Promise<void> {
  const path = `userAccess/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'userAccess', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAdminSpreadsheetConfig(
  onData: (config: AdminSpreadsheetConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `adminSettings/${ADMIN_SETTINGS_DOC_ID}`;
  return onSnapshot(
    doc(db, 'adminSettings', ADMIN_SETTINGS_DOC_ID),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as AdminSpreadsheetConfig);
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

export async function saveAdminSpreadsheetConfig(input: {
  spreadsheetUrl: string;
  appsScriptWebhookUrl: string;
  autoPushEnabled: boolean;
  lastSyncedAt: string;
  lastPushedCount: number;
}): Promise<void> {
  const path = `adminSettings/${ADMIN_SETTINGS_DOC_ID}`;
  const ref = doc(db, 'adminSettings', ADMIN_SETTINGS_DOC_ID);
  const clean = {
    id: ADMIN_SETTINGS_DOC_ID,
    spreadsheetUrl: input.spreadsheetUrl.trim().slice(0, 500),
    appsScriptWebhookUrl: input.appsScriptWebhookUrl.trim().slice(0, 500),
    autoPushEnabled: Boolean(input.autoPushEnabled),
    lastSyncedAt: input.lastSyncedAt.trim().slice(0, 60),
    lastPushedCount: Math.max(0, Math.round(Number(input.lastPushedCount) || 0)),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, clean);
    } else {
      await updateDoc(ref, {
        spreadsheetUrl: clean.spreadsheetUrl,
        appsScriptWebhookUrl: clean.appsScriptWebhookUrl,
        autoPushEnabled: clean.autoPushEnabled,
        lastSyncedAt: clean.lastSyncedAt,
        lastPushedCount: clean.lastPushedCount,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Spreadsheet CSV & Google Apps Script Sync Helpers ---

function escapeCsvCell(val: string | number): string {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildAdminUsersCsv(records: UserAccessRecord[]): string {
  const now = new Date();
  const total = records.length;
  const waitingCount = records.filter((r) => getEffectiveAccessState(r, now) === 'waiting').length;
  const approvedCount = records.filter((r) => getEffectiveAccessState(r, now) === 'approved').length;
  const expiredCount = records.filter((r) => getEffectiveAccessState(r, now) === 'expired').length;
  const blockedCount = records.filter((r) => getEffectiveAccessState(r, now) === 'blocked').length;

  const lines: string[] = [
    [
      'RINGKASAN DATABASE PENGGUNA SPPG',
      `Total: ${total}`,
      `Daftar Tunggu: ${waitingCount}`,
      `Aktif ACC: ${approvedCount}`,
      `Kedaluwarsa: ${expiredCount}`,
      `Diblokir: ${blockedCount}`,
      `Diekspor: ${now.toLocaleString('id-ID')}`,
    ]
      .map(escapeCsvCell)
      .join(','),
    [
      'No',
      'Email Aktif',
      'Nama Pengguna',
      'Role',
      'Status Akses',
      'Tanggal Login Pertama',
      'Login Terakhir',
      'Jumlah Login',
      'Tanggal Mulai Akses',
      'Tanggal Berakhir Login',
      'Keterangan Admin',
      'Di-ACC Oleh',
      'UID',
    ]
      .map(escapeCsvCell)
      .join(','),
  ];

  records.forEach((r, idx) => {
    const eff = getEffectiveAccessState(r, now);
    const statusLabel =
      eff === 'waiting'
        ? 'Daftar Tunggu'
        : eff === 'approved'
        ? 'Aktif (ACC)'
        : eff === 'expired'
        ? 'Kedaluwarsa'
        : eff === 'scheduled'
        ? 'Terjadwal'
        : 'Diblokir';

    lines.push(
      [
        idx + 1,
        r.email,
        r.displayName || '-',
        r.role,
        statusLabel,
        r.firstLoginAt,
        r.lastLoginAt,
        r.loginCount || 1,
        r.accessStartDate || '',
        r.accessExpiresAt || '',
        r.waitingNote || '',
        r.approvedBy || '',
        r.uid,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });

  return lines.join('\r\n');
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ParsedAdminSheetRow {
  email: string;
  status?: UserAccessStatus;
  accessStartDate?: string;
  accessExpiresAt?: string;
  waitingNote?: string;
}

function normalizeStatusCell(raw: string): UserAccessStatus | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (s.includes('acc') || s.includes('aktif') || s === 'approved' || s === 'ya') {
    return 'approved';
  }
  if (s.includes('blokir') || s.includes('block') || s.includes('nonaktif') || s === 'blocked') {
    return 'blocked';
  }
  if (s.includes('tunggu') || s.includes('wait') || s === 'waiting') {
    return 'waiting';
  }
  return undefined;
}

function normalizeDateCell(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return undefined;
}

export function parseAdminUsersCsv(csvText: string): ParsedAdminSheetRow[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const sample = lines[0];
  const delimiter =
    (sample.match(/;/g)?.length || 0) > (sample.match(/,/g)?.length || 0) ? ';' : ',';

  let headerIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(10, lines.length); i += 1) {
    const cols = splitCsvLine(lines[i], delimiter).map((c) => c.toLowerCase());
    if (cols.some((c) => c.includes('email'))) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }

  if (headerIdx < 0) return [];

  const emailIdx = headers.findIndex((h) => h.includes('email'));
  const statusIdx = headers.findIndex((h) => h.includes('status'));
  const startIdx = headers.findIndex((h) => h.includes('mulai') || h.includes('start'));
  const expireIdx = headers.findIndex(
    (h) => h.includes('berakhir') || h.includes('expired') || h.includes('expir')
  );
  const noteIdx = headers.findIndex((h) => h.includes('keterangan') || h.includes('catatan') || h.includes('note'));

  if (emailIdx < 0) return [];

  const out: ParsedAdminSheetRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    const emailRaw = (cols[emailIdx] || '').trim().toLowerCase();
    if (!emailRaw || !emailRaw.includes('@')) continue;

    out.push({
      email: emailRaw,
      status: statusIdx >= 0 ? normalizeStatusCell(cols[statusIdx] || '') : undefined,
      accessStartDate: startIdx >= 0 ? normalizeDateCell(cols[startIdx] || '') : undefined,
      accessExpiresAt: expireIdx >= 0 ? normalizeDateCell(cols[expireIdx] || '') : undefined,
      waitingNote: noteIdx >= 0 ? (cols[noteIdx] || '').trim() : undefined,
    });
  }
  return out;
}

export async function fetchAndParseAdminSheetCsv(
  url: string
): Promise<{ rows: ParsedAdminSheetRow[]; resolvedUrl: string }> {
  const res = await fetch('/api/fetch-tkpi-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json()) as {
    csvText?: string;
    resolvedUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.csvText) {
    throw new Error(data.error || 'Gagal mengambil data dari link Google Sheets.');
  }
  const rows = parseAdminUsersCsv(data.csvText);
  return {
    rows,
    resolvedUrl: data.resolvedUrl || url,
  };
}

export async function pushAdminDatabaseToSheet(
  webhookUrl: string,
  records: UserAccessRecord[]
): Promise<{ ok: boolean; responsePreview?: string }> {
  const now = new Date();
  const waitingCount = records.filter((r) => getEffectiveAccessState(r, now) === 'waiting').length;
  const approvedCount = records.filter((r) => getEffectiveAccessState(r, now) === 'approved').length;
  const expiredCount = records.filter((r) => getEffectiveAccessState(r, now) === 'expired').length;
  const blockedCount = records.filter((r) => getEffectiveAccessState(r, now) === 'blocked').length;

  const payload = {
    source: 'Portal Pengawas Gizi SPPG - Admin Odhe Gizi',
    syncedAt: now.toISOString(),
    summary: {
      totalUsers: records.length,
      waitingCount,
      approvedCount,
      expiredCount,
      blockedCount,
    },
    users: records.map((r, idx) => ({
      no: idx + 1,
      email: r.email,
      displayName: r.displayName || '-',
      role: r.role,
      status: r.status,
      effectiveStatus: getEffectiveAccessState(r, now),
      firstLoginAt: r.firstLoginAt,
      lastLoginAt: r.lastLoginAt,
      loginCount: r.loginCount || 1,
      accessStartDate: r.accessStartDate || '',
      accessExpiresAt: r.accessExpiresAt || '',
      waitingNote: r.waitingNote || '',
      approvedBy: r.approvedBy || '',
      uid: r.uid,
    })),
  };

  const res = await fetch('/api/push-admin-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl, payload }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    responsePreview?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Gagal mengirim data pengguna ke Google Sheets.');
  }
  return { ok: true, responsePreview: data.responsePreview };
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = JSON.parse(e.postData.contents);
  var summary = payload.summary || {};
  var users = payload.users || [];

  // 1. Sheet Ringkasan Jumlah Pengguna
  var sumSheet = ss.getSheetByName('Ringkasan') || ss.insertSheet('Ringkasan');
  sumSheet.clearContents();
  sumSheet.getRange(1, 1, 7, 2).setValues([
    ['DATABASE PENGGUNA ADMIN ODHE GIZI', 'NILAI'],
    ['Total Pengguna Terdeteksi', summary.totalUsers || 0],
    ['Daftar Tunggu (Menunggu ACC)', summary.waitingCount || 0],
    ['Pengguna Aktif (Sudah ACC)', summary.approvedCount || 0],
    ['Masa Login Kedaluwarsa', summary.expiredCount || 0],
    ['Diblokir / Nonaktif', summary.blockedCount || 0],
    ['Terakhir Sinkronisasi', payload.syncedAt || new Date().toISOString()]
  ]);

  // 2. Sheet Database Pengguna Lengkap
  var dbSheet = ss.getSheetByName('Database Pengguna') || ss.insertSheet('Database Pengguna');
  dbSheet.clearContents();
  var headers = [
    'No', 'Email Aktif', 'Nama Pengguna', 'Status Akses',
    'Tanggal Login Pertama', 'Login Terakhir', 'Jumlah Login',
    'Tanggal Mulai Akses', 'Tanggal Berakhir Login', 'Keterangan Admin', 'UID'
  ];
  var rows = [headers];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    rows.push([
      u.no, u.email, u.displayName, u.effectiveStatus,
      u.firstLoginAt, u.lastLoginAt, u.loginCount,
      u.accessStartDate, u.accessExpiresAt, u.waitingNote, u.uid
    ]);
  }
  dbSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  return ContentService.createTextOutput(JSON.stringify({ ok: true, total: users.length }))
    .setMimeType(ContentService.MimeType.JSON);
}`;
