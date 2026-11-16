import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Loader2,
  ScanLine,
  Sparkles,
  Thermometer,
  Upload,
  X,
} from 'lucide-react';
import type {
  DetectedTemperatureResult,
  TempDayReading,
  TempMonitoringRoom,
} from '../types';

interface TempPhotoDetectModalProps {
  room: TempMonitoringRoom;
  initialDay: number;
  existingReading?: TempDayReading | null;
  defaultOfficerName: string;
  onClose: () => void;
  onSaveDayReading: (payload: {
    day: number;
    jam: string;
    suhu: string;
    rh: string;
    paraf: string;
    namaPetugas: string;
    photoDataUrl?: string;
    detectedNote?: string;
  }) => Promise<void>;
}

function getCurrentTimeDot(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}.${mm}`;
}

async function compressImageDataUrl(
  sourceDataUrl: string,
  maxDim: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas tidak tersedia.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Gagal memproses file gambar.'));
    img.src = sourceDataUrl;
  });
}

export const TempPhotoDetectModal: React.FC<TempPhotoDetectModalProps> = ({
  room,
  initialDay,
  existingReading,
  defaultOfficerName,
  onClose,
  onSaveDayReading,
}) => {
  const [day, setDay] = useState<number>(initialDay);
  const [jam, setJam] = useState<string>(existingReading?.jam || getCurrentTimeDot());
  const [suhu, setSuhu] = useState<string>(existingReading?.suhu || '');
  const [rh, setRh] = useState<string>(existingReading?.rh || '');
  const [paraf, setParaf] = useState<string>(existingReading?.paraf || '✓');
  const [namaPetugas, setNamaPetugas] = useState<string>(
    existingReading?.namaPetugas || defaultOfficerName
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string>(
    existingReading?.photoDataUrl || ''
  );
  const [detectedNote, setDetectedNote] = useState<string>(
    existingReading?.detectedNote || ''
  );

  const [autoFillAndSave, setAutoFillAndSave] = useState<boolean>(true);
  const [detecting, setDetecting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState<DetectedTemperatureResult | null>(null);

  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const runDetectionOnImage = async (rawDataUrl: string) => {
    setDetecting(true);
    setDetectError(null);
    setStatusMessage(null);

    try {
      const [ocrDataUrl, thumbDataUrl] = await Promise.all([
        compressImageDataUrl(rawDataUrl, 960, 0.85),
        compressImageDataUrl(rawDataUrl, 420, 0.72),
      ]);

      setPhotoDataUrl(thumbDataUrl);

      const response = await fetch('/api/detect-temperature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: ocrDataUrl,
          roomName: room.roomName,
        }),
      });

      const data = (await response.json()) as DetectedTemperatureResult & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Gagal mendeteksi nominal suhu dari foto.');
      }

      setRawResult(data);

      const nextSuhu =
        data.temperatureCelsius !== null && data.temperatureCelsius !== undefined
          ? String(data.temperatureCelsius)
          : suhu;
      const nextRh =
        data.humidityPercent !== null && data.humidityPercent !== undefined
          ? String(data.humidityPercent)
          : rh;
      const nextJam = data.timeDetected || jam || getCurrentTimeDot();
      const nextNote =
        data.rawReading || data.statusNote || 'Terdeteksi otomatis dari foto alat ukur';

      if (data.temperatureCelsius !== null && data.temperatureCelsius !== undefined) {
        setSuhu(String(data.temperatureCelsius));
      }
      if (data.humidityPercent !== null && data.humidityPercent !== undefined) {
        setRh(String(data.humidityPercent));
      }
      if (data.timeDetected) {
        setJam(data.timeDetected);
      } else if (!jam) {
        setJam(getCurrentTimeDot());
      }
      setDetectedNote(nextNote);

      const detectedAny =
        data.temperatureCelsius !== null || data.humidityPercent !== null;

      if (detectedAny && autoFillAndSave) {
        setSaving(true);
        try {
          await onSaveDayReading({
            day,
            jam: nextJam,
            suhu: nextSuhu,
            rh: nextRh,
            paraf: paraf || '✓',
            namaPetugas: namaPetugas || defaultOfficerName,
            photoDataUrl: thumbDataUrl,
            detectedNote: nextNote,
          });
          setStatusMessage(
            `Berhasil mendeteksi (${data.rawReading || `${nextSuhu}°C`}) dan otomatis mengisi formulir tanggal ${day}!`
          );
        } finally {
          setSaving(false);
        }
      } else if (detectedAny) {
        setStatusMessage(
          `Terdeteksi: ${data.rawReading || `${nextSuhu}°C`}. Periksa angka di bawah lalu klik Simpan.`
        );
      } else {
        setDetectError(
          data.statusNote ||
            'Angka termometer/higrometer belum terbaca jelas. Silakan foto ulang lebih dekat atau isi nominal secara manual.'
        );
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : 'Gagal menganalisis foto suhu.');
    } finally {
      setDetecting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void runDetectionOnImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOpenCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError(
        'Izin kamera ditolak atau kamera tidak tersedia di perangkat ini. Gunakan Unggah Foto Suhu.'
      );
    }
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const captured = canvas.toDataURL('image/jpeg', 0.9);
    stopCamera();
    void runDetectionOnImage(captured);
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveDayReading({
        day,
        jam: jam.trim(),
        suhu: suhu.trim(),
        rh: rh.trim(),
        paraf: paraf.trim(),
        namaPetugas: namaPetugas.trim(),
        photoDataUrl,
        detectedNote,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
              <Thermometer className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                Foto Suhu &amp; Deteksi Otomatis — {room.roomName}
              </h3>
              <p className="text-xs text-slate-500">
                Foto atau unggah layar termometer/higrometer untuk mengisi nominal Suhu (°C) &amp; RH (%) otomatis.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleManualSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Auto-fill & Save toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
            <label className="flex items-center gap-2 text-xs font-medium text-emerald-950 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFillAndSave}
                onChange={(e) => setAutoFillAndSave(e.target.checked)}
                className="rounded border-emerald-400 accent-emerald-600"
              />
              <span>Otomatis isi &amp; simpan ke formulir tanggal {day} setelah foto terdeteksi</span>
            </label>
            <span className="text-[11px] font-medium text-emerald-700">
              Standar: {room.standardSuhu}
            </span>
          </div>

          {/* Photo Capture / Upload Bar */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={detecting}
              onClick={() => void handleOpenCamera()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Foto Suhu Langsung (Kamera)
            </button>
            <button
              type="button"
              disabled={detecting}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload className="h-4 w-4 text-emerald-600" />
              Unggah Foto Termometer
            </button>
            {photoDataUrl && !detecting && (
              <button
                type="button"
                onClick={() => void runDetectionOnImage(photoDataUrl)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <ScanLine className="h-3.5 w-3.5" />
                Deteksi Ulang
              </button>
            )}
          </div>

          {cameraError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {cameraError}
            </div>
          )}

          {/* Live Camera Viewfinder */}
          {cameraOpen && (
            <div className="rounded-xl border border-slate-300 bg-slate-950 p-3 space-y-2.5">
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-h-64 w-full rounded-lg object-contain bg-black"
              />
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureFrame}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Camera className="h-4 w-4" />
                  Ambil Foto &amp; Deteksi Suhu
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Batal Kamera
                </button>
              </div>
            </div>
          )}

          {/* Detection Progress & Result Status */}
          {detecting && (
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              <span>Membaca nominal suhu (°C) dan kelembapan (RH %) dari foto secara otomatis...</span>
            </div>
          )}

          {statusMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
              <Sparkles className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
              <div>
                <div className="font-semibold">{statusMessage}</div>
                {rawResult?.rawReading && (
                  <div className="mt-0.5 text-[11px] text-emerald-800">
                    Pembacaan alat: <span className="font-mono-num font-semibold">{rawResult.rawReading}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {detectError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              {detectError}
            </div>
          )}

          {/* Photo Preview + Form Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 items-start">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
              {photoDataUrl ? (
                <div className="space-y-2">
                  <img
                    src={photoDataUrl}
                    alt={`Foto suhu tanggal ${day}`}
                    className="h-36 w-full rounded-lg object-cover border border-slate-200 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl('')}
                    className="text-[11px] font-medium text-red-600 hover:underline"
                  >
                    Hapus Foto
                  </button>
                </div>
              ) : (
                <div className="flex h-36 flex-col items-center justify-center gap-1.5 text-slate-400">
                  <Camera className="h-7 w-7" />
                  <span className="text-[11px]">Belum ada foto suhu</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Tanggal (1–31)
                </label>
                <select
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Tanggal {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Jam Pengukuran
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={jam}
                  onChange={(e) => setJam(e.target.value)}
                  placeholder="07.30"
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Suhu (°C)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={suhu}
                  onChange={(e) => setSuhu(e.target.value)}
                  placeholder="Contoh: 4.2"
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  RH / Kelembapan (%)
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={rh}
                  onChange={(e) => setRh(e.target.value)}
                  placeholder="Contoh: 58"
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Paraf Petugas
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={paraf}
                  onChange={(e) => setParaf(e.target.value)}
                  placeholder="✓ atau inisial"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Nama Petugas
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={namaPetugas}
                  onChange={(e) => setNamaPetugas(e.target.value)}
                  placeholder="Nama petugas pemeriksa"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={saving || detecting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Menyimpan...' : `Simpan ke Tanggal ${day}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
