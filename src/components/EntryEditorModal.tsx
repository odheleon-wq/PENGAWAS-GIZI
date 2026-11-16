import React, { useRef, useState } from 'react';
import { Camera, Crop, Save, Trash2, Upload, X } from 'lucide-react';
import type { DailyMenuEntry } from '../types';
import { formatIndonesianFullDate } from '../utils/dateUtils';
import { PhotoCropModal } from './PhotoCropModal';

interface EntryEditorModalProps {
  monthKey: string;
  initialDateIso: string;
  suggestedHariKe: number;
  existingEntry: DailyMenuEntry | null;
  onClose: () => void;
  onSave: (payload: {
    entryId?: string;
    dateIso: string;
    hariKe: number;
    namaMenu: string;
    photoDataUrl: string;
  }) => Promise<void>;
  onDelete?: (entryId: string) => Promise<void>;
}

export const EntryEditorModal: React.FC<EntryEditorModalProps> = ({
  monthKey,
  initialDateIso,
  suggestedHariKe,
  existingEntry,
  onClose,
  onSave,
  onDelete,
}) => {
  const [dateIso, setDateIso] = useState(existingEntry?.dateIso || initialDateIso);
  const [hariKe, setHariKe] = useState<number>(existingEntry?.hariKe || suggestedHariKe);
  const [namaMenu, setNamaMenu] = useState(existingEntry?.namaMenu || '');
  const [photoDataUrl, setPhotoDataUrl] = useState(existingEntry?.photoDataUrl || '');
  const [cropperState, setCropperState] = useState<{
    open: boolean;
    src: string | null;
    mode: 'crop' | 'camera';
  }>({ open: false, src: null, mode: 'crop' });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const monthMin = `${monthKey}-01`;
  const [yStr, mStr] = monthKey.split('-').map(Number);
  const lastDay = new Date(yStr, mStr, 0).getDate();
  const monthMax = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropperState({ open: true, src: reader.result, mode: 'crop' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!dateIso.startsWith(monthKey)) {
      setErrorMsg('Tanggal harus berada di dalam bulan arsip yang sedang dibuka.');
      return;
    }
    if (!namaMenu.trim()) {
      setErrorMsg('Nama menu tidak boleh kosong.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        entryId: existingEntry?.id,
        dateIso,
        hariKe: Math.max(1, Number(hariKe) || 1),
        namaMenu: namaMenu.trim(),
        photoDataUrl,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan menu harian.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!existingEntry || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(existingEntry.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus entri.');
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-label={existingEntry ? 'Ubah Menu Harian' : 'Tambah Menu Harian'}
      >
        <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 shrink-0">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {existingEntry ? 'Ubah Catatan Menu Harian' : 'Tambah Menu Harian'}
              </h3>
              <p className="text-xs text-slate-500">
                {formatIndonesianFullDate(dateIso)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hari / Tanggal
                </label>
                <input
                  type="date"
                  value={dateIso}
                  min={monthMin}
                  max={monthMax}
                  onChange={(e) => setDateIso(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Tercatat sebagai: <span className="font-medium text-slate-700">{formatIndonesianFullDate(dateIso)}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hari Ke
                </label>
                <input
                  type="number"
                  min={1}
                  max={366}
                  value={hariKe}
                  onChange={(e) => setHariKe(Number(e.target.value))}
                  required
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Menu
              </label>
              <textarea
                rows={3}
                value={namaMenu}
                onChange={(e) => setNamaMenu(e.target.value)}
                placeholder="Contoh: Nasi Putih, Telur Ceplok Saos, Tempe Bacem, Oseng Kol + Wortel, Semangka."
                required
                maxLength={1000}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            {/* Photo Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Foto Menu (Ukuran Serentak 3:2)
                </label>
                {photoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl('')}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Hapus Foto
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {photoDataUrl ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <img
                    src={photoDataUrl}
                    alt="Foto menu tersimpan"
                    className="h-28 w-42 rounded border border-slate-300 object-cover bg-white shrink-0"
                  />
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-slate-600">
                      Foto sudah dikrop presisi (rasio 3:2) agar tampil seragam dengan hari lainnya.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCropperState({ open: true, src: photoDataUrl, mode: 'crop' })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Crop className="h-3.5 w-3.5" />
                        Atur / Krop Ulang
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Ganti File
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCropperState({ open: true, src: null, mode: 'camera' })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Foto Ulang
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-emerald-600" />
                    Unggah Foto & Krop
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCropperState({ open: true, src: null, mode: 'camera' })
                    }
                    className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-medium text-slate-700 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
                  >
                    <Camera className="h-4 w-4 text-emerald-600" />
                    Foto Langsung (Kamera)
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              {existingEntry && onDelete ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDeleteClick}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Hari Ini
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan Menu'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {cropperState.open && (
        <PhotoCropModal
          initialImageSrc={cropperState.src}
          initialMode={cropperState.mode}
          onCancel={() => setCropperState({ open: false, src: null, mode: 'crop' })}
          onConfirm={(cropped) => {
            setPhotoDataUrl(cropped);
            setCropperState({ open: false, src: null, mode: 'crop' });
          }}
        />
      )}
    </>
  );
};
