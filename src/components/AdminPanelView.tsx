import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AdminSpreadsheetConfig,
  UserAccessRecord,
  UserAccessStatus,
} from '../types';
import {
  addDaysToDateIso,
  ADMIN_EMAIL,
  buildAdminUsersCsv,
  fetchAndParseAdminSheetCsv,
  formatAccessDateTimeLabel,
  formatShortDateId,
  getEffectiveAccessState,
  getLocalTodayIso,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  isAdminEmail,
  pushAdminDatabaseToSheet,
  type ParsedAdminSheetRow,
} from '../services/adminAccessService';

interface AdminPanelViewProps {
  adminEmail: string;
  users: UserAccessRecord[];
  usersLoading: boolean;
  spreadsheetConfig: AdminSpreadsheetConfig | null;
  onUpdateUserAccess: (
    targetUid: string,
    patch: {
      status: UserAccessStatus;
      accessStartDate: string;
      accessExpiresAt: string;
      waitingNote: string;
      adminEmail: string;
    }
  ) => Promise<void>;
  onDeleteUserAccess: (targetUid: string) => Promise<void>;
  onSaveSpreadsheetConfig: (input: {
    spreadsheetUrl: string;
    appsScriptWebhookUrl: string;
    autoPushEnabled: boolean;
    lastSyncedAt: string;
    lastPushedCount: number;
  }) => Promise<void>;
}

type StatusFilter = 'all' | 'waiting' | 'approved' | 'expired' | 'blocked';

