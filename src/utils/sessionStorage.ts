import type { PdfOrientation, WorkspaceTab } from '../types';

export interface UserSessionResumeState {
  activeTab: WorkspaceTab;
  activeMonthKey: string;
  activeWorkDateIso: string;
  activeTempRoomId: string | null;
  activeFreezerMachineId: string | null;
  pdfOrientation: PdfOrientation;
  includeYearInPeriod: boolean;
  updatedAtIso: string;
}

const SESSION_PREFIX = 'sppg_resume_session_v1:';
const DRAFT_PREFIX = 'sppg_auto_draft_v1:';

const VALID_TABS: Set<string> = new Set([
  'dashboard',
  'master_menu',
  'rekapan',
  'gizi',
  'foodcost',
  'update_pm',
  'rekap_bahan',
  'po_bahan',
  'sampel',
  'suhu',
  'freezer',
  'makanan',
  'kalender',
  'arsip',
  'identitas',
  'admin_panel',
]);

export function loadUserSessionState(
  uid: string,
  isAdmin: boolean
): Partial<UserSessionResumeState> | null {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return null;
  try {
    const raw = window.localStorage.getItem(`${SESSION_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserSessionResumeState>;
    const tab =
      typeof parsed.activeTab === 'string' && VALID_TABS.has(parsed.activeTab)
        ? (parsed.activeTab as WorkspaceTab)
        : 'dashboard';
    return {
      ...parsed,
      activeTab: tab === 'admin_panel' && !isAdmin ? 'dashboard' : tab,
    };
  } catch {
    return null;
  }
}

export function saveUserSessionState(
  uid: string,
  state: UserSessionResumeState
): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return;
  try {
    window.localStorage.setItem(`${SESSION_PREFIX}${uid}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveScopedDraftBackup<T>(
  uid: string,
  scopeKey: string,
  data: T
): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid || !scopeKey) return;
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${uid}:${scopeKey}`,
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadScopedDraftBackup<T>(
  uid: string,
  scopeKey: string
): T | null {
  if (typeof window === 'undefined' || !window.localStorage || !uid || !scopeKey) return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${uid}:${scopeKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

export function clearScopedDraftBackup(uid: string, scopeKey: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid || !scopeKey) return;
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${uid}:${scopeKey}`);
  } catch {
    // Ignore errors
  }
}
