import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Edit3,
  Layers,
  MapPin,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { SOP_BGN_ROOM_PRESETS } from '../constants/temperatureStandards';
import { DEFAULT_TEMP_TABLE_LABELS } from '../services/sppgService';
import type {
  SppgUserProfile,
  TempDayReading,
  TempFormConfig,
  TempMonitoringRoom,
  TempTableLabels,
} from '../types';
import { resolveDocumentLogos } from '../utils/logoResolver';
import { useAutoSave, type AutoSaveStatus } from '../hooks/useAutoSave';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';
import { TempPhotoDetectModal } from './TempPhotoDetectModal';

interface TemperatureMonitoringViewProps {
  profile: SppgUserProfile;
  monthKey: string;
  config: TempFormConfig;
  rooms: TempMonitoringRoom[];
  roomsLoaded: boolean;
  activeRoomId: string | null;
  dayReadings: TempDayReading[];
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (roomName: string) => Promise<string | void>;
  onSeedAllPresetRooms: () => Promise<void>;
  onUpdateRoom: (
    roomId: string,
    input: {
      roomOrder: number;
      roomName: string;
      presetKey: string;
      standardSuhu: string;
      standardRh: string;
      sopNote: string;
    }
  ) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onSaveConfig: (
    next: Omit<TempFormConfig, 'uid' | 'monthKey' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onSaveDayReading: (
    roomId: string,
    input: {
      day: number;
      jam: string;
      suhu: string;
      rh: string;
      paraf: string;
      namaPetugas: string;
      photoDataUrl?: string;
      detectedNote?: string;
    }
  ) => Promise<void>;
  onExportAllRoomsPdf: () => Promise<void>;
  onSyncGlobalLeftLogo?: (dataUrl: string, widthPx: number) => Promise<void>;
}

const DAYS_1_TO_31 = Array.from({ length: 31 }, (_, i) => i + 1);

export const TemperatureMonitoringView: React.FC<TemperatureMonitoringViewProps> = ({
  profile,
  monthKey,
  config,
  rooms,
  roomsLoaded,
  activeRoomId,
  dayReadings,
  onSelectRoom,
  onCreateRoom,
  onSeedAllPresetRooms,
  onUpdateRoom,
  onDeleteRoom,
  onSaveConfig,
  onSaveDayReading,
  onExportAllRoomsPdf,
  onSyncGlobalLeftLogo,
}) => {
  const [customRoomInput, setCustomRoomInput] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);

