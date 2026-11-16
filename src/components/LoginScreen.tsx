import React, { useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  LogIn,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';

interface LoginScreenProps {
  onLoginWithGoogle: () => Promise<void>;
}

interface AuthErrorGuide {
  code: string;
  title: string;
  summary: string;
  steps: string[];
  showDomainTools?: boolean;
}

function resolveAuthErrorGuide(err: unknown): AuthErrorGuide {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('auth/unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      title: 'Domain Belum Diizinkan di Firebase',
      summary: `Domain "${currentHost || 'saat ini'}" belum terdaftar pada daftar Authorized domains di Firebase Authentication.`,
      showDomainTools: true,
      steps: [
        `Buka Firebase Console pada project "${firebaseConfig.projectId}" menggunakan akun Google pemilik project.`,
        'Masuk ke menu Authentication → Settings → Authorized domains.',
        `Klik "Add domain", ketik "${currentHost || 'pengawasgizi.vercel.app'}" tanpa https://, lalu klik Add.`,
        'Muat ulang halaman ini (Refresh), lalu klik tombol masuk kembali.',
      ],
    };
  }

  if (code === 'auth/popup-blocked' || rawMessage.includes('auth/popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      title: 'Pop-up Login Diblokir oleh Browser',
      summary: 'Browser menahan jendela pemilihan akun Google sehingga proses masuk tidak dapat dilanjutkan.',
      steps: [
        'Klik ikon pop-up terblokir di ujung kanan bilah alamat browser, lalu pilih "Selalu izinkan pop-up" untuk situs ini.',
        'Jika Anda membuka tautan dari dalam WhatsApp, Telegram, atau aplikasi media sosial, salin tautan lalu buka langsung di browser Chrome atau Safari.',
        'Setelah izin pop-up aktif, klik tombol "Masuk dengan Email Aktif (Google)" kembali.',
      ],
    };
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    rawMessage.includes('auth/popup-closed-by-user') ||
    rawMessage.includes('auth/cancelled-popup-request')
  ) {
    return {
      code: code || 'auth/popup-closed-by-user',
      title: 'Jendela Pemilihan Akun Ditutup',
      summary: 'Proses autentikasi dibatalkan sebelum akun Google selesai dipilih.',
      steps: [
        'Klik kembali tombol "Masuk dengan Email Aktif (Google)" dan tunggu hingga daftar email Google muncul.',
        'Jangan menutup atau me-refresh jendela pop-up sebelum halaman dashboard SPPG terbuka.',
      ],
    };
  }

  if (code === 'auth/network-request-failed' || rawMessage.includes('auth/network-request-failed')) {
    return {
      code: 'auth/network-request-failed',
      title: 'Koneksi Jaringan ke Server Autentikasi Gagal',
      summary: 'Browser gagal terhubung ke layanan Google / Firebase Authentication.',
      steps: [
        'Pastikan perangkat terhubung ke jaringan Wi-Fi atau data seluler yang stabil.',
        'Nonaktifkan sementara VPN, DNS privat ketat, atau ekstensi pemblokir skrip/iklan yang dapat menahan koneksi ke googleapis.com.',
        'Muat ulang halaman ini lalu coba masuk kembali.',
      ],
    };
  }

  if (code === 'auth/operation-not-allowed' || rawMessage.includes('auth/operation-not-allowed')) {
    return {
      code: 'auth/operation-not-allowed',
      title: 'Provider Login Google Belum Aktif',
      summary: 'Metode masuk dengan Google belum diaktifkan pada konfigurasi Firebase project.',
      steps: [
        `Buka Firebase Console untuk project "${firebaseConfig.projectId}".`,
        'Masuk ke Authentication → Sign-in method → pilih Google → aktifkan toggle Enable → isi Project support email → klik Save.',
        'Muat ulang halaman dan coba masuk kembali.',
      ],
    };
  }

  if (code === 'auth/user-disabled' || rawMessage.includes('auth/user-disabled')) {
    return {
      code: 'auth/user-disabled',
      title: 'Akses Akun Email Dinonaktifkan',
      summary: 'Akun email ini berstatus nonaktif di Firebase Authentication project.',
      steps: [
        'Silakan pilih email aktif Google lainnya untuk masuk ke dashboard SPPG.',
        'Atau hubungi admin project Firebase untuk mengaktifkan kembali akun di menu Authentication → Users.',
      ],
    };
  }

  return {
    code: code || 'auth/unknown',
    title: 'Gagal Masuk dengan Email Aktif',
    summary:
      rawMessage || 'Terjadi kendala saat menghubungkan akun Google Anda ke dashboard SPPG.',
    steps: [
      'Pastikan pop-up browser diizinkan untuk situs ini dan koneksi internet stabil.',
      'Jika dibuka melalui domain baru (misalnya Vercel atau domain kustom), pastikan domain tersebut sudah ditambahkan di Firebase Console → Authentication → Settings → Authorized domains.',
      'Coba muat ulang halaman atau buka melalui browser Chrome/Safari terbaru.',
    ],
  };
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginWithGoogle }) => {
  const [loading, setLoading] = useState(false);
  const [errorGuide, setErrorGuide] = useState<AuthErrorGuide | null>(null);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

  const handleLogin = async () => {
    setErrorGuide(null);
    setLoading(true);
    try {
      await onLoginWithGoogle();
    } catch (err) {
      setErrorGuide(resolveAuthErrorGuide(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // Fallback for restricted clipboard permissions
      setCopiedHost(false);
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Masuk ke Dashboard SPPG</h2>
                  <p className="text-xs text-slate-500">Gunakan email aktif Google masing-masing</p>
                </div>
              </div>

              {errorGuide && (
                <div
                  role="alert"
                  className="mb-5 rounded-lg border border-red-200 bg-red-50/90 p-4 text-xs text-red-900 space-y-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600 shrink-0" />
                    <div className="space-y-1 min-w-0">
                      <div className="font-semibold text-red-900">{errorGuide.title}</div>
                      <p className="leading-relaxed text-red-800">{errorGuide.summary}</p>
                    </div>
                  </div>

                  <div className="border-t border-red-200/80 pt-2.5 space-y-1.5">
                    <div className="font-semibold text-red-900">Langkah Mengatasi:</div>
                    <ol className="list-decimal pl-4 space-y-1 text-red-800 leading-relaxed">
                      {errorGuide.steps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  {errorGuide.showDomainTools && currentHost && (
                    <div className="border-t border-red-200/80 pt-2.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyHost()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100/60 transition-colors"
                      >
                        {copiedHost ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            Domain Disalin ({currentHost})
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Salin Domain: {currentHost}
                          </>
                        )}
                      </button>
                      <a
                        href={firebaseAuthSettingsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100/60 transition-colors"
                      >
                        Buka Firebase Console
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
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

              <div className="mt-5 border-t border-slate-100 pt-4 space-y-3 text-xs leading-relaxed text-slate-500">
                <p>
                  Sistem akan menampilkan pemilih akun Google agar Anda bisa memilih email aktif yang berbeda untuk setiap unit SPPG.
                </p>

                <button
                  type="button"
                  onClick={() => setShowHelpPanel((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  <span>Panduan jika mengalami kendala login</span>
                  {showHelpPanel ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>

                {showHelpPanel && (
                  <div className="border-t border-slate-100 pt-3 space-y-2.5 text-slate-600">
                    <div>
                      <div className="font-semibold text-slate-800">
                        1. Error Domain Tidak Diizinkan (Vercel / Domain Kustom)
                      </div>
                      <p className="mt-0.5">
                        Tambahkan domain{' '}
                        <span className="font-mono tabular-nums text-slate-800">
                          {currentHost || 'domain-anda.vercel.app'}
                        </span>{' '}
                        ke menu{' '}
                        <span className="font-medium text-slate-800">
                          Firebase Console → Authentication → Settings → Authorized domains
                        </span>
                        .
                      </p>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">
                        2. Pop-up Akun Google Tidak Muncul / Diblokir
                      </div>
                      <p className="mt-0.5">
                        Izinkan pop-up pada pengaturan browser, dan hindari membuka tautan dari browser internal aplikasi (seperti WhatsApp); buka langsung di Chrome atau Safari.
                      </p>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">
                        3. Koneksi Terputus atau Diblokir Ekstensi
                      </div>
                      <p className="mt-0.5">
                        Pastikan internet stabil dan nonaktifkan sementara VPN atau pemblokir skrip yang menghalangi domain autentikasi Google.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
