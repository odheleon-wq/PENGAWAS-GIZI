import React from 'react';
import { CalendarPlus, Edit3, ImagePlus, Trash2 } from 'lucide-react';
import type { DailyMenuEntry, SppgUserProfile } from '../types';
import { formatIndonesianFullDate, getPeriodeLabel, parseMonthKey } from '../utils/dateUtils';
import { resolveDocumentLogos } from '../utils/logoResolver';

interface RekapanTablePreviewProps {
  profile: SppgUserProfile;
  monthKey: string;
  entries: DailyMenuEntry[];
  includeYearInPeriod: boolean;
  onEditEntry: (entry: DailyMenuEntry) => void;
  onDeleteEntry: (entry: DailyMenuEntry) => void;
  onAddNewEntry: () => void;
}

export const RekapanTablePreview: React.FC<RekapanTablePreviewProps> = ({
  profile,
  monthKey,
  entries,
  includeYearInPeriod,
  onEditEntry,
  onDeleteEntry,
  onAddNewEntry,
}) => {
  const { year, month } = parseMonthKey(monthKey);
  const periodeText = getPeriodeLabel(year, month, includeYearInPeriod);
  const resolvedLogos = resolveDocumentLogos(profile, 'rekapan');
  const sortedEntries = [...entries].sort(
    (a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso)
  );

  const metaRows: Array<[string, string]> = [
    ['Nama SPPG', profile.namaSppg || 'Belum diisi'],
    ['ID SPPG', profile.idSppg || 'Belum diisi'],
    ['Alamat', profile.alamat || 'Belum diisi'],
    ['Kab/Kota', profile.kabKota || 'Belum diisi'],
    ['Provinsi', profile.provinsi || 'Belum diisi'],
    ['Nama SPPI/AG', profile.namaSppi || 'Belum diisi'],
    ['Nomor Handphone', profile.nomorHp || 'Belum diisi'],
    ['Periode/Bulan', periodeText],
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <div className="overflow-x-auto p-4 sm:p-6">
        <div className="min-w-[940px] border border-black bg-white text-black">
          {(resolvedLogos.leftUrl || resolvedLogos.rightUrl) && (
            <div className="relative border-b border-black bg-white px-4 py-2.5 text-center min-h-[72px] flex flex-col justify-center">
              {resolvedLogos.leftUrl && (
                <img
                  src={resolvedLogos.leftUrl}
                  alt="Logo Kiri"
                  style={{ width: `${resolvedLogos.leftWidthPx}px`, height: 'auto', maxHeight: '68px' }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              {resolvedLogos.rightUrl && (
                <img
                  src={resolvedLogos.rightUrl}
                  alt="Logo Kanan"
                  style={{ width: `${resolvedLogos.rightWidthPx}px`, height: 'auto', maxHeight: '68px' }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              <div className="px-20">
                <div className="text-[11px] font-bold uppercase text-black">BADAN GIZI NASIONAL</div>
                <div className="text-[11px] font-bold uppercase text-black">
                  SATUAN PELAYANAN PEMENUHAN GIZI
                </div>
                <div className="text-[11px] font-bold uppercase text-black">
                  {profile.namaSppg || 'SPPG'}
                </div>
              </div>
            </div>
          )}

          {/* Top Vibrant Green Header Banner (#00B050) */}
          <div
            style={{ backgroundColor: '#00B050' }}
            className="border-b border-black px-4 py-2 text-center text-[15px] font-bold tracking-wide text-black uppercase"
          >
            {(profile.reportTitle || 'REKAPAN MENU SMP').toUpperCase()}
          </div>

          {/* SPPG Metadata Block */}
          <div className="border-b border-black bg-white px-2.5 py-2 text-[12.5px] leading-[1.45] font-bold text-black">
            {metaRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[240px_14px_1fr] items-baseline">
                <span>{label}</span>
                <span>:</span>
                <span className="break-words">{value}</span>
              </div>
            ))}
          </div>

          {/* Main Rekapan Table */}
          <table className="w-full border-collapse text-[12px] text-black">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  style={{ backgroundColor: '#EA4335' }}
                  className="w-[56px] border-r border-b border-black px-2 py-1.5 text-center font-bold leading-tight"
                >
                  Hari
                  <br />
                  Ke
                </th>
                <th
                  colSpan={2}
                  style={{ backgroundColor: '#EA4335' }}
                  className="border-r border-b border-black px-2 py-1 text-center font-bold"
                >
                  IDENTITAS SPPG
                </th>
                <th
                  rowSpan={2}
                  style={{ backgroundColor: '#8AB4F8' }}
                  className="w-[175px] border-r border-b border-black px-2 py-1.5 text-center font-bold"
                >
                  Hari / Tanggal
                </th>
                <th
                  rowSpan={2}
                  style={{ backgroundColor: '#8AB4F8' }}
                  className="border-r border-b border-black px-3 py-1.5 text-center font-bold"
                >
                  Nama Menu
                </th>
                <th
                  rowSpan={2}
                  style={{ backgroundColor: '#8AB4F8' }}
                  className="w-[196px] border-r border-b border-black px-2 py-1.5 text-center font-bold"
                >
                  FOTO MENU
                </th>
                <th
                  rowSpan={2}
                  className="w-[82px] border-b border-black bg-slate-100 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-600"
                >
                  Aksi
                </th>
              </tr>
              <tr>
                <th
                  style={{ backgroundColor: '#EA4335' }}
                  className="w-[240px] border-r border-b border-black px-2 py-1 text-center font-bold"
                >
                  Nama SPPG
                </th>
                <th
                  style={{ backgroundColor: '#EA4335' }}
                  className="w-[90px] border-r border-b border-black px-2 py-1 text-center font-bold"
                >
                  ID SPPG
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <CalendarPlus className="mb-2.5 h-8 w-8 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-800">
                        Belum ada catatan menu pada bulan {periodeText}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Tambahkan menu harian beserta foto ompreng yang dikrop serentak, atau pilih tanggal dari Kalender Arsip.
                      </p>
                      <button
                        type="button"
                        onClick={onAddNewEntry}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Tambah Menu Pertama
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={`group transition-colors hover:bg-emerald-50/40 ${
                      idx === sortedEntries.length - 1 ? '' : 'border-b border-black'
                    }`}
                  >
                    <td className="font-mono-num border-r border-black px-2 py-2 text-center font-medium align-middle">
                      {entry.hariKe}
                    </td>
                    <td className="border-r border-black px-2.5 py-2 text-left align-middle">
                      {profile.namaSppg || '-'}
                    </td>
                    <td className="border-r border-black px-2 py-2 text-center align-middle font-mono-num">
                      {profile.idSppg || '-'}
                    </td>
                    <td className="border-r border-black px-2.5 py-2 text-left align-middle">
                      {formatIndonesianFullDate(entry.dateIso)}
                    </td>
                    <td className="border-r border-black px-2.5 py-2 text-left align-middle leading-snug whitespace-pre-line">
                      {entry.namaMenu}
                    </td>
                    <td className="border-r border-black p-1.5 text-center align-middle">
                      {entry.photoDataUrl ? (
                        <div className="mx-auto w-[174px] h-[116px] overflow-hidden border border-slate-700 bg-white">
                          <img
                            src={entry.photoDataUrl}
                            alt={`Foto menu ${formatIndonesianFullDate(entry.dateIso)}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEditEntry(entry)}
                          className="mx-auto flex h-[116px] w-[174px] flex-col items-center justify-center gap-1 border border-dashed border-slate-400 bg-slate-50 text-[11px] font-medium text-slate-600 hover:border-emerald-600 hover:text-emerald-700"
                        >
                          <ImagePlus className="h-4 w-4" />
                          Unggah / Foto
                        </button>
                      )}
                    </td>
                    <td className="bg-slate-50/60 px-2 py-2 text-center align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditEntry(entry)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
                          title="Ubah menu atau foto"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-red-400 hover:text-red-600"
                          title="Hapus baris"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {sortedEntries.length > 0 && (
            <div className="border-t border-black bg-slate-50 px-3 py-2.5 flex items-center justify-between">
              <span className="font-mono-num text-xs text-slate-600">
                Total: {sortedEntries.length} baris menu
              </span>
              <button
                type="button"
                onClick={onAddNewEntry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Tambah Baris Menu di Bawah
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