  const [showFormatEditor, setShowFormatEditor] = useState(false);
  const [draftConfig, setDraftConfig] = useState<TempFormConfig>(config);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);

  const [draftRoom, setDraftRoom] = useState<TempMonitoringRoom | null>(null);
  const [savingRoom, setSavingRoom] = useState(false);

  // Local map of day 1..31 for smooth inline editing + auto-save
  const [localDays, setLocalDays] = useState<Record<number, TempDayReading>>({});
  const dirtyDaysRef = useRef<Set<number>>(new Set());
  const dayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dayAutoStatus, setDayAutoStatus] = useState<AutoSaveStatus>('idle');
  const [dayLastSavedAt, setDayLastSavedAt] = useState<string>('');
  const [dayErrorMsg, setDayErrorMsg] = useState<string | null>(null);

  const [photoModalState, setPhotoModalState] = useState<{
    open: boolean;
    day: number;
  }>({ open: false, day: Math.min(31, new Date().getDate()) });

  const autoSeededMonthsRef = useRef<Set<string>>(new Set());

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || rooms[0] || null,
    [rooms, activeRoomId]
  );

  // Automatically create initial "Gudang Basah" sheet if a month has zero rooms yet
  useEffect(() => {
    if (!roomsLoaded) return;
    if (rooms.length === 0 && !autoSeededMonthsRef.current.has(monthKey)) {
      autoSeededMonthsRef.current.add(monthKey);
      void onCreateRoom('Gudang Basah');
    }
  }, [roomsLoaded, rooms.length, monthKey, onCreateRoom]);

  const serializeTempCfg = useCallback(
    (c: TempFormConfig) =>
      JSON.stringify({
        logoDataUrl: c.logoDataUrl || '',
        logoWidthPx: c.logoWidthPx || 56,
        logoRightDataUrl: c.logoRightDataUrl || '',
        logoRightWidthPx: c.logoRightWidthPx || 56,
        followGlobalLeftLogo: c.followGlobalLeftLogo !== false,
        followGlobalRightLogo: c.followGlobalRightLogo !== false,
        logoCaption: c.logoCaption,
        unitName: c.unitName,
        formLabel: c.formLabel,
        formTitle: c.formTitle,
        docNumber: c.docNumber,
        revision: c.revision,
        effectiveDate: c.effectiveDate,
        periodeLabel: c.periodeLabel,
        tableLabels: { ...DEFAULT_TEMP_TABLE_LABELS, ...(c.tableLabels || {}) },
        sopTitle: c.sopTitle,
        sopSubtitle: c.sopSubtitle,
      }),
    []
  );

  const normalizedServerCfg = useMemo(
    () => ({
      ...config,
      tableLabels: { ...DEFAULT_TEMP_TABLE_LABELS, ...(config.tableLabels || {}) },
    }),
    [config]
  );
  const cfgServerHash = useMemo(
    () => serializeTempCfg(normalizedServerCfg),
    [normalizedServerCfg, serializeTempCfg]
  );
  const lastCfgServerHashRef = useRef<string>(cfgServerHash);
  const lastCfgMonthRef = useRef<string>(monthKey);
  const draftCfgRef = useRef<TempFormConfig>(draftConfig);
  draftCfgRef.current = draftConfig;

  useEffect(() => {
    const monthChanged = lastCfgMonthRef.current !== monthKey;
    const isClean = serializeTempCfg(draftCfgRef.current) === lastCfgServerHashRef.current;
    if (monthChanged || isClean) {
      setDraftConfig(normalizedServerCfg);
    }
    lastCfgMonthRef.current = monthKey;
    lastCfgServerHashRef.current = cfgServerHash;
  }, [monthKey, normalizedServerCfg, cfgServerHash, serializeTempCfg]);

  const {
    status: cfgAutoStatus,
    lastSavedAtLabel: cfgLastSavedAt,
    errorMessage: cfgErrorMsg,
    markSynced: markCfgSynced,
  } = useAutoSave<TempFormConfig>({
    value: draftConfig,
    serverHash: cfgServerHash,
    scopeKey: `temp_cfg:${monthKey}`,
    uid: profile.uid,
    serialize: serializeTempCfg,
    onSave: async (val) => {
      const merged = { ...DEFAULT_TEMP_TABLE_LABELS, ...(val.tableLabels || {}) };
      await onSaveConfig({
        logoDataUrl: val.logoDataUrl || '',
        logoWidthPx: val.logoWidthPx || 56,
        logoRightDataUrl: val.logoRightDataUrl || '',
        logoRightWidthPx: val.logoRightWidthPx || 56,
        followGlobalLeftLogo: val.followGlobalLeftLogo !== false,
        followGlobalRightLogo: val.followGlobalRightLogo !== false,
        logoCaption: val.logoCaption,
        unitName: val.unitName,
        formLabel: val.formLabel,
        formTitle: val.formTitle,
        docNumber: val.docNumber,
        revision: val.revision,
        effectiveDate: val.effectiveDate,
        periodeLabel: val.periodeLabel,
        tableLabels: merged,
        sopTitle: val.sopTitle,
        sopSubtitle: val.sopSubtitle,
      });
    },
  });

  useEffect(() => {
    setDraftRoom(activeRoom ? { ...activeRoom } : null);
  }, [activeRoom]);

  const lastRoomIdRef = useRef<string | undefined>(activeRoom?.id);
  useEffect(() => {
    if (lastRoomIdRef.current !== activeRoom?.id) {
      dirtyDaysRef.current.clear();
      if (dayTimerRef.current) {
        clearTimeout(dayTimerRef.current);
        dayTimerRef.current = null;
      }
      lastRoomIdRef.current = activeRoom?.id;
    }
    setLocalDays((prev) => {
      const map: Record<number, TempDayReading> = {};
      dayReadings.forEach((r) => {
        if (dirtyDaysRef.current.has(r.day) && prev[r.day]) {
          map[r.day] = prev[r.day];
        } else {
          map[r.day] = r;
        }
      });
      dirtyDaysRef.current.forEach((dirtyDay) => {
        if (!map[dirtyDay] && prev[dirtyDay]) {
          map[dirtyDay] = prev[dirtyDay];
        }
      });
      return map;
    });
  }, [dayReadings, activeRoom?.id]);

  const localDaysRef = useRef(localDays);
  localDaysRef.current = localDays;
  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;

  const flushDirtyDays = useCallback(async () => {
    if (dayTimerRef.current) {
      clearTimeout(dayTimerRef.current);
      dayTimerRef.current = null;
    }
    const room = activeRoomRef.current;
    const days = Array.from(dirtyDaysRef.current);
    if (!room || days.length === 0) return;
    setDayAutoStatus('saving');
    setDayErrorMsg(null);
    try {
      for (const d of days) {
        const curr = localDaysRef.current[d];
        dirtyDaysRef.current.delete(d);
        if (!curr) continue;
        await onSaveDayReading(room.id, {
          day: d,
          jam: curr.jam,
          suhu: curr.suhu,
          rh: curr.rh,
          paraf: curr.paraf,
          namaPetugas: curr.namaPetugas,
          photoDataUrl: curr.photoDataUrl || '',
          detectedNote: curr.detectedNote || '',
        });
      }
      const now = new Date();
      setDayLastSavedAt(
        `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
      );
      setDayAutoStatus('saved');
    } catch (err) {
      days.forEach((d) => dirtyDaysRef.current.add(d));
      setDayAutoStatus('error');
      setDayErrorMsg(err instanceof Error ? err.message : 'Gagal auto-simpan data suhu.');
    }
  }, [onSaveDayReading]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirtyDaysRef.current.size > 0) {
        void flushDirtyDays();
      }
    };
    const onUnload = () => {
      if (dirtyDaysRef.current.size > 0) {
        void flushDirtyDays();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      if (dayTimerRef.current) clearTimeout(dayTimerRef.current);
      if (dirtyDaysRef.current.size > 0) {
        void flushDirtyDays();
      }
    };
  }, [flushDirtyDays]);

  const labels: TempTableLabels = {
    ...DEFAULT_TEMP_TABLE_LABELS,
    ...(config.tableLabels || {}),
  };

  const draftLabels: TempTableLabels = {
    ...DEFAULT_TEMP_TABLE_LABELS,
    ...(draftConfig.tableLabels || {}),
  };

  const handleAddCustomRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customRoomInput.trim();
    if (!trimmed) return;
    setAddingRoom(true);
    try {
      await onCreateRoom(trimmed);
      setCustomRoomInput('');
    } finally {
      setAddingRoom(false);
    }
  };

  const handleQuickAddPreset = async (presetLabel: string) => {
    const existing = rooms.find(
      (r) => r.roomName.trim().toLowerCase() === presetLabel.toLowerCase()
    );
    if (existing) {
      onSelectRoom(existing.id);
      return;
    }
    setAddingRoom(true);
    try {
      await onCreateRoom(presetLabel);
    } finally {
      setAddingRoom(false);
    }
  };

  const draftLogos = resolveDocumentLogos(profile, 'suhu', draftConfig);
  const displayLogos = resolveDocumentLogos(profile, 'suhu', config);

  const handleApplyLogoModal = async ({
    dataUrl,
    widthPx,
    syncAsGlobalBgn,
  }: {
    dataUrl: string;
    widthPx: number;
    syncAsGlobalBgn?: boolean;
  }) => {
    if (logoModalSide === 'left') {
      if (syncAsGlobalBgn && onSyncGlobalLeftLogo) {
        await onSyncGlobalLeftLogo(dataUrl, widthPx);
      }
      setDraftConfig((prev) => ({
        ...prev,
        logoDataUrl: dataUrl,
        logoWidthPx: widthPx,
        followGlobalLeftLogo: syncAsGlobalBgn ? true : false,
      }));
    } else if (logoModalSide === 'right') {
      setDraftConfig((prev) => ({
        ...prev,
        logoRightDataUrl: dataUrl,
        logoRightWidthPx: widthPx,
        followGlobalRightLogo: false,
      }));
    }
  };

  const handleSaveFormatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSavedNotice(false);
    try {
      await onSaveConfig({
        logoDataUrl: draftConfig.logoDataUrl || '',
        logoWidthPx: draftConfig.logoWidthPx || 56,
        logoRightDataUrl: draftConfig.logoRightDataUrl || '',
        logoRightWidthPx: draftConfig.logoRightWidthPx || 56,
        followGlobalLeftLogo: draftConfig.followGlobalLeftLogo !== false,
        followGlobalRightLogo: draftConfig.followGlobalRightLogo !== false,
        logoCaption: draftConfig.logoCaption,
        unitName: draftConfig.unitName,
        formLabel: draftConfig.formLabel,
        formTitle: draftConfig.formTitle,
        docNumber: draftConfig.docNumber,
        revision: draftConfig.revision,
        effectiveDate: draftConfig.effectiveDate,
        periodeLabel: draftConfig.periodeLabel,
        tableLabels: draftLabels,
        sopTitle: draftConfig.sopTitle,
        sopSubtitle: draftConfig.sopSubtitle,
      });

      if (draftRoom && activeRoom) {
        setSavingRoom(true);
        await onUpdateRoom(activeRoom.id, {
          roomOrder: draftRoom.roomOrder,
          roomName: draftRoom.roomName,
          presetKey: draftRoom.presetKey,
          standardSuhu: draftRoom.standardSuhu,
          standardRh: draftRoom.standardRh,
          sopNote: draftRoom.sopNote,
        });
      }

      markCfgSynced(serializeTempCfg(draftConfig));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingConfig(false);
      setSavingRoom(false);
    }
  };

  const handleDayFieldChange = (
    day: number,
    field: 'jam' | 'suhu' | 'rh' | 'paraf' | 'namaPetugas',
    value: string
  ) => {
    setLocalDays((prev) => {
      const curr = prev[day] || {
        id: String(day),
        uid: profile.uid,
        monthKey,
        roomId: activeRoom?.id || '',
        day,
        jam: '',
        suhu: '',
        rh: '',
        paraf: '',
        namaPetugas: '',
        photoDataUrl: '',
        detectedNote: '',
      };
      return {
        ...prev,
        [day]: { ...curr, [field]: value },
      };
    });
    dirtyDaysRef.current.add(day);
    setDayAutoStatus('pending');
    if (dayTimerRef.current) clearTimeout(dayTimerRef.current);
    dayTimerRef.current = setTimeout(() => {
      void flushDirtyDays();
    }, 850);
  };

  const handleDayFieldBlur = async (day: number) => {
    if (!activeRoom) return;
    const curr = localDays[day];
    if (!curr) return;
    dirtyDaysRef.current.delete(day);
    await onSaveDayReading(activeRoom.id, {
      day,
      jam: curr.jam,
      suhu: curr.suhu,
      rh: curr.rh,
      paraf: curr.paraf,
      namaPetugas: curr.namaPetugas,
      photoDataUrl: curr.photoDataUrl || '',
      detectedNote: curr.detectedNote || '',
    });
    const now = new Date();
    setDayLastSavedAt(
      `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`
    );
    setDayAutoStatus('saved');
  };

  const combinedSopRows = useMemo(() => {
    // Show all added rooms first (editable via their sheet), followed by remaining SOP BGN Pusat presets
    const roomRows = rooms.map((r) => ({
      id: r.id,
      name: r.roomName,
      standardSuhu: r.standardSuhu,
      standardRh: r.standardRh,
      sopNote: r.sopNote,
      isAddedRoom: true,
      isActive: activeRoom?.id === r.id,
    }));

    const existingNames = new Set(rooms.map((r) => r.roomName.trim().toLowerCase()));
    const presetRows = SOP_BGN_ROOM_PRESETS.filter(
      (p) => !existingNames.has(p.label.toLowerCase())
    ).map((p) => ({
      id: `preset_${p.presetKey}`,
      name: p.label,
      standardSuhu: p.standardSuhu,
      standardRh: p.standardRh,
      sopNote: p.sopNote,
      isAddedRoom: false,
      isActive: false,
    }));

    return [...roomRows, ...presetRows];
  }, [rooms, activeRoom?.id]);

  const photoCountThisRoom = useMemo(
    () => dayReadings.filter((d) => Boolean(d.photoDataUrl)).length,
    [dayReadings]
  );

  return (
    <div className="space-y-5">
      {/* Control & Room Management Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Form Monitoring Suhu &amp; Kelembapan Ruangan ({config.docNumber})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Pilih lokasi standar SOP BGN Pusat atau tambah lokasi bebas. Setiap ruangan yang ditambahkan otomatis memiliki lembar pemantauan tanggal 1–31 beserta deteksi suhu otomatis dari foto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <AutoSaveIndicator
              status={
                cfgAutoStatus === 'saving' || cfgAutoStatus === 'pending' || cfgAutoStatus === 'error'
                  ? cfgAutoStatus
                  : dayAutoStatus !== 'idle'
                  ? dayAutoStatus
                  : cfgAutoStatus
              }
              lastSavedAtLabel={dayLastSavedAt || cfgLastSavedAt}
              errorMessage={dayErrorMsg || cfgErrorMsg}
            />
            <button
              type="button"
              disabled={!activeRoom}
              onClick={() =>
                setPhotoModalState({
                  open: true,
                  day: Math.min(31, new Date().getDate()),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Foto Suhu Otomatis
            </button>
            {rooms.length > 1 && (
              <button
                type="button"
                onClick={() => void onExportAllRoomsPdf()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Gabungkan lembar monitoring seluruh ruangan ke dalam satu file PDF F4"
              >
                <Layers className="h-3.5 w-3.5 text-emerald-600" />
                PDF Semua Ruangan ({rooms.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFormatEditor((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                showFormatEditor
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showFormatEditor ? 'Tutup Editor Format' : 'Edit Format & SOP'}
            </button>
          </div>
        </div>

        {/* Preset Locations + Custom Location Form */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Pilihan Lokasi Standar (Klik untuk buka / buat lembar pemantauan otomatis):
            </span>
            <button
              type="button"
              onClick={() => void onSeedAllPresetRooms()}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              + Tambah Semua 8 Lokasi BGN Sekaligus
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SOP_BGN_ROOM_PRESETS.map((preset) => {
              const existing = rooms.find(
                (r) => r.roomName.trim().toLowerCase() === preset.label.toLowerCase()
              );
              const isSelected = existing && activeRoom?.id === existing.id;
              return (
                <button
                  key={preset.presetKey}
                  type="button"
                  disabled={addingRoom}
                  onClick={() => void handleQuickAddPreset(preset.label)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : existing
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>{preset.label.toUpperCase()}</span>
                  {!existing && <Plus className="h-3 w-3 opacity-70" />}
                </button>
              );
            })}
          </div>

          {/* Add Custom Free Location */}
          <form onSubmit={handleAddCustomRoom} className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="text"
              maxLength={120}
              value={customRoomInput}
              onChange={(e) => setCustomRoomInput(e.target.value)}
              placeholder="Tambah lokasi/ruangan bebas apa saja (misal: Chiller Daging, Gudang Bumbu, Ruang Cuci Ompreng)..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingRoom || !customRoomInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Tambah Lokasi &amp; Lembar Monitoring
            </button>
          </form>
        </div>

        {/* Active Room Sheet Switcher */}
        {rooms.length > 0 && (
          <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-1">
                Lembar Ruangan ({rooms.length}):
              </span>
              {rooms.map((room) => {
                const active = activeRoom?.id === room.id;
                return (
                  <div
                    key={room.id}
                    className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectRoom(room.id)}
                      className="px-3 py-1.5 text-left"
                    >
                      {room.roomName}
                    </button>
                    {rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void onDeleteRoom(room.id)}
                        className={`pr-2 py-1.5 ${
                          active
                            ? 'text-slate-300 hover:text-red-300'
                            : 'text-slate-400 hover:text-red-600'
                        }`}
                        title={`Hapus lembar ruangan ${room.roomName}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {activeRoom && (
              <span className="font-mono-num text-[11px] text-slate-500">
                {photoCountThisRoom} foto suhu terlampir di {activeRoom.roomName}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Full Format & SOP Customizer Panel */}
      {showFormatEditor && (
        <form
          onSubmit={handleSaveFormatSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Edit Seluruh Format Dokumen &amp; Standar SOP BGN Pusat ({monthKey})
              </h3>
              <p className="text-xs text-slate-500">
                Semua kop dokumen, label kolom tabel, nama lokasi, dan standar suhu SOP di bawah dapat disesuaikan.
              </p>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                Perubahan tersimpan
              </span>
            )}
          </div>

          {/* 1. Kop Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Logo Kiri (BGN) &amp; Kanan</div>
              <div className="flex flex-wrap items-center gap-2">
                {draftLogos.leftUrl ? (
                  <img
                    src={draftLogos.leftUrl}
                    alt="Logo Kiri"
                    style={{ width: `${Math.min(64, draftLogos.leftWidthPx)}px` }}
                    className="h-12 rounded border border-slate-300 bg-white object-contain p-0.5"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-400 bg-white text-[10px] font-bold text-slate-600">
                    BGN
                  </div>
                )}
                {draftLogos.rightUrl && (
                  <img
                    src={draftLogos.rightUrl}
                    alt="Logo Kanan"
                    style={{ width: `${Math.min(64, draftLogos.rightWidthPx)}px` }}
                    className="h-12 rounded border border-slate-300 bg-white object-contain p-0.5"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setLogoModalSide('left')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="h-3 w-3 text-emerald-600" />
                  Atur Kiri ({draftLogos.leftWidthPx}px)
                </button>
                <button
                  type="button"
                  onClick={() => setLogoModalSide('right')}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="h-3 w-3 text-blue-600" />
                  Atur Kanan ({draftLogos.rightWidthPx}px)
                </button>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.followGlobalLeftLogo !== false}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, followGlobalLeftLogo: e.target.checked }))
                    }
                    className="rounded accent-emerald-600"
                  />
                  Ikuti BGN Global
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.followGlobalRightLogo !== false}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, followGlobalRightLogo: e.target.checked }))
                    }
                    className="rounded accent-blue-600"
                  />
                  Ikuti Kanan Global
                </label>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Teks Bawah Logo
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={draftConfig.logoCaption}
                  onChange={(e) => setDraftConfig((p) => ({ ...p, logoCaption: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Kop Tengah</div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Nama SPPG / Unit
                </label>
                <input
                  type="text"
                  maxLength={150}
                  value={draftConfig.unitName}
                  onChange={(e) => setDraftConfig((p) => ({ ...p, unitName: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Label Form
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.formLabel}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, formLabel: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Judul Form
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={draftConfig.formTitle}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, formTitle: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">Identitas Dokumen &amp; Periode</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    No. Dokumen
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.docNumber}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, docNumber: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Revisi
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={draftConfig.revision}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, revision: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Tanggal Berlaku
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.effectiveDate}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, effectiveDate: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Periode
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={draftConfig.periodeLabel}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, periodeLabel: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Editable Table Labels */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">Edit Label Baris &amp; Header Tabel</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {(
                [
                  ['kegiatan', 'Header Kegiatan'],
                  ['tanggal', 'Header Tanggal'],
                  ['jam', 'Baris Jam'],
                  ['suhu', 'Baris Suhu'],
                  ['rh', 'Baris RH'],
                  ['paraf', 'Baris Paraf'],
                  ['namaPetugas', 'Baris Petugas'],
                ] as Array<[keyof TempTableLabels, string]>
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{label}</label>
                  <input
                    type="text"
                    value={draftLabels[key]}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        tableLabels: {
                          ...DEFAULT_TEMP_TABLE_LABELS,
                          ...(prev.tableLabels || {}),
                          [key]: e.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3. Active Room & SOP BGN Pusat Standards Editor */}
          {draftRoom && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
              <div className="text-xs font-semibold text-slate-800">
                Edit Lokasi Aktif &amp; Standar Suhu SOP BGN Pusat
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Nama Lokasi / Ruangan Aktif
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={draftRoom.roomName}
                    onChange={(e) =>
                      setDraftRoom((p) => (p ? { ...p, roomName: e.target.value } : p))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Standar Suhu SOP BGN (°C)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={draftRoom.standardSuhu}
                    onChange={(e) =>
                      setDraftRoom((p) => (p ? { ...p, standardSuhu: e.target.value } : p))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Standar Kelembapan RH (%)
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={draftRoom.standardRh}
                    onChange={(e) =>
                      setDraftRoom((p) => (p ? { ...p, standardRh: e.target.value } : p))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Catatan / Ketentuan SOP Ruangan
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={draftRoom.sopNote}
                  onChange={(e) =>
                    setDraftRoom((p) => (p ? { ...p, sopNote: e.target.value } : p))
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Judul Tabel Standar SOP BGN (Bawah Tabel)
                  </label>
                  <input
                    type="text"
                    maxLength={150}
                    value={draftConfig.sopTitle}
                    onChange={(e) => setDraftConfig((p) => ({ ...p, sopTitle: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Keterangan SOP BGN
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={draftConfig.sopSubtitle}
                    onChange={(e) =>
                      setDraftConfig((p) => ({ ...p, sopSubtitle: e.target.value }))
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowFormatEditor(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={savingConfig || savingRoom}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {savingConfig || savingRoom ? 'Menyimpan...' : 'Simpan Format & SOP'}
            </button>
          </div>
        </form>
      )}

      {/* Official Spreadsheet Sheet Matching image_70fe0da2.png */}
      {activeRoom && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto p-5 sm:p-6">
            <div className="min-w-[1260px] bg-white text-black">
              {/* 1. Official 3-Column Header Box */}
              <table className="w-full border-collapse border border-black text-black">
                <tbody>
                  <tr>
                    <td
                      rowSpan={3}
                      className="w-[126px] border-r border-black p-2 text-center align-middle"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        {displayLogos.leftUrl ? (
                          <img
                            src={displayLogos.leftUrl}
                            alt={config.logoCaption}
                            style={{ width: `${displayLogos.leftWidthPx}px`, height: 'auto', maxHeight: '72px' }}
                            className="object-contain"
                          />
                        ) : (
                          <svg
                            viewBox="0 0 64 64"
                            style={{ width: `${displayLogos.leftWidthPx}px`, height: `${displayLogos.leftWidthPx}px`, maxHeight: '72px' }}
                            className="text-slate-800"
                            aria-hidden="true"
                          >
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              fill="#eef2f7"
                              stroke="#1e293b"
                              strokeWidth="2.2"
                            />
                            <circle
                              cx="32"
                              cy="32"
                              r="21"
                              fill="none"
                              stroke="#475569"
                              strokeWidth="1.2"
                            />
                            <text
                              x="32"
                              y="36"
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="bold"
                              fill="#0f172a"
                            >
                              BGN
                            </text>
                          </svg>
                        )}
                        <span className="text-[10px] font-bold leading-tight text-black">
                          {config.logoCaption}
                        </span>
                      </div>
                    </td>
                    <td className="border-r border-b border-black px-3 py-1.5 text-center text-[13px] font-bold tracking-wide uppercase">
                      {config.unitName}
                    </td>
                    <td className="w-[290px] border-b border-black px-3 py-1.5 text-[11px]">
                      <div className="grid grid-cols-[100px_10px_1fr]">
                        <span className="font-bold">No. Dokumen</span>
                        <span className="font-bold">:</span>
                        <span>{config.docNumber}</span>
                      </div>
                    </td>
                    {displayLogos.rightUrl && (
                      <td
                        rowSpan={3}
                        className="w-[115px] border-l border-black p-2 text-center align-middle"
                      >
                        <img
                          src={displayLogos.rightUrl}
                          alt="Logo Kanan"
                          style={{ width: `${displayLogos.rightWidthPx}px`, height: 'auto', maxHeight: '72px' }}
                          className="mx-auto object-contain"
                        />
                      </td>
                    )}
                  </tr>
                  <tr>
                    <td className="border-r border-b border-black px-3 py-1.5 text-center text-[13px] font-bold">
                      {config.formLabel}
                    </td>
                    <td className="border-b border-black px-3 py-1.5 text-[11px]">
                      <div className="grid grid-cols-[100px_10px_1fr]">
                        <span className="font-bold">Revisi</span>
                        <span className="font-bold">:</span>
                        <span>{config.revision}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border-r border-black px-3 py-1.5 text-center text-[12px] font-bold uppercase">
                      {config.formTitle}
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">
                      <div className="grid grid-cols-[100px_10px_1fr]">
                        <span className="font-bold">Tanggal Berlaku</span>
                        <span className="font-bold">:</span>
                        <span>{config.effectiveDate}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 2. Periode & Lokasi Lines */}
              <div className="mt-3 mb-2 flex items-center justify-between px-0.5 text-[12px] text-black">
                <div className="space-y-1">
                  <div className="grid grid-cols-[64px_12px_auto] items-center">
                    <span className="font-bold">Periode</span>
                    <span className="font-bold">:</span>
                    <span>{config.periodeLabel}</span>
                  </div>
                  <div className="grid grid-cols-[64px_12px_auto] items-center">
                    <span className="font-bold">Lokasi</span>
                    <span className="font-bold">:</span>
                    <span className="font-semibold">{activeRoom.roomName}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFormatEditor(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-700"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit Kop / Lokasi
                </button>
              </div>

              {/* 3. 33-Column Daily Temperature & Humidity Grid (Kegiatan + TANGGAL 1..31) */}
              <table className="w-full border-collapse border border-black text-[11px] text-black table-fixed">
                <colgroup>
                  <col className="w-[28px]" />
                  <col className="w-[96px]" />
                  {DAYS_1_TO_31.map((d) => (
                    <col key={`col-${d}`} className="w-[36px]" />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#DDEBF7' }}>
                    <th
                      colSpan={2}
                      rowSpan={2}
                      className="border-r border-b border-black px-1 py-2 text-center font-bold"
                    >
                      {labels.kegiatan}
                    </th>
                    <th
                      colSpan={31}
                      className="border-b border-black py-1 text-center font-bold tracking-wide"
                    >
                      {labels.tanggal}
                    </th>
                  </tr>
                  <tr style={{ backgroundColor: '#DDEBF7' }}>
                    {DAYS_1_TO_31.map((d) => {
                      const hasPhoto = Boolean(localDays[d]?.photoDataUrl);
                      return (
                        <th
                          key={`th-${d}`}
                          className="border-l border-b border-black p-0 text-center font-bold"
                        >
                          <button
                            type="button"
                            onClick={() => setPhotoModalState({ open: true, day: d })}
                            title={`Klik tanggal ${d} untuk foto/deteksi suhu otomatis atau lihat foto bukti`}
                            className={`flex w-full items-center justify-center gap-0.5 py-1 hover:bg-sky-200/70 transition-colors ${
                              hasPhoto ? 'text-emerald-800 underline decoration-emerald-600' : ''
                            }`}
                          >
                            <span>{d}</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Row: Jam */}
                  <tr className="border-b border-black">
                    <td
                      colSpan={2}
                      className="border-r border-black px-2 py-1 text-right font-bold"
                    >
                      {labels.jam}
                    </td>
                    {DAYS_1_TO_31.map((d) => (
                      <td key={`jam-${d}`} className="border-r border-black p-0 last:border-r-0">
                        <input
                          type="text"
                          value={localDays[d]?.jam || ''}
                          onChange={(e) => handleDayFieldChange(d, 'jam', e.target.value)}
                          onBlur={() => void handleDayFieldBlur(d)}
                          aria-label={`Jam tanggal ${d}`}
                          className="font-mono-num w-full bg-transparent px-0.5 py-1 text-center text-[10px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Row 1: Suhu (°C) */}
                  <tr className="border-b border-black h-[46px]">
                    <td className="border-r border-black text-center font-normal">1</td>
                    <td className="border-r border-black px-1.5 text-center font-normal">
                      {labels.suhu}
                    </td>
                    {DAYS_1_TO_31.map((d) => (
                      <td key={`suhu-${d}`} className="border-r border-black p-0 last:border-r-0">
                        <input
                          type="text"
                          value={localDays[d]?.suhu || ''}
                          onChange={(e) => handleDayFieldChange(d, 'suhu', e.target.value)}
                          onBlur={() => void handleDayFieldBlur(d)}
                          aria-label={`Suhu tanggal ${d}`}
                          className="font-mono-num h-[46px] w-full bg-transparent px-0.5 text-center text-[11px] font-semibold text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Row 2: RH (%) */}
                  <tr className="border-b border-black h-[46px]">
                    <td className="border-r border-black text-center font-normal">2</td>
                    <td className="border-r border-black px-1.5 text-center font-normal">
                      {labels.rh}
                    </td>
                    {DAYS_1_TO_31.map((d) => (
                      <td key={`rh-${d}`} className="border-r border-black p-0 last:border-r-0">
                        <input
                          type="text"
                          value={localDays[d]?.rh || ''}
                          onChange={(e) => handleDayFieldChange(d, 'rh', e.target.value)}
                          onBlur={() => void handleDayFieldBlur(d)}
                          aria-label={`Kelembapan RH tanggal ${d}`}
                          className="font-mono-num h-[46px] w-full bg-transparent px-0.5 text-center text-[11px] font-semibold text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Row: PARAF PETUGAS */}
                  <tr className="border-b border-black h-[38px]">
                    <td
                      colSpan={2}
                      className="border-r border-black px-1.5 text-center font-bold leading-tight"
                    >
                      {labels.paraf}
                    </td>
                    {DAYS_1_TO_31.map((d) => (
                      <td key={`paraf-${d}`} className="border-r border-black p-0 last:border-r-0">
                        <input
                          type="text"
                          value={localDays[d]?.paraf || ''}
                          onChange={(e) => handleDayFieldChange(d, 'paraf', e.target.value)}
                          onBlur={() => void handleDayFieldBlur(d)}
                          aria-label={`Paraf petugas tanggal ${d}`}
                          className="h-[38px] w-full bg-transparent px-0.5 text-center text-[11px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Row: NAMA PETUGAS */}
                  <tr className="border-b border-black h-[46px]">
                    <td
                      colSpan={2}
                      className="border-r border-black px-1.5 text-center font-bold leading-tight"
                    >
                      {labels.namaPetugas}
                    </td>
                    {DAYS_1_TO_31.map((d) => (
                      <td key={`nama-${d}`} className="border-r border-black p-0 last:border-r-0">
                        <input
                          type="text"
                          value={localDays[d]?.namaPetugas || ''}
                          onChange={(e) => handleDayFieldChange(d, 'namaPetugas', e.target.value)}
                          onBlur={() => void handleDayFieldBlur(d)}
                          aria-label={`Nama petugas tanggal ${d}`}
                          className="h-[46px] w-full bg-transparent px-0.5 text-center text-[9.5px] text-black focus:bg-emerald-50 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Interactive Photo Capture Strip per Date (not printed in official grid; web helper) */}
                  <tr className="bg-slate-50">
                    <td
                      colSpan={2}
                      className="border-r border-black px-1.5 py-1 text-center text-[10px] font-semibold text-slate-600"
                    >
                      Foto Suhu
                    </td>
                    {DAYS_1_TO_31.map((d) => {
                      const hasPhoto = Boolean(localDays[d]?.photoDataUrl);
                      return (
                        <td
                          key={`cam-${d}`}
                          className="border-r border-black p-0.5 text-center last:border-r-0"
                        >
                          <button
                            type="button"
                            onClick={() => setPhotoModalState({ open: true, day: d })}
                            title={
                              hasPhoto
                                ? `Lihat / ganti foto suhu tanggal ${d}`
                                : `Ambil / unggah foto suhu otomatis tanggal ${d}`
                            }
                            className={`mx-auto flex h-6 w-6 items-center justify-center rounded transition-colors ${
                              hasPhoto
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                            }`}
                          >
                            <Camera className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              {/* 4. Standar Suhu Berdasarkan SOP BGN Pusat (Below Monitoring Table) */}
              <div className="mt-5 border border-black bg-white">
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-black px-3 py-1.5"
                  style={{ backgroundColor: '#DDEBF7' }}
                >
                  <div>
                    <div className="text-[11px] font-bold text-black uppercase">
                      {config.sopTitle}
                    </div>
                    <div className="text-[10px] text-slate-800">{config.sopSubtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormatEditor(true)}
                    className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-2.5 w-2.5" />
                    Edit Standar SOP
                  </button>
                </div>

                <table className="w-full border-collapse text-[10.5px] text-black">
                  <thead>
                    <tr className="border-b border-black bg-slate-100">
                      <th className="w-[40px] border-r border-black px-2 py-1 text-center font-bold">
                        No
                      </th>
                      <th className="w-[190px] border-r border-black px-2 py-1 text-left font-bold">
                        Lokasi / Ruangan
                      </th>
                      <th className="w-[260px] border-r border-black px-2 py-1 text-left font-bold">
                        Standar Suhu (°C) — SOP BGN Pusat
                      </th>
                      <th className="w-[140px] border-r border-black px-2 py-1 text-center font-bold">
                        Standar RH (%)
                      </th>
                      <th className="px-2 py-1 text-left font-bold">Keterangan / Ketentuan SOP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedSopRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`border-b border-black last:border-b-0 ${
                          row.isActive ? 'bg-emerald-50 font-semibold' : ''
                        }`}
                      >
                        <td className="border-r border-black px-2 py-1 text-center">{idx + 1}</td>
                        <td className="border-r border-black px-2 py-1">
                          <span>{row.name}</span>
                          {row.isActive && (
                            <span className="ml-1.5 text-[9px] font-bold text-emerald-700">
                              (Lokasi Aktif)
                            </span>
                          )}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-1">
                          {row.standardSuhu}
                        </td>
                        <td className="font-mono-num border-r border-black px-2 py-1 text-center">
                          {row.standardRh}
                        </td>
                        <td className="px-2 py-1">{row.sopNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Upload / Live Camera & Auto-Detect Modal */}
      {photoModalState.open && activeRoom && (
        <TempPhotoDetectModal
          room={activeRoom}
          initialDay={photoModalState.day}
          existingReading={localDays[photoModalState.day] || null}
          defaultOfficerName={profile.namaSppi || ''}
          onClose={() => setPhotoModalState((p) => ({ ...p, open: false }))}
          onSaveDayReading={(payload) => onSaveDayReading(activeRoom.id, payload)}
        />
      )}

      <LogoUploadModal
        open={logoModalSide !== null}
        title={
          logoModalSide === 'left'
            ? 'Atur Logo Kiri (BGN) — Monitoring Suhu Ruangan'
            : 'Atur Logo Kanan — Monitoring Suhu Ruangan'
        }
        side={logoModalSide || 'left'}
        initialDataUrl={logoModalSide === 'left' ? draftLogos.leftUrl : draftLogos.rightUrl}
        initialWidthPx={
          logoModalSide === 'left' ? draftLogos.leftWidthPx : draftLogos.rightWidthPx
        }
        headerLine1={draftConfig.unitName || profile.namaSppg}
        headerLine2={draftConfig.formLabel}
        headerLine3={draftConfig.formTitle}
        allowSyncGlobal={Boolean(onSyncGlobalLeftLogo)}
        onClose={() => setLogoModalSide(null)}
        onApply={handleApplyLogoModal}
      />
    </div>
  );
};
