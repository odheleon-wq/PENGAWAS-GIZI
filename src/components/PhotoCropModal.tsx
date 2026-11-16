import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Maximize2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SwitchCamera,
  Upload,
  X,
} from 'lucide-react';

interface PhotoCropModalProps {
  initialImageSrc?: string | null;
  initialMode?: 'crop' | 'camera';
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string) => void;
}

interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

type DragHandle =
  | 'move'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se';

const OUTPUT_WIDTH = 600;
const OUTPUT_HEIGHT = 400; // Seragam 3:2 untuk seluruh baris tabel & PDF F4
const MIN_CROP_FRAC = 0.08;

export const PhotoCropModal: React.FC<PhotoCropModalProps> = ({
  initialImageSrc = null,
  initialMode = 'crop',
  onCancel,
  onConfirm,
}) => {
  const [mode, setMode] = useState<'camera' | 'crop'>(
    initialImageSrc ? 'crop' : initialMode
  );
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(initialImageSrc);
  const [workingImg, setWorkingImg] = useState<HTMLImageElement | null>(null);
  const [workingSrc, setWorkingSrc] = useState<string | null>(initialImageSrc);

  // Crop box in normalized [0..1] image coordinates
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [lockRatio32, setLockRatio32] = useState<boolean>(false);
  const [fitMode, setFitMode] = useState<'contain' | 'fill'>('contain');

  // Active pointer drag state
  const dragRef = useRef<{
    handle: DragHandle;
    startClientX: number;
    startClientY: number;
    startRect: CropRect;
    boxWidth: number;
    boxHeight: number;
  } | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user') => {
      stopCameraStream();
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Perangkat atau browser ini tidak mendukung kamera langsung. Silakan unggah foto.'
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 853 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        setCameraError(
          'Izin kamera ditolak atau kamera tidak tersedia. Gunakan tombol Unggah dari Perangkat.'
        );
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (mode === 'camera') {
      void startCamera(facingMode);
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [mode, facingMode, startCamera, stopCameraStream]);

  // Load working image whenever workingSrc changes
  useEffect(() => {
    if (!workingSrc) {
      setWorkingImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setWorkingImg(img);
      setCropRect({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 });
    };
    img.src = workingSrc;
  }, [workingSrc]);

  const handleCaptureFromCamera = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 853;
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, vw, vh);
    const captured = canvas.toDataURL('image/jpeg', 0.92);
    stopCameraStream();
    setRawImageSrc(captured);
    setWorkingSrc(captured);
    setMode('crop');
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawImageSrc(reader.result);
        setWorkingSrc(reader.result);
        setMode('crop');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Bake 90-degree rotation directly into workingSrc so edge handles stay intuitive
  const handleRotateWorkingImage = (deltaDeg: 90 | -90) => {
    if (!workingImg) return;
    const canvas = document.createElement('canvas');
    canvas.width = workingImg.naturalHeight;
    canvas.height = workingImg.naturalWidth;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((deltaDeg * Math.PI) / 180);
    ctx.drawImage(
      workingImg,
      -workingImg.naturalWidth / 2,
      -workingImg.naturalHeight / 2
    );
    const rotatedUrl = canvas.toDataURL('image/jpeg', 0.94);
    setWorkingSrc(rotatedUrl);
  };

  const handleResetCrop = () => {
    if (rawImageSrc && rawImageSrc !== workingSrc) {
      setWorkingSrc(rawImageSrc);
    } else {
      setCropRect({ x: 0, y: 0, w: 1, h: 1 });
    }
  };

  const handleToggleLock32 = (nextLocked: boolean) => {
    setLockRatio32(nextLocked);
    if (nextLocked && workingImg) {
      // Adjust current cropRect height around center to match 3:2 visual ratio
      const imgAspect = workingImg.naturalWidth / workingImg.naturalHeight;
      const targetNormRatio = 1.5 / imgAspect; // w_norm / h_norm = 1.5 / imgAspect
      let nextW = cropRect.w;
      let nextH = nextW / targetNormRatio;
      if (nextH > 1) {
        nextH = 1;
        nextW = Math.min(1, nextH * targetNormRatio);
      }
      const cx = cropRect.x + cropRect.w / 2;
      const cy = cropRect.y + cropRect.h / 2;
      const nextX = Math.max(0, Math.min(1 - nextW, cx - nextW / 2));
      const nextY = Math.max(0, Math.min(1 - nextH, cy - nextH / 2));
      setCropRect({ x: nextX, y: nextY, w: nextW, h: nextH });
    }
  };

  const startHandleDrag = (
    e: React.PointerEvent,
    handle: DragHandle
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const box = stageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: { ...cropRect },
      boxWidth: rect.width,
      boxHeight: rect.height,
    };
  };

  const handleDragMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = (e.clientX - drag.startClientX) / drag.boxWidth;
    const dy = (e.clientY - drag.startClientY) / drag.boxHeight;
    const s = drag.startRect;

    if (drag.handle === 'move') {
      const nextX = Math.max(0, Math.min(1 - s.w, s.x + dx));
      const nextY = Math.max(0, Math.min(1 - s.h, s.y + dy));
      setCropRect({ x: nextX, y: nextY, w: s.w, h: s.h });
      return;
    }

    let left = s.x;
    let top = s.y;
    let right = s.x + s.w;
    let bottom = s.y + s.h;

    if (drag.handle.includes('w')) {
      left = Math.max(0, Math.min(right - MIN_CROP_FRAC, s.x + dx));
    }
    if (drag.handle.includes('e')) {
      right = Math.min(1, Math.max(left + MIN_CROP_FRAC, s.x + s.w + dx));
    }
    if (drag.handle.includes('n')) {
      top = Math.max(0, Math.min(bottom - MIN_CROP_FRAC, s.y + dy));
    }
    if (drag.handle.includes('s')) {
      bottom = Math.min(1, Math.max(top + MIN_CROP_FRAC, s.y + s.h + dy));
    }

    if (lockRatio32 && workingImg) {
      const imgAspect = workingImg.naturalWidth / workingImg.naturalHeight;
      const targetNormRatio = 1.5 / imgAspect;
      let w = right - left;
      let h = bottom - top;

      if (drag.handle === 'n' || drag.handle === 's') {
        w = h * targetNormRatio;
        const cx = (left + right) / 2;
        left = Math.max(0, Math.min(1 - w, cx - w / 2));
        right = left + Math.min(w, 1 - left);
        h = (right - left) / targetNormRatio;
        if (drag.handle === 'n') top = bottom - h;
        else bottom = top + h;
      } else {
        h = w / targetNormRatio;
        if (drag.handle.includes('n')) {
          top = bottom - h;
          if (top < 0) {
            top = 0;
            h = bottom;
            w = h * targetNormRatio;
            if (drag.handle.includes('w')) left = right - w;
            else right = left + w;
          }
        } else {
          bottom = top + h;
          if (bottom > 1) {
            bottom = 1;
            h = 1 - top;
            w = h * targetNormRatio;
            if (drag.handle.includes('w')) left = right - w;
            else right = left + w;
          }
        }
      }
    }

    setCropRect({
      x: Math.max(0, left),
      y: Math.max(0, top),
      w: Math.max(MIN_CROP_FRAC, Math.min(1 - left, right - left)),
      h: Math.max(MIN_CROP_FRAC, Math.min(1 - top, bottom - top)),
    });
  };

  const handleDragEnd = () => {
    dragRef.current = null;
  };

  const handleExportCropped = () => {
    if (!workingImg) return;
    const sx = Math.round(cropRect.x * workingImg.naturalWidth);
    const sy = Math.round(cropRect.y * workingImg.naturalHeight);
    const sw = Math.max(1, Math.round(cropRect.w * workingImg.naturalWidth));
    const sh = Math.max(1, Math.round(cropRect.h * workingImg.naturalHeight));

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    if (fitMode === 'fill') {
      // Penuh mengisi kotak seragam 600x400
      ctx.drawImage(workingImg, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    } else {
      // Proporsional murni tanpa distorsi, terpusat rapi di kotak seragam 600x400
      const scale = Math.min(OUTPUT_WIDTH / sw, OUTPUT_HEIGHT / sh);
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      const dx = Math.round((OUTPUT_WIDTH - dw) / 2);
      const dy = Math.round((OUTPUT_HEIGHT - dh) / 2);
      ctx.drawImage(workingImg, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    onConfirm(dataUrl);
  };

  const cropPxW = workingImg ? Math.round(cropRect.w * workingImg.naturalWidth) : 0;
  const cropPxH = workingImg ? Math.round(cropRect.h * workingImg.naturalHeight) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Atur dan Krop Foto Menu"
    >
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-900">
              {mode === 'camera'
                ? 'Ambil Foto Menu Langsung'
                : 'Krop Foto Bebas (Sisi Kiri, Kanan, Atas, Bawah)'}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Tarik sisi mana saja sesuai kemauan. Hasil akhir diseragamkan ke ukuran 600 × 400 px agar tabel & PDF tetap rapi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onCancel();
            }}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switch & Crop Options Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 sm:px-5 py-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'camera'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              Kamera Langsung
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900 transition-colors whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              Unggah Foto
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFilePicked}
            className="hidden"
          />

          {mode === 'crop' && workingImg && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Free vs Locked Ratio */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
                <button
                  type="button"
                  onClick={() => handleToggleLock32(false)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    !lockRatio32
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Krop Bebas
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleLock32(true)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    lockRatio32
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kunci 3:2
                </button>
              </div>

              {/* Uniform Output Fit Mode */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setFitMode('contain')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    fitMode === 'contain'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Pertahankan proporsi asli hasil krop di dalam bingkai seragam"
                >
                  Proporsional Rapi
                </button>
                <button
                  type="button"
                  onClick={() => setFitMode('fill')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    fitMode === 'fill'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Penuhkan seluruh kotak 3:2"
                >
                  Penuh Bingkai
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          {mode === 'camera' ? (
            <div className="flex flex-col items-center gap-3.5">
              <div className="relative w-full max-w-[460px] aspect-[3/2] overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
                {cameraError ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white">
                    <Camera className="mb-2 h-8 w-8 text-slate-400" />
                    <p className="text-xs sm:text-sm text-slate-200 mb-4">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Upload className="h-4 w-4" />
                      Pilih / Unggah Foto
                    </button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      <div className="border-r border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-r border-b border-white/25" />
                      <div className="border-b border-white/25" />
                      <div className="border-r border-white/25" />
                      <div className="border-r border-white/25" />
                      <div />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <SwitchCamera className="h-4 w-4" />
                  Ganti Kamera
                </button>
                <button
                  type="button"
                  disabled={!cameraReady}
                  onClick={handleCaptureFromCamera}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  Jepret Foto
                </button>
              </div>
            </div>
          ) : workingImg && workingSrc ? (
            <div className="flex flex-col items-center gap-3">
              {/* Interactive Stage showing FULL image so user can drag any edge freely */}
              <div className="flex w-full items-center justify-center rounded-lg bg-slate-900 p-3 sm:p-4 select-none">
                <div
                  ref={stageBoxRef}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  className="relative inline-block touch-none select-none"
                >
                  <img
                    src={workingSrc}
                    alt="Area krop foto menu"
                    draggable={false}
                    className="block h-auto w-auto max-h-[44vh] max-w-full pointer-events-none"
                  />

                  {/* Darkened outside masks around the crop rectangle */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 bg-black/55"
                    style={{ height: `${cropRect.y * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55"
                    style={{ height: `${Math.max(0, 1 - (cropRect.y + cropRect.h)) * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 bg-black/55"
                    style={{
                      top: `${cropRect.y * 100}%`,
                      height: `${cropRect.h * 100}%`,
                      width: `${cropRect.x * 100}%`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute right-0 bg-black/55"
                    style={{
                      top: `${cropRect.y * 100}%`,
                      height: `${cropRect.h * 100}%`,
                      width: `${Math.max(0, 1 - (cropRect.x + cropRect.w)) * 100}%`,
                    }}
                  />

                  {/* Interactive Crop Box with 8 independent edge & corner handles */}
                  <div
                    onPointerDown={(e) => startHandleDrag(e, 'move')}
                    style={{
                      left: `${cropRect.x * 100}%`,
                      top: `${cropRect.y * 100}%`,
                      width: `${cropRect.w * 100}%`,
                      height: `${cropRect.h * 100}%`,
                    }}
                    className="absolute border-2 border-emerald-400 cursor-move shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                  >
                    {/* Rule-of-thirds grid */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      <div className="border-r border-b border-white/30" />
                      <div className="border-r border-b border-white/30" />
                      <div className="border-b border-white/30" />
                      <div className="border-r border-b border-white/30" />
                      <div className="border-r border-b border-white/30" />
                      <div className="border-b border-white/30" />
                      <div className="border-r border-white/30" />
                      <div className="border-r border-white/30" />
                      <div />
                    </div>

                    {/* Top Edge Handle (Atas) */}
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'n')}
                      title="Geser sisi atas"
                      className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-12 cursor-n-resize flex items-center justify-center"
                    >
                      <span className="h-1.5 w-8 rounded-full bg-white border border-emerald-700 shadow" />
                    </div>

                    {/* Bottom Edge Handle (Bawah) */}
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 's')}
                      title="Geser sisi bawah"
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-4 w-12 cursor-s-resize flex items-center justify-center"
                    >
                      <span className="h-1.5 w-8 rounded-full bg-white border border-emerald-700 shadow" />
                    </div>

                    {/* Left Edge Handle (Kiri) */}
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'w')}
                      title="Geser sisi kiri"
                      className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-12 cursor-w-resize flex items-center justify-center"
                    >
                      <span className="w-1.5 h-8 rounded-full bg-white border border-emerald-700 shadow" />
                    </div>

                    {/* Right Edge Handle (Kanan) */}
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'e')}
                      title="Geser sisi kanan"
                      className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-12 cursor-e-resize flex items-center justify-center"
                    >
                      <span className="w-1.5 h-8 rounded-full bg-white border border-emerald-700 shadow" />
                    </div>

                    {/* 4 Corner Handles */}
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'nw')}
                      className="absolute -top-2 -left-2 h-4 w-4 cursor-nw-resize rounded-xs bg-white border-2 border-emerald-600 shadow"
                    />
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'ne')}
                      className="absolute -top-2 -right-2 h-4 w-4 cursor-ne-resize rounded-xs bg-white border-2 border-emerald-600 shadow"
                    />
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'sw')}
                      className="absolute -bottom-2 -left-2 h-4 w-4 cursor-sw-resize rounded-xs bg-white border-2 border-emerald-600 shadow"
                    />
                    <div
                      onPointerDown={(e) => startHandleDrag(e, 'se')}
                      className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-xs bg-white border-2 border-emerald-600 shadow"
                    />
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2">
                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="font-mono-num font-medium text-slate-800">
                    Pilihan: {cropPxW} × {cropPxH} px
                  </span>
                  <span aria-hidden="true">→</span>
                  <span className="font-mono-num text-emerald-700 font-medium">
                    Output seragam: 600 × 400 px
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRotateWorkingImage(-90)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    title="Putar Kiri 90°"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Putar Kiri
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateWorkingImage(90)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    title="Putar Kanan 90°"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Putar Kanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropRect({ x: 0, y: 0, w: 1, h: 1 })}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    title="Pilih seluruh gambar"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Penuh
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCrop}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                </div>
              </div>

              <p className="text-center text-[11px] text-slate-500">
                Tarik pegangan garis putih di sisi kiri, kanan, atas, atau bawah secara terpisah untuk memotong bagian yang tidak diinginkan.
              </p>
            </div>
          ) : (
            <div className="flex h-52 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Upload className="mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">Belum ada foto dipilih</p>
              <p className="mt-1 text-xs text-slate-500">
                Pilih kamera langsung atau unggah foto dari galeri/komputer.
              </p>
            </div>
          )}
        </div>

        {/* Footer — Always Pinned & Visible */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-4 sm:px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onCancel();
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Batal
          </button>
          {mode === 'crop' && workingImg && (
            <button
              type="button"
              onClick={handleExportCropped}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              Gunakan Foto Rapi (600×400)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