interface RowDraftEdit {
  status: UserAccessStatus;
  accessStartDate: string;
  accessExpiresAt: string;
  waitingNote: string;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  adminEmail,
  users,
  usersLoading,
  spreadsheetConfig,
  onUpdateUserAccess,
  onDeleteUserAccess,
  onSaveSpreadsheetConfig,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Local edits per UID before saving or instant ACC
  const [rowEdits, setRowEdits] = useState<Record<string, RowDraftEdit>>({});
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  // Spreadsheet Database state
  const [sheetUrl, setSheetUrl] = useState(spreadsheetConfig?.spreadsheetUrl || '');
  const [webhookUrl, setWebhookUrl] = useState(spreadsheetConfig?.appsScriptWebhookUrl || '');
  const [autoPush, setAutoPush] = useState(Boolean(spreadsheetConfig?.autoPushEnabled));
  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const [syncBusy, setSyncBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [sheetPreviewRows, setSheetPreviewRows] = useState<ParsedAdminSheetRow[] | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!spreadsheetConfig) return;
    setSheetUrl(spreadsheetConfig.spreadsheetUrl || '');
    setWebhookUrl(spreadsheetConfig.appsScriptWebhookUrl || '');
    setAutoPush(Boolean(spreadsheetConfig.autoPushEnabled));
  }, [spreadsheetConfig]);

  // Sync initial editable drafts from Firestore snapshot when new users appear
  useEffect(() => {
    setRowEdits((prev) => {
      const next: Record<string, RowDraftEdit> = {};
      users.forEach((u) => {
        next[u.uid] = prev[u.uid] || {
          status: u.status,
          accessStartDate: u.accessStartDate || '',
          accessExpiresAt: u.accessExpiresAt || '',
          waitingNote: u.waitingNote || '',
        };
      });
      return next;
    });
  }, [users]);

  const counts = useMemo(() => {
    const now = new Date();
    let waiting = 0;
    let approved = 0;
    let expired = 0;
    let blocked = 0;

    users.forEach((u) => {
      const eff = getEffectiveAccessState(u, now);
      if (eff === 'waiting') waiting += 1;
      else if (eff === 'approved' || eff === 'scheduled') approved += 1;
      else if (eff === 'expired') expired += 1;
      else if (eff === 'blocked') blocked += 1;
    });

    return {
      total: users.length,
      waiting,
      approved,
      expired,
      blocked,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const now = new Date();
    const q = (appliedSearch || searchInput).trim().toLowerCase();
    return users.filter((u) => {
      const eff = getEffectiveAccessState(u, now);
      if (statusFilter === 'waiting' && eff !== 'waiting') return false;
      if (statusFilter === 'approved' && eff !== 'approved' && eff !== 'scheduled') return false;
      if (statusFilter === 'expired' && eff !== 'expired') return false;
      if (statusFilter === 'blocked' && eff !== 'blocked') return false;

      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.waitingNote || '').toLowerCase().includes(q)
      );
    });
  }, [users, statusFilter, appliedSearch, searchInput]);

  const getRowDraft = (u: UserAccessRecord): RowDraftEdit => {
    return (
      rowEdits[u.uid] || {
        status: u.status,
        accessStartDate: u.accessStartDate || '',
        accessExpiresAt: u.accessExpiresAt || '',
        waitingNote: u.waitingNote || '',
      }
    );
  };

  const patchRowDraft = (uid: string, u: UserAccessRecord, patch: Partial<RowDraftEdit>) => {
    setRowEdits((prev) => {
      const base = prev[uid] || {
        status: u.status,
        accessStartDate: u.accessStartDate || '',
        accessExpiresAt: u.accessExpiresAt || '',
        waitingNote: u.waitingNote || '',
      };
      return {
        ...prev,
        [uid]: { ...base, ...patch },
      };
    });
  };

  const handleTriggerEmailSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const maybeAutoPushWebhook = async (updatedUsers?: UserAccessRecord[]) => {
    if (!autoPush || !webhookUrl.trim()) return;
    try {
      await pushAdminDatabaseToSheet(webhookUrl.trim(), updatedUsers || users);
    } catch {
      // Non-blocking background sync; admin can also trigger manual push
    }
  };

  const handleQuickAcc = async (
    u: UserAccessRecord,
    overrideExpiry?: string,
    overrideStatus: UserAccessStatus = 'approved'
  ) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setSavingUid(u.uid);

    const draft = getRowDraft(u);
    const todayIso = getLocalTodayIso();
    const startDate = draft.accessStartDate || todayIso;
    const expireDate = overrideExpiry !== undefined ? overrideExpiry : draft.accessExpiresAt;
    const defaultNote =
      overrideStatus === 'approved'
        ? expireDate
          ? `Di-ACC Admin Odhe Gizi · Aktif s/d ${formatShortDateId(expireDate)}`
          : 'Di-ACC Admin Odhe Gizi · Aktif Tanpa Batas'
        : overrideStatus === 'waiting'
        ? 'Daftar Tunggu - Menunggu ACC Admin Odhe Gizi'
        : 'Akses dinonaktifkan oleh Admin Odhe Gizi';

    const nextNote =
      draft.waitingNote &&
      !draft.waitingNote.includes('Daftar Tunggu - Menunggu ACC') &&
      !draft.waitingNote.startsWith('Di-ACC Admin Odhe Gizi')
        ? draft.waitingNote
        : defaultNote;

    try {
      await onUpdateUserAccess(u.uid, {
        status: overrideStatus,
        accessStartDate: startDate,
        accessExpiresAt: expireDate,
        waitingNote: nextNote,
        adminEmail,
      });

      setRowEdits((prev) => ({
        ...prev,
        [u.uid]: {
          status: overrideStatus,
          accessStartDate: startDate,
          accessExpiresAt: expireDate,
          waitingNote: nextNote,
        },
      }));

      setNoticeMsg(
        overrideStatus === 'approved'
          ? `Email ${u.email} berhasil di-ACC (${
              expireDate ? `berakhir ${formatShortDateId(expireDate)}` : 'tanpa batas tanggal berakhir'
            }).`
          : overrideStatus === 'waiting'
          ? `Email ${u.email} dikembalikan ke Daftar Tunggu.`
          : `Akses email ${u.email} diblokir.`
      );

      const nextList = users.map((item) =>
        item.uid === u.uid
          ? {
              ...item,
              status: overrideStatus,
              accessStartDate: startDate,
              accessExpiresAt: expireDate,
              waitingNote: nextNote,
            }
          : item
      );
      void maybeAutoPushWebhook(nextList);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui status pengguna.');
    } finally {
      setSavingUid(null);
    }
  };

  const handleSaveRowDates = async (u: UserAccessRecord) => {
    const draft = getRowDraft(u);
    setErrorMsg(null);
    setNoticeMsg(null);
    setSavingUid(u.uid);
    try {
      await onUpdateUserAccess(u.uid, {
        status: draft.status,
        accessStartDate: draft.accessStartDate,
        accessExpiresAt: draft.accessExpiresAt,
        waitingNote: draft.waitingNote,
        adminEmail,
      });
      setNoticeMsg(`Tanggal & pengaturan login untuk ${u.email} berhasil disimpan.`);
      const nextList = users.map((item) =>
        item.uid === u.uid ? { ...item, ...draft } : item
      );
      void maybeAutoPushWebhook(nextList);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan tanggal.');
    } finally {
      setSavingUid(null);
    }
  };

  const handleConfirmDelete = async (uid: string, email: string) => {
    setErrorMsg(null);
    setSavingUid(uid);
    try {
      await onDeleteUserAccess(uid);
      setConfirmDeleteUid(null);
      setNoticeMsg(`Catatan akses ${email} dihapus dari daftar.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus catatan pengguna.');
    } finally {
      setSavingUid(null);
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildAdminUsersCsv(users);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Database_Pengguna_Admin_Odhe_Gizi_${getLocalTodayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNoticeMsg(`File CSV Database Pengguna (${users.length} akun) berhasil diunduh.`);
  };

  const handleSaveSheetSettings = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await onSaveSpreadsheetConfig({
        spreadsheetUrl: sheetUrl,
        appsScriptWebhookUrl: webhookUrl,
        autoPushEnabled: autoPush,
        lastSyncedAt: spreadsheetConfig?.lastSyncedAt || '',
        lastPushedCount: spreadsheetConfig?.lastPushedCount || users.length,
      });
      setNoticeMsg('Konfigurasi Spreadsheet Database Pengguna berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi Spreadsheet.');
    }
  };

  const handleImportFromSpreadsheet = async () => {
    if (!sheetUrl.trim()) {
      setErrorMsg('Masukkan URL Google Sheets terlebih dahulu.');
      return;
    }
    setErrorMsg(null);
    setNoticeMsg(null);
    setSyncBusy(true);
    try {
      const { rows } = await fetchAndParseAdminSheetCsv(sheetUrl.trim());
      setSheetPreviewRows(rows);
      if (rows.length === 0) {
        setErrorMsg(
          'Tidak ditemukan kolom "Email" pada spreadsheet. Pastikan baris header memiliki kolom Email.'
        );
        return;
      }

      let matchedCount = 0;
      const byEmail = new Map<string, UserAccessRecord>();
      users.forEach((u) => byEmail.set(u.email.trim().toLowerCase(), u));

      for (const row of rows) {
        const target = byEmail.get(row.email);
        if (!target || isAdminEmail(target.email)) continue;

        const nextStatus = row.status || target.status;
        const nextStart =
          row.accessStartDate !== undefined ? row.accessStartDate : target.accessStartDate;
        const nextExpire =
          row.accessExpiresAt !== undefined ? row.accessExpiresAt : target.accessExpiresAt;
        const nextNote =
          row.waitingNote !== undefined ? row.waitingNote : target.waitingNote;

        await onUpdateUserAccess(target.uid, {
          status: nextStatus,
          accessStartDate: nextStart,
          accessExpiresAt: nextExpire,
          waitingNote: nextNote,
          adminEmail,
        });
        matchedCount += 1;
      }

      await onSaveSpreadsheetConfig({
        spreadsheetUrl: sheetUrl,
        appsScriptWebhookUrl: webhookUrl,
        autoPushEnabled: autoPush,
        lastSyncedAt: new Date().toISOString(),
        lastPushedCount: users.length,
      });

      setNoticeMsg(
        `Spreadsheet terbaca (${rows.length} baris email). ${matchedCount} pengguna terdaftar berhasil disinkronkan dari Google Sheets.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membaca spreadsheet Google Sheets.');
    } finally {
      setSyncBusy(false);
    }
  };

  const handlePushToSpreadsheetNow = async () => {
    if (!webhookUrl.trim()) {
      setErrorMsg(
        'Masukkan URL Google Apps Script Web App terlebih dahulu agar data & jumlah pengguna dapat dikirim ke Google Sheets.'
      );
      return;
    }
    setErrorMsg(null);
    setNoticeMsg(null);
    setPushBusy(true);
    try {
      await pushAdminDatabaseToSheet(webhookUrl.trim(), users);
      await onSaveSpreadsheetConfig({
        spreadsheetUrl: sheetUrl,
        appsScriptWebhookUrl: webhookUrl,
        autoPushEnabled: autoPush,
        lastSyncedAt: new Date().toISOString(),
        lastPushedCount: users.length,
      });
      setNoticeMsg(
        `Berhasil mengirim ${users.length} pengguna (Total: ${counts.total}, Daftar Tunggu: ${counts.waiting}, Aktif: ${counts.approved}) ke Google Sheets.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim ke Google Sheets.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleCopyAppsScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      setErrorMsg('Gagal menyalin otomatis. Silakan blok kode dan tekan Ctrl+C.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-emerald-700">Panel Kontrol Admin Odhe Gizi</span>
              <span aria-hidden="true">·</span>
              <span>{adminEmail || ADMIN_EMAIL}</span>
            </div>
            <h1 className="font-display mt-1 text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Manajemen Akses Pengguna &amp; Database Spreadsheet
            </h1>
            <p className="mt-1 max-w-3xl text-xs sm:text-sm text-slate-600">
              Setiap pengguna yang mencoba masuk dengan email pribadi Google otomatis terdeteksi di Daftar Tunggu. Cari email untuk melakukan ACC, atur tanggal login &amp; tanggal berakhir login, serta sinkronkan jumlah pengguna ke Google Spreadsheet.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 text-emerald-600" />
            Unduh Database CSV ({counts.total})
          </button>
        </div>
      </section>

      {errorMsg && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900"
            aria-label="Tutup pesan galat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {noticeMsg && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{noticeMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setNoticeMsg(null)}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Tutup pemberitahuan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Ringkasan jumlah pengguna">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            statusFilter === 'all'
              ? 'border-emerald-600 bg-emerald-50/40'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">Total Pengguna Terdeteksi</div>
          <div className="font-mono-num mt-1.5 text-2xl font-bold text-slate-900">
            {counts.total}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Semua email pribadi masuk</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('waiting')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            statusFilter === 'waiting'
              ? 'border-amber-500 bg-amber-50/50'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-xs font-medium text-amber-700">Daftar Tunggu (Perlu ACC)</div>
          <div className="font-mono-num mt-1.5 text-2xl font-bold text-amber-800">
            {counts.waiting}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Menunggu persetujuan Odhe Gizi</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            statusFilter === 'approved'
              ? 'border-emerald-600 bg-emerald-50/40'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-xs font-medium text-emerald-700">Pengguna Aktif (ACC)</div>
          <div className="font-mono-num mt-1.5 text-2xl font-bold text-emerald-800">
            {counts.approved}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Bisa akses semua menu non-admin</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('expired')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            statusFilter === 'expired'
              ? 'border-red-500 bg-red-50/50'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <div className="text-xs font-medium text-red-700">Kedaluwarsa / Diblokir</div>
          <div className="font-mono-num mt-1.5 text-2xl font-bold text-red-700">
            {counts.expired + counts.blocked}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {counts.expired} habis masa · {counts.blocked} diblokir
          </div>
        </button>
      </section>

      {/* Search Email to ACC & Filter Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <form onSubmit={handleTriggerEmailSearch} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (!e.target.value.trim()) setAppliedSearch('');
                }}
                placeholder="Ketik email atau nama pengguna yang coba login..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <Search className="h-3.5 w-3.5" />
              Cari Email untuk ACC
            </button>
            {(searchInput || appliedSearch) && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch('');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: `Semua (${counts.total})` },
                { id: 'waiting', label: `Daftar Tunggu (${counts.waiting})` },
                { id: 'approved', label: `Aktif (${counts.approved})` },
                { id: 'expired', label: `Kedaluwarsa (${counts.expired})` },
                { id: 'blocked', label: `Diblokir (${counts.blocked})` },
              ] as Array<{ id: StatusFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Users Control Table / List */}
        {usersLoading ? (
          <div className="rounded-lg border border-slate-200 p-10 text-center text-xs text-slate-500">
            Memuat daftar pengguna dan antrean daftar tunggu...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-800">
              {appliedSearch || searchInput
                ? 'Email Tidak Ditemukan'
                : 'Belum Ada Pengguna pada Kategori Ini'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Setiap pengguna baru yang mencoba masuk dengan email pribadi Google akan otomatis muncul di sini dengan keterangan Daftar Tunggu.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {filteredUsers.map((u) => {
              const eff = getEffectiveAccessState(u);
              const draft = getRowDraft(u);
              const isSelfAdmin = isAdminEmail(u.email);
              const isBusy = savingUid === u.uid;

              let statusLabel = 'Aktif (ACC)';
              let statusClass = 'text-emerald-700';
              if (isSelfAdmin) {
                statusLabel = 'Admin Utama Odhe Gizi';
                statusClass = 'text-emerald-800 font-semibold';
              } else if (eff === 'waiting') {
                statusLabel = 'Daftar Tunggu (Menunggu ACC)';
                statusClass = 'text-amber-700 font-semibold';
              } else if (eff === 'expired') {
                statusLabel = 'Masa Login Berakhir';
                statusClass = 'text-red-700 font-semibold';
              } else if (eff === 'scheduled') {
                statusLabel = 'Terjadwal Aktif';
                statusClass = 'text-slate-700 font-semibold';
              } else if (eff === 'blocked') {
                statusLabel = 'Diblokir';
                statusClass = 'text-red-700 font-semibold';
              }

              return (
                <div
                  key={u.uid}
                  className={`p-4 space-y-3 ${
                    eff === 'waiting' ? 'bg-amber-50/30' : 'bg-white'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900 break-all">
                          {u.email}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className={`text-xs ${statusClass}`}>{statusLabel}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{u.displayName || 'Tanpa Nama'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          Login Pertama: {formatAccessDateTimeLabel(u.firstLoginAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          Login Terakhir: {formatAccessDateTimeLabel(u.lastLoginAt)} ({u.loginCount || 1}x)
                        </span>
                      </div>
                    </div>

                    {!isSelfAdmin && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {eff !== 'approved' ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleQuickAcc(u, draft.accessExpiresAt, 'approved')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            {isBusy ? 'Memproses...' : 'ACC Pengguna'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSaveRowDates(u)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {isBusy ? 'Menyimpan...' : 'Simpan Tanggal'}
                          </button>
                        )}

                        {u.status !== 'waiting' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleQuickAcc(u, draft.accessExpiresAt, 'waiting')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            Daftar Tunggu
                          </button>
                        )}

                        {u.status !== 'blocked' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleQuickAcc(u, draft.accessExpiresAt, 'blocked')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Blokir
                          </button>
                        )}

                        {confirmDeleteUid === u.uid ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleConfirmDelete(u.uid, u.email)}
                              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              Ya, Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUid(null)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUid(u.uid)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            title="Hapus catatan akses"
                            aria-label={`Hapus ${u.email}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Date & Note Controls for Non-Admin Users */}
                  {!isSelfAdmin && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Tanggal Mulai Login
                        </label>
                        <input
                          type="date"
                          value={draft.accessStartDate}
                          onChange={(e) =>
                            patchRowDraft(u.uid, u, { accessStartDate: e.target.value })
                          }
                          className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
                          <span>Tanggal Berakhir Login (Atur Admin)</span>
                          <span className="text-[10px] text-slate-400">
                            {draft.accessExpiresAt ? formatShortDateId(draft.accessExpiresAt) : 'Tanpa Batas'}
                          </span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={draft.accessExpiresAt}
                            onChange={(e) =>
                              patchRowDraft(u.uid, u, { accessExpiresAt: e.target.value })
                            }
                            className="font-mono-num flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                          />
                          {draft.accessExpiresAt && (
                            <button
                              type="button"
                              onClick={() => patchRowDraft(u.uid, u, { accessExpiresAt: '' })}
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-100 whitespace-nowrap"
                              title="Hapus batas tanggal berakhir"
                            >
                              Tanpa Batas
                            </button>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {[
                            { label: '+7 Hr', days: 7 },
                            { label: '+30 Hr', days: 30 },
                            { label: '+3 Bln', days: 90 },
                            { label: '+1 Thn', days: 365 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                const today = getLocalTodayIso();
                                const targetExp = addDaysToDateIso(today, preset.days);
                                patchRowDraft(u.uid, u, {
                                  accessStartDate: draft.accessStartDate || today,
                                  accessExpiresAt: targetExp,
                                });
                              }}
                              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="md:col-span-5">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Keterangan (Ditampilkan ke Pengguna)
                        </label>
                        <input
                          type="text"
                          value={draft.waitingNote}
                          maxLength={300}
                          onChange={(e) =>
                            patchRowDraft(u.uid, u, { waitingNote: e.target.value })
                          }
                          placeholder="Daftar Tunggu - Menunggu ACC Admin Odhe Gizi"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Admin Spreadsheet User Database Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Database Pengguna Admin Spreadsheet
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Deteksi otomatis jumlah pengguna aktif, daftar tunggu, dan masa berakhir login langsung melalui Google Sheets atau file CSV.
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-600 font-mono-num shrink-0">
            Total Terdeteksi: <strong className="text-slate-900">{counts.total}</strong> pengguna
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Column 1: Baca / Sinkron dari Link Google Sheets */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                1. Link Google Sheets Database (Impor &amp; Update Status)
              </h3>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="text-[11px] font-semibold text-emerald-700 hover:underline whitespace-nowrap"
              >
                Unduh Template CSV
              </button>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Tempel link Google Sheets (akses <em>Siapa saja yang memiliki link dapat melihat</em>) yang berisi kolom <strong>Email</strong>, <strong>Status</strong> (ACC / Daftar Tunggu / Blokir), <strong>Tanggal Mulai</strong>, dan <strong>Tanggal Berakhir</strong>.
            </p>
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncBusy}
                onClick={handleImportFromSpreadsheet}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                {syncBusy ? 'Menyinkronkan...' : 'Sinkron dari Spreadsheet'}
              </button>
              <button
                type="button"
                onClick={handleSaveSheetSettings}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Save className="h-3.5 w-3.5" />
                Simpan Link
              </button>
            </div>

            {sheetPreviewRows && sheetPreviewRows.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] space-y-1">
                <div className="font-semibold text-slate-800">
                  Terbaca {sheetPreviewRows.length} email dari Spreadsheet:
                </div>
                <div className="max-h-28 overflow-y-auto divide-y divide-slate-100">
                  {sheetPreviewRows.slice(0, 15).map((r) => (
                    <div key={r.email} className="flex items-center justify-between gap-2 py-1">
                      <span className="truncate text-slate-800">{r.email}</span>
                      <span className="font-mono-num text-slate-500 shrink-0">
                        {r.status || '-'} · {r.accessExpiresAt || 'Tanpa batas'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Push Live Jumlah & Database Pengguna ke Google Sheets via Apps Script */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900">
                2. Kirim Jumlah &amp; Data Pengguna ke Google Sheets (Apps Script)
              </h3>
              <button
                type="button"
                onClick={() => setShowAppsScriptCode((v) => !v)}
                className="text-[11px] font-semibold text-emerald-700 hover:underline whitespace-nowrap"
              >
                {showAppsScriptCode ? 'Sembunyikan Kode' : 'Kode Apps Script'}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Hubungkan Google Spreadsheet pribadi Admin agar total pengguna (<span className="font-mono-num font-semibold">{counts.total}</span> akun), daftar tunggu (<span className="font-mono-num font-semibold">{counts.waiting}</span>), serta tanggal login &amp; berakhir terekam otomatis di sheet <em>Ringkasan</em> dan <em>Database Pengguna</em>.
            </p>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPush}
                onChange={(e) => setAutoPush(e.target.checked)}
                className="rounded accent-emerald-600"
              />
              <span>Otomatis kirim pembaruan ke Google Sheets saat Admin ACC / ubah tanggal</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pushBusy}
                onClick={handlePushToSpreadsheetNow}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {pushBusy ? 'Mengirim ke Sheets...' : `Kirim Sekarang (${counts.total} Pengguna)`}
              </button>
              <button
                type="button"
                onClick={handleSaveSheetSettings}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Save className="h-3.5 w-3.5" />
                Simpan Webhook
              </button>
            </div>
            {spreadsheetConfig?.lastSyncedAt && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono-num">
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Terakhir sinkron: {formatAccessDateTimeLabel(spreadsheetConfig.lastSyncedAt)} ·{' '}
                  {spreadsheetConfig.lastPushedCount} pengguna
                </span>
              </div>
            )}
          </div>
        </div>

        {showAppsScriptCode && (
          <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Panduan Kode Google Apps Script untuk Spreadsheet Admin Odhe Gizi
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Buka Google Sheets → Ekstensi → Apps Script → tempel kode di bawah → Deploy → Aplikasi Web (Akses: Siapa saja) → salin URL /exec ke kolom Webhook di atas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyAppsScript}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                {copiedScript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedScript ? 'Tersalin!' : 'Salin Kode Script'}
              </button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-200 font-mono">
              {GOOGLE_APPS_SCRIPT_TEMPLATE}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};
