import React, { useState } from 'react';
import { CalendarDays, Camera, FileSpreadsheet, Lock, LogIn } from 'lucide-react';

interface LoginScreenProps {
  onLoginWithGoogle: () => Promise<void>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginWithGoogle }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await onLoginWithGoogle();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Login dibatalkan atau terjadi kendala saat masuk dengan email aktif.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Rekapan Menu SPPG
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            Arsip Bulanan · Foto Serentak · PDF F4 Presisi
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-12">
        <div className="grid w-full grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Pitch */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                Dashboard Terpisah Per Email Aktif
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                Catat menu harian SPPG, arsipkan per bulan, dan cetak PDF ukuran F4 secara presisi.
              </h1>
              <p className="text-sm sm:text-base leading-relaxed text-slate-600 max-w-2xl">
                Setiap pengguna masuk menggunakan email aktif masing-masing. Identitas SPPG, daftar menu harian, foto ompreng yang dikrop serentak, dan seluruh riwayat arsip bulanan tersimpan terpisah untuk setiap akun email.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <Lock className="mb-2.5 h-5 w-5 text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900">Dashboard Terpisah</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Masing-masing email aktif memiliki ruang kerja, kop SPPG, dan arsip sendiri.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <Camera className="mb-2.5 h-5 w-5 text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900">Foto Rapi Serentak</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Unggah atau foto langsung lalu krop dengan rasio 3:2 seragam di seluruh baris.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <CalendarDays className="mb-2.5 h-5 w-5 text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900">Arsip Tiap Bulan & F4</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Lihat kembali tanggal lampau yang terlewat dan unduh PDF F4 otomatis.
                </p>
              </div>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-xs">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Masuk ke Dashboard SPPG</h2>
                  <p className="text-xs text-slate-500">Gunakan email aktif Google masing-masing</p>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handleLogin}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {loading ? 'Membuka Pilihan Email...' : 'Masuk dengan Email Aktif (Google)'}
              </button>

              <div className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
                Sistem akan menampilkan pemilih akun Google agar Anda bisa memilih email aktif yang berbeda untuk setiap unit SPPG.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
