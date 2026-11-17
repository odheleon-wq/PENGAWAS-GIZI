import React from 'react';
import {
  Ban,
  CalendarClock,
  Clock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { UserAccessRecord } from '../types';
import {
  formatAccessDateTimeLabel,
  formatShortDateId,
  type EffectiveAccessState,
} from '../services/adminAccessService';

interface WaitingApprovalScreenProps {
  email: string;
  displayName: string;
  accessRecord: UserAccessRecord | null;
  effectiveState: EffectiveAccessState;
  onLogout: () => Promise<void>;
  onRetrySync: () => Promise<void>;
}

export const WaitingApprovalScreen: React.FC<WaitingApprovalScreenProps> = ({
  email,
  displayName,
  accessRecord,
  effectiveState,
  onLogout,
  onRetrySync,
}) => {
  const [retrying, setRetrying] = React.useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetrySync();
    } finally {
      setRetrying(false);
    }
  };

  const isExpired = effectiveState === 'expired';
  const isBlocked = effectiveState === 'blocked';
  const isScheduled = effectiveState === 'scheduled';

  let heading = 'Akun Dalam Daftar Tunggu Admin Odhe Gizi';
  let subtitle =
    'Email pribadi Anda telah terdeteksi otomatis di sistem Portal Pengawas Gizi dan masuk ke Daftar Tunggu. Hubungi Admin Odhe Gizi untuk proses ACC agar seluruh menu dashboard terbuka.';
  let statusText = 'Daftar Tunggu — Menunggu ACC Admin Odhe Gizi';
  let statusBorder = 'border-amber-200 bg-amber-50 text-amber-900';
  let iconNode = <Clock className="h-5 w-5 text-amber-700 shrink-0" />;

  if (isExpired) {
    heading = 'Masa Berlaku Login Telah Berakhir';
    subtitle = `Akses dashboard untuk akun ini berakhir pada ${formatShortDateId(
      accessRecord?.accessExpiresAt
    )}. Silakan hubungi Admin Odhe Gizi untuk memperpanjang tanggal berakhir login Anda.`;
    statusText = `Kedaluwarsa per ${formatShortDateId(accessRecord?.accessExpiresAt)}`;
    statusBorder = 'border-red-200 bg-red-50 text-red-900';
    iconNode = <CalendarClock className="h-5 w-5 text-red-700 shrink-0" />;
  } else if (isBlocked) {
    heading = 'Akses Akun Dinonaktifkan';
    subtitle =
      'Akses email ini sedang dinonaktifkan oleh Admin Odhe Gizi. Hubungi Admin apabila Anda memerlukan pengaktifan kembali.';
    statusText = 'Akses Diblokir oleh Admin';
    statusBorder = 'border-red-200 bg-red-50 text-red-900';
    iconNode = <Ban className="h-5 w-5 text-red-700 shrink-0" />;
  } else if (isScheduled) {
    heading = 'Akses Login Belum Memasuki Tanggal Aktif';
    subtitle = `Akun Anda telah di-ACC, namun dijadwalkan mulai aktif pada ${formatShortDateId(
      accessRecord?.accessStartDate
    )}.`;
    statusText = `Aktif Mulai ${formatShortDateId(accessRecord?.accessStartDate)}`;
    statusBorder = 'border-slate-200 bg-slate-100 text-slate-900';
    iconNode = <ShieldAlert className="h-5 w-5 text-slate-700 shrink-0" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Rekapan Menu SPPG
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            Ganti Akun Email
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${statusBorder}`}>
            {iconNode}
            <div className="min-w-0">
              <div className="text-xs font-bold">{statusText}</div>
              {accessRecord?.waitingNote && (
                <p className="mt-0.5 text-xs opacity-90">{accessRecord.waitingNote}</p>
              )}
            </div>
          </div>

          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 text-balance">
              {heading}
            </h1>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-600">
              {subtitle}
            </p>
          </div>

          {/* Account Detection Details */}
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/70 text-xs">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-500">Email Aktif Terdeteksi</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 break-all text-right">
                <Mail className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                {email || '-'}
              </span>
            </div>
            {displayName && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-slate-500">Nama Akun</span>
                <span className="font-medium text-slate-900 text-right">{displayName}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-500">Tanggal Login Pertama</span>
              <span className="font-mono-num text-slate-900">
                {formatAccessDateTimeLabel(accessRecord?.firstLoginAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-500">Percobaan Login Terakhir</span>
              <span className="font-mono-num text-slate-900">
                {formatAccessDateTimeLabel(accessRecord?.lastLoginAt)}
                {accessRecord?.loginCount ? ` · ${accessRecord.loginCount}x masuk` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-500">Tanggal Berakhir Login</span>
              <span className="font-mono-num font-semibold text-slate-900">
                {accessRecord?.accessExpiresAt
                  ? formatShortDateId(accessRecord.accessExpiresAt)
                  : 'Belum ditetapkan Admin'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Memeriksa Status...' : 'Periksa Status ACC Sekarang'}
            </button>
            <span className="text-[11px] text-slate-500">
              Halaman ini otomatis membuka dashboard begitu Admin Odhe Gizi melakukan ACC.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};
