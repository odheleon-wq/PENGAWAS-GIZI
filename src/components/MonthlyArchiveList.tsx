import React, { useState } from 'react';
import { Archive, Download, FolderOpen, Plus } from 'lucide-react';
import type { MonthlyArchive, PdfOrientation, SppgUserProfile } from '../types';
import { getPeriodeDisplayName } from '../utils/dateUtils';
import { fetchMonthEntriesOnce } from '../services/sppgService';
import { exportRekapanToF4Pdf } from '../utils/pdfExporter';

interface MonthlyArchiveListProps {
  uid: string;
  profile: SppgUserProfile;
  archives: MonthlyArchive[];
  activeMonthKey: string;
  pdfOrientation: PdfOrientation;
  includeYearInPeriod: boolean;
  onOpenMonth: (monthKey: string) => void;
  onCreateMonthArchive: (monthKey: string) => void;
}

export const MonthlyArchiveList: React.FC<MonthlyArchiveListProps> = ({
  uid,
  profile,
  archives,
  activeMonthKey,
  pdfOrientation,
  includeYearInPeriod,
  onOpenMonth,
  onCreateMonthArchive,
}) => {
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [newMonthInput, setNewMonthInput] = useState(activeMonthKey);

  const handleQuickDownload = async (monthKey: string) => {
    setDownloadingMonth(monthKey);
    try {
      const entries = await fetchMonthEntriesOnce(uid, monthKey);
      exportRekapanToF4Pdf({
        profile,
        monthKey,
        entries,
        orientation: pdfOrientation,
        includeYearInPeriod,
      });
    } finally {
      setDownloadingMonth(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Arsip Rekapan Per Bulan
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Setiap bulan tersimpan terpisah khusus untuk akun {profile.email}. Anda dapat membuka kembali atau mengunduh PDF F4 arsip bulan lampau kapan saja.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="month"
            value={newMonthInput}
            onChange={(e) => setNewMonthInput(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => newMonthInput && onCreateMonthArchive(newMonthInput)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Buka Bulan Ini
          </button>
        </div>
      </div>

      {archives.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
          <Archive className="mx-auto mb-3 h-9 w-9 text-slate-300" />
          <p className="text-sm font-semibold text-slate-800">Belum Ada Arsip Bulanan Tersimpan</p>
          <p className="mt-1 text-xs text-slate-500">
            Mulai isi menu harian pada bulan aktif, maka arsip per satu bulan akan otomatis terbentuk di sini.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-5 py-3">Periode Bulan</th>
                <th className="px-5 py-3">Kode Arsip</th>
                <th className="px-5 py-3 text-right">Hari Terisi</th>
                <th className="px-5 py-3 text-right">Foto Siap</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {archives.map((item) => {
                const isActive = item.monthKey === activeMonthKey;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {getPeriodeDisplayName(item.monthKey)}
                      {isActive && (
                        <span className="ml-2 text-xs font-normal text-emerald-700">
                          · Sedang dibuka
                        </span>
                      )}
                    </td>
                    <td className="font-mono-num px-5 py-3.5 text-xs text-slate-500">
                      {item.monthKey}
                    </td>
                    <td className="font-mono-num px-5 py-3.5 text-right text-slate-800">
                      {item.entryCount} hari
                    </td>
                    <td className="font-mono-num px-5 py-3.5 text-right text-slate-800">
                      {item.photoCount} / {item.entryCount}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenMonth(item.monthKey)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Lihat Arsip
                        </button>
                        <button
                          type="button"
                          disabled={downloadingMonth === item.monthKey || item.entryCount === 0}
                          onClick={() => handleQuickDownload(item.monthKey)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {downloadingMonth === item.monthKey ? 'Membuat PDF...' : 'Unduh PDF F4'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
