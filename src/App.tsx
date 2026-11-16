import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Archive,
  Building2,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ListOrdered,
  LogOut,
  Menu,
  UserCheck,
  X,
} from 'lucide-react';
import { auth, googleProvider } from './firebase';
import {
  deleteDailyMenuEntry,
  getDefaultProfileDraft,
  renumberMonthEntriesChronologically,
  saveUserProfile,
  subscribeMonthEntries,
  subscribeMonthlyArchives,
  subscribeUserProfile,
  upsertDailyMenuEntry,
} from './services/sppgService';
import type {
  DailyMenuEntry,
  MonthlyArchive,
  PdfOrientation,
  SppgUserProfile,
  WorkspaceTab,
} from './types';
import {
  getMonthKey,
  getNextSuggestedDateInMonth,
  getPeriodeDisplayName,
  getTodayIso,
  shiftMonthKey,
} from './utils/dateUtils';
import { exportRekapanToF4Pdf } from './utils/pdfExporter';
import { LoginScreen } from './components/LoginScreen';
import { SppgProfileForm } from './components/SppgProfileForm';
import { RekapanTablePreview } from './components/RekapanTablePreview';
import { EntryEditorModal } from './components/EntryEditorModal';
import { MonthCalendarView } from './components/MonthCalendarView';
import { MonthlyArchiveList } from './components/MonthlyArchiveList';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [profile, setProfile] = useState<SppgUserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [archives, setArchives] = useState<MonthlyArchive[]>([]);
  const [activeMonthKey, setActiveMonthKey] = useState<string>(() => {
    const now = new Date();
    return getMonthKey(now.getFullYear(), now.getMonth() + 1);
  });
  const [entries, setEntries] = useState<DailyMenuEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('rekapan');
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('landscape');
  const [includeYearInPeriod, setIncludeYearInPeriod] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [editorModal, setEditorModal] = useState<{
    open: boolean;
    dateIso: string;
    entry: DailyMenuEntry | null;
  }>({ open: false, dateIso: getTodayIso(), entry: null });

  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setProfile(null);
        setProfileLoaded(false);
        setArchives([]);
        setEntries([]);
      }
    });
    return () => unsub();
  }, []);

  // 2. Profile & Monthly Archive List Subscriptions
  useEffect(() => {
    if (!user) return;
    setProfileLoaded(false);
    setErrorBanner(null);

    const unsubProfile = subscribeUserProfile(
      user.uid,
      (loadedProfile) => {
        setProfile(loadedProfile);
        setProfileLoaded(true);
      },
      (err) => {
        setErrorBanner(err.message);
        setProfileLoaded(true);
      }
    );

    const unsubArchives = subscribeMonthlyArchives(
      user.uid,
      (list) => setArchives(list),
      (err) => setErrorBanner(err.message)
    );

    return () => {
      unsubProfile();
      unsubArchives();
    };
  }, [user]);

  // 3. Active Month Entries Subscription
  useEffect(() => {
    if (!user) return;
    setEntriesLoading(true);
    const unsubEntries = subscribeMonthEntries(
      user.uid,
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
    return () => unsubEntries();
  }, [user, activeMonthKey]);

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

  const handleLoginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleSaveProfile = async (
    data: Omit<SppgUserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user || !user.email) return;
    await saveUserProfile(user.uid, user.email, data);
  };

  const handleSaveEntry = async (payload: {
    entryId?: string;
    dateIso: string;
    hariKe: number;
    namaMenu: string;
    photoDataUrl: string;
  }) => {
    if (!user) return;
    await upsertDailyMenuEntry(user.uid, activeMonthKey, payload);
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    await deleteDailyMenuEntry(user.uid, activeMonthKey, entryId);
  };

  const handleAutoRenumber = async () => {
    if (!user || entries.length === 0) return;
    await renumberMonthEntriesChronologically(user.uid, activeMonthKey, entries);
  };

  const handleDownloadPdf = () => {
    if (!profile) return;
    exportRekapanToF4Pdf({
      profile,
      monthKey: activeMonthKey,
      entries,
      orientation: pdfOrientation,
      includeYearInPeriod,
    });
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500">Memuat sesi akun...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginWithGoogle={handleLoginWithGoogle} />;
  }

  // Wait for initial profile fetch
  if (!profileLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500">
          Menyiapkan dashboard untuk {user.email}...
        </div>
      </div>
    );
  }

  // If first-time email login without SPPG profile yet, show clean onboarding setup
  if (!profile) {
    const draft = getDefaultProfileDraft(user.uid, user.email || '');
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-6">
            <span className="font-display text-lg font-bold text-slate-900">
              Rekapan Menu SPPG
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-600">{user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="h-3.5 w-3.5" />
                Ganti Email
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">
          <SppgProfileForm
            profile={draft}
            isFirstTime={true}
            onSave={handleSaveProfile}
          />
        </main>
      </div>
    );
  }

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode }> = [
    { id: 'rekapan', label: 'Tabel Rekapan & PDF', icon: <FileSpreadsheet className="h-4 w-4" /> },
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

        {/* Active Email Account Box */}
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <UserCheck className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">Email Aktif Dashboard</div>
              <div className="truncate text-xs font-semibold text-slate-900" title={user.email || ''}>
                {user.email}
              </div>
              <div className="font-mono-num mt-0.5 text-[11px] text-slate-500">
                ID: {profile.idSppg}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Ganti Email / Keluar
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
                <span>{user.email}</span>
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
              disabled={entries.length === 0}
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
              <span className="text-xs text-slate-600 truncate">{user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-medium text-red-600"
              >
                Keluar
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

          {/* Month & F4 Settings Strip (visible on rekapan & kalender) */}
          {(activeTab === 'rekapan' || activeTab === 'kalender') && (
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

              {/* PDF & Table Controls */}
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
            </div>
          )}

          {/* Tab Views */}
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
              uid={user.uid}
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
    </div>
  );
}
