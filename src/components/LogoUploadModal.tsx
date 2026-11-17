import React, { useEffect, useRef, useState } from 'react';
import { Check, Link2, RotateCcw, Sliders, Trash2, Upload, X } from 'lucide-react';
import { compressLogoDataUrl } from '../utils/logoResolver';

interface LogoUploadModalProps {
  open: boolean;
  title: string;
  side: 'left' | 'right';
  initialDataUrl: string;
  initialWidthPx: number;
  headerLine1?: string;
  headerLine2?: string;
  headerLine3?: string;
  allowSyncGlobal?: boolean;
  onClose: () => void;
  onApply: (result: {
    dataUrl: string;
    widthPx: number;
    syncAsGlobalBgn?: boolean;
  }) => void;
}

const WIDTH_PRESETS = [
  { label: 'Kecil (40px)', value: 40 },
  { label: 'Standar (56px)', value: 56 },
  { label: 'Sedang (72px)', value: 72 },
  { label: 'Besar (96px)', value: 96 },
];

export const LogoUploadModal: React.FC<LogoUploadModalProps> = ({
  open,
  title,
  side,
  initialDataUrl,
  initialWidthPx,
  headerLine1 = 'BADAN GIZI NASIONAL',
  headerLine2 = 'SATUAN PELAYANAN PEMENUHAN GIZI',
  headerLine3 = 'SPPG',
  allowSyncGlobal = false,
  onClose,
  onApply,
}) => {
  const [previewUrl, setPreviewUrl] = useState(initialDataUrl);
  const [widthPx, setWidthPx] = useState(initialWidthPx || 56);
  const [syncGlobal, setSyncGlobal] = useState(side === 'left' && allowSyncGlobal);
  const [loadingImg, setLoadingImg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPreviewUrl(initialDataUrl || '');
      setWidthPx(
        Number.isFinite(initialWidthPx) && initialWidthPx > 0
          ? Math.max(24, Math.min(150, Math.round(initialWidthPx)))
          : 56
      );
      setSyncGlobal(side === 'left' && allowSyncGlobal);
      setErrorMsg(null);
    }
  }, [open, initialDataUrl, initialWidthPx, side, allowSyncGlobal]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingImg(true);
    setErrorMsg(null);
    try {
      const compressed = await compressLogoDataUrl(file, 260);
      setPreviewUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    } finally {
      setLoadingImg(false);
    }
    e.target.value = '';
  };

  const handleConfirm = () => {
    onApply({
      dataUrl: previewUrl,
      widthPx: Math.max(24, Math.min(150, Math.round(widthPx))),
      syncAsGlobalBgn: syncGlobal,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">
              Unggah gambar lalu atur ukuran lebar logo (px) sebelum diterapkan ke dokumen &amp; PDF F4.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Upload Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={loadingImg}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {loadingImg ? 'Memproses...' : previewUrl ? 'Ganti File Logo' : 'Pilih File Gambar Logo'}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewUrl('')}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Logo
                </button>
              )}
            </div>
            <span className="font-mono-num text-xs font-semibold text-slate-600">
              Lebar aktif: {widthPx}px
            </span>
          </div>

          {/* Width Slider & Presets */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Sliders className="h-3.5 w-3.5 text-emerald-600" />
                Atur Ukuran Lebar Logo Sebelum Diterapkan
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={24}
                  max={150}
                  value={widthPx}
                  onChange={(e) =>
                    setWidthPx(Math.max(24, Math.min(150, Number(e.target.value) || 56)))
                  }
                  className="font-mono-num w-16 rounded border border-slate-300 bg-white px-2 py-1 text-center text-xs font-semibold"
                />
                <span className="text-xs text-slate-500">px</span>
                <button
                  type="button"
                  onClick={() => setWidthPx(56)}
                  className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:text-slate-800"
                  title="Reset ke 56px"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={24}
              max={150}
              step={2}
              value={widthPx}
              onChange={(e) => setWidthPx(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {WIDTH_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setWidthPx(p.value)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    widthPx === p.value
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Kop Preview Box */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Pratinjau Kop Dokumen (Skala Proporsional)
            </div>
            <div className="relative rounded-lg border border-black bg-white px-4 py-3 min-h-[78px] flex flex-col justify-center text-center">
              {side === 'left' && previewUrl && (
                <img
                  src={previewUrl}
                  alt="Pratinjau Logo Kiri"
                  style={{ width: `${widthPx}px`, height: 'auto', maxHeight: '76px' }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              {side === 'left' && !previewUrl && (
                <div
                  style={{ width: `${widthPx}px`, height: `${widthPx}px`, maxHeight: '72px' }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-400 flex items-center justify-center text-[10px] font-bold text-slate-400"
                >
                  BGN
                </div>
              )}

              {side === 'right' && previewUrl && (
                <img
                  src={previewUrl}
                  alt="Pratinjau Logo Kanan"
                  style={{ width: `${widthPx}px`, height: 'auto', maxHeight: '76px' }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
              {side === 'right' && !previewUrl && (
                <div
                  style={{ width: `${widthPx}px`, height: `${widthPx}px`, maxHeight: '72px' }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-400 flex items-center justify-center text-[10px] font-bold text-slate-400"
                >
                  KANAN
                </div>
              )}

              <div className="px-16">
                <div className="text-[11px] font-bold uppercase text-black">{headerLine1}</div>
                <div className="text-[11px] font-bold uppercase text-black">{headerLine2}</div>
                <div className="text-[10px] font-bold uppercase text-black">{headerLine3}</div>
              </div>
            </div>
          </div>

          {allowSyncGlobal && side === 'left' && (
            <label className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                checked={syncGlobal}
                onChange={(e) => setSyncGlobal(e.target.checked)}
                className="mt-0.5 rounded border-emerald-400 accent-emerald-600"
              />
              <span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Link2 className="h-3.5 w-3.5" />
                  Terapkan juga ke seluruh lembar kerja terpilih (Logo Pusat BGN)
                </span>
                <span className="block text-[11px] text-emerald-700 mt-0.5">
                  Jika dicentang, perubahan logo kiri &amp; ukurannya otomatis menyinkronkan ke semua form yang terhubung.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Check className="h-3.5 w-3.5" />
            Terapkan Logo ({widthPx}px)
          </button>
        </div>
      </div>
    </div>
  );
};
