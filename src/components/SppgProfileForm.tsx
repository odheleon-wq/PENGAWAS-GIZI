import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Link2, Save, Sparkles } from 'lucide-react';
import type { LogoDocumentKey, SppgLogoSettings, SppgUserProfile } from '../types';
import {
  buildAllDocsFlagMap,
  LOGO_DOCUMENT_META,
  normalizeLogoSettings,
} from '../utils/logoResolver';
import { useAutoSave } from '../hooks/useAutoSave';
import {
  clearScopedDraftBackup,
  loadScopedDraftBackup,
} from '../utils/sessionStorage';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { LogoUploadModal } from './LogoUploadModal';

interface SppgProfileFormProps {
  uid?: string;
  profile: SppgUserProfile;
  isFirstTime?: boolean;
  onSave: (
    data: Omit<SppgUserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
}

export const SppgProfileForm: React.FC<SppgProfileFormProps> = ({
  uid,
  profile,
  isFirstTime = false,
  onSave,
}) => {
  const [reportTitle, setReportTitle] = useState(profile.reportTitle || 'REKAPAN MENU SMP');
  const [namaSppg, setNamaSppg] = useState(profile.namaSppg || '');
  const [idSppg, setIdSppg] = useState(profile.idSppg || '');
  const [alamat, setAlamat] = useState(profile.alamat || '');
  const [kabKota, setKabKota] = useState(profile.kabKota || '');
  const [provinsi, setProvinsi] = useState(profile.provinsi || '');
  const [namaSppi, setNamaSppi] = useState(profile.namaSppi || '');
  const [nomorHp, setNomorHp] = useState(profile.nomorHp || '');
  const [logoSettings, setLogoSettings] = useState<SppgLogoSettings>(() =>
    normalizeLogoSettings(profile.logoSettings)
  );
  const effectiveUid = uid || profile.uid;
  const serverPayload = useMemo(
    () => ({
      reportTitle: profile.reportTitle || 'REKAPAN MENU SMP',
      namaSppg: profile.namaSppg || '',
      idSppg: profile.idSppg || '',
      alamat: profile.alamat || '',
      kabKota: profile.kabKota || '',
      provinsi: profile.provinsi || '',
      namaSppi: profile.namaSppi || '',
      nomorHp: profile.nomorHp || '',
      logoSettings: normalizeLogoSettings(profile.logoSettings),
    }),
    [profile]
  );
  const serverHash = useMemo(() => JSON.stringify(serverPayload), [serverPayload]);

  const [logoModalSide, setLogoModalSide] = useState<'left' | 'right' | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentPayload = useMemo(
    () => ({
      reportTitle,
      namaSppg,
      idSppg,
      alamat,
      kabKota,
      provinsi,
      namaSppi,
      nomorHp,
      logoSettings,
    }),
    [reportTitle, namaSppg, idSppg, alamat, kabKota, provinsi, namaSppi, nomorHp, logoSettings]
  );

  const lastServerHashRef = useRef<string>(serverHash);
  const lastUidRef = useRef<string>(effectiveUid);
  const currentHashRef = useRef<string>(JSON.stringify(currentPayload));
  currentHashRef.current = JSON.stringify(currentPayload);

  // Restore emergency draft if user closed app before sync finished
  useEffect(() => {
    const recovered = loadScopedDraftBackup<typeof serverPayload>(
      effectiveUid,
      'sppg_profile'
    );
    if (recovered && JSON.stringify(recovered) !== serverHash) {
      setReportTitle(recovered.reportTitle || 'REKAPAN MENU SMP');
      setNamaSppg(recovered.namaSppg || '');
      setIdSppg(recovered.idSppg || '');
      setAlamat(recovered.alamat || '');
      setKabKota(recovered.kabKota || '');
      setProvinsi(recovered.provinsi || '');
      setNamaSppi(recovered.namaSppi || '');
      setNomorHp(recovered.nomorHp || '');
      setLogoSettings(normalizeLogoSettings(recovered.logoSettings));
    }
    // Only on uid change / initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUid]);

  useEffect(() => {
    const uidChanged = lastUidRef.current !== effectiveUid;
    const isClean = currentHashRef.current === lastServerHashRef.current;
    if (uidChanged || isClean) {
      setReportTitle(serverPayload.reportTitle);
      setNamaSppg(serverPayload.namaSppg);
      setIdSppg(serverPayload.idSppg);
      setAlamat(serverPayload.alamat);
      setKabKota(serverPayload.kabKota);
      setProvinsi(serverPayload.provinsi);
      setNamaSppi(serverPayload.namaSppi);
      setNomorHp(serverPayload.nomorHp);
      setLogoSettings(serverPayload.logoSettings);
    }
    lastUidRef.current = effectiveUid;
    lastServerHashRef.current = serverHash;
  }, [effectiveUid, serverHash, serverPayload]);

  const {
    status: autoSaveStatus,
    lastSavedAtLabel,
    errorMessage: autoSaveError,
    markSynced,
  } = useAutoSave({
    value: currentPayload,
    serverHash,
    scopeKey: 'sppg_profile',
    uid: effectiveUid,
    enabled: Boolean(namaSppg.trim() && idSppg.trim()),
    onSave: async (val) => {
      await onSave({
        reportTitle: val.reportTitle.trim() || 'REKAPAN MENU SMP',
        namaSppg: val.namaSppg.trim(),
        idSppg: val.idSppg.trim(),
        alamat: val.alamat.trim(),
        kabKota: val.kabKota.trim(),
        provinsi: val.provinsi.trim(),
        namaSppi: val.namaSppi.trim(),
        nomorHp: val.nomorHp.trim(),
        logoSettings: normalizeLogoSettings(val.logoSettings),
      });
    },
  });

  const handleApplyTemplate = () => {
    setReportTitle('REKAPAN MENU SMP');
    setNamaSppg('SPPG MUNA BARAT SAWERIGADI ONDOKE');
    setIdSppg('AT9ENIQ6');
    setAlamat('Jln. Poros Raha-Tondasi Desa Ondoke, Kec. Sawerigadi, Kab. Muna Barat');
    setKabKota('MUNA BARAT');
    setProvinsi('SULAWESI TENGGARA');
    setNamaSppi('LA ODE MUHAMMAD SUKRI YUSUF, S.Tr.Gz');
    setNomorHp('082271095251');
  };

  const toggleDocFlag = (side: 'left' | 'right', key: LogoDocumentKey) => {
    setLogoSettings((prev) => {
      if (side === 'left') {
        const cur = prev.applyLeftToDocs?.[key] !== false;
        return {
          ...prev,
          applyLeftToDocs: { ...prev.applyLeftToDocs, [key]: !cur },
        };
      }
      const cur = prev.applyRightToDocs?.[key] !== false;
      return {
        ...prev,
        applyRightToDocs: { ...prev.applyRightToDocs, [key]: !cur },
      };
    });
  };

  const setAllDocsFlag = (side: 'left' | 'right', val: boolean) => {
    setLogoSettings((prev) => ({
      ...prev,
      ...(side === 'left'
        ? { applyLeftToDocs: buildAllDocsFlagMap(val) }
        : { applyRightToDocs: buildAllDocsFlagMap(val) }),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSavedNotice(false);

    if (!namaSppg.trim() || !idSppg.trim()) {
      setErrorMsg('Nama SPPG dan ID SPPG wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const payloadToSave = {
        reportTitle: reportTitle.trim() || 'REKAPAN MENU SMP',
        namaSppg: namaSppg.trim(),
        idSppg: idSppg.trim(),
        alamat: alamat.trim(),
        kabKota: kabKota.trim(),
        provinsi: provinsi.trim(),
        namaSppi: namaSppi.trim(),
        nomorHp: nomorHp.trim(),
        logoSettings: normalizeLogoSettings(logoSettings),
      };
      await onSave(payloadToSave);
      markSynced(JSON.stringify(payloadToSave));
      clearScopedDraftBackup(effectiveUid, 'sppg_profile');
      setSavedNotice(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan identitas SPPG.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {isFirstTime
              ? 'Lengkapi Identitas SPPG'
              : 'Identitas SPPG & Pengaturan Logo Terpusat'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Data SPPG dan konfigurasi Logo Kiri (BGN) serta Logo Kanan otomatis mengisi seluruh formulir dan ekspor PDF F4 sesuai dokumen yang Anda pilih.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <AutoSaveIndicator
            status={autoSaveStatus}
            lastSavedAtLabel={lastSavedAtLabel}
            errorMessage={autoSaveError}
          />
          <button
            type="button"
            onClick={handleApplyTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            Isi Contoh Format
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {errorMsg}
          </div>
        )}
        {savedNotice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            Identitas SPPG &amp; konfigurasi logo terpusat berhasil disimpan.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Judul Banner Laporan
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              maxLength={100}
              required
              placeholder="REKAPAN MENU SMP"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama SPPG <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={namaSppg}
              onChange={(e) => setNamaSppg(e.target.value)}
              maxLength={150}
              required
              placeholder="SPPG MUNA BARAT SAWERIGADI ONDOKE"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ID SPPG <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={idSppg}
              onChange={(e) => setIdSppg(e.target.value)}
              maxLength={40}
              required
              placeholder="AT9ENIQ6"
              className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 uppercase focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Alamat Lengkap
            </label>
            <input
              type="text"
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              maxLength={300}
              placeholder="Jln. Poros Raha-Tondasi Desa Ondoke, Kec. Sawerigadi, Kab. Muna Barat"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kab/Kota
            </label>
            <input
              type="text"
              value={kabKota}
              onChange={(e) => setKabKota(e.target.value)}
              maxLength={100}
              placeholder="MUNA BARAT"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 uppercase focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Provinsi
            </label>
            <input
              type="text"
              value={provinsi}
              onChange={(e) => setProvinsi(e.target.value)}
              maxLength={100}
              placeholder="SULAWESI TENGGARA"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 uppercase focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama SPPI/AG
            </label>
            <input
              type="text"
              value={namaSppi}
              onChange={(e) => setNamaSppi(e.target.value)}
              maxLength={150}
              placeholder="LA ODE MUHAMMAD SUKRI YUSUF, S.Tr.Gz"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nomor Handphone
            </label>
            <input
              type="tel"
              value={nomorHp}
              onChange={(e) => setNomorHp(e.target.value)}
              maxLength={30}
              placeholder="082271095251"
              className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Centralized Logo Configuration Section */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Pengaturan Logo Kiri (BGN) &amp; Logo Kanan Terpusat
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Unggah logo dan atur lebar ukurannya sebelum diterapkan. Centang dokumen mana saja yang ingin mengikuti logo kiri atau logo kanan secara otomatis.
            </p>
          </div>

          {/* Left & Right Upload Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Logo Kiri (BGN) */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900">Logo Kiri (Utama BGN)</div>
                  <div className="text-[11px] text-slate-500">
                    Sekali ubah, seluruh lembar kerja ikut terupdate
                  </div>
                </div>
                <span className="font-mono-num rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  {logoSettings.leftLogoWidthPx}px
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-16 w-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-1 overflow-hidden shrink-0">
                  {logoSettings.leftLogoDataUrl ? (
                    <img
                      src={logoSettings.leftLogoDataUrl}
                      alt="Logo Kiri BGN"
                      style={{
                        width: `${Math.min(68, logoSettings.leftLogoWidthPx)}px`,
                        height: 'auto',
                        maxHeight: '56px',
                      }}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400">BGN</span>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <button
                    type="button"
                    onClick={() => setLogoModalSide('left')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {logoSettings.leftLogoDataUrl
                      ? 'Ubah / Atur Lebar Logo Kiri'
                      : 'Unggah Logo Kiri BGN'}
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={logoSettings.autoLinkLeftLogo}
                      onChange={(e) =>
                        setLogoSettings((prev) => ({
                          ...prev,
                          autoLinkLeftLogo: e.target.checked,
                        }))
                      }
                      className="rounded accent-emerald-600"
                    />
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Link2 className="h-3 w-3 text-emerald-600" />
                      Hubungkan otomatis ke dokumen terpilih
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Logo Kanan */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900">Logo Kanan (SPPG / Daerah)</div>
                  <div className="text-[11px] text-slate-500">
                    Opsional di sisi kanan kop dokumen pilihan
                  </div>
                </div>
                <span className="font-mono-num rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  {logoSettings.rightLogoWidthPx}px
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-16 w-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-1 overflow-hidden shrink-0">
                  {logoSettings.rightLogoDataUrl ? (
                    <img
                      src={logoSettings.rightLogoDataUrl}
                      alt="Logo Kanan"
                      style={{
                        width: `${Math.min(68, logoSettings.rightLogoWidthPx)}px`,
                        height: 'auto',
                        maxHeight: '56px',
                      }}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400">KANAN</span>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <button
                    type="button"
                    onClick={() => setLogoModalSide('right')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-emerald-600" />
                    {logoSettings.rightLogoDataUrl
                      ? 'Ubah / Atur Lebar Logo Kanan'
                      : 'Unggah Logo Kanan'}
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={logoSettings.autoLinkRightLogo}
                      onChange={(e) =>
                        setLogoSettings((prev) => ({
                          ...prev,
                          autoLinkRightLogo: e.target.checked,
                        }))
                      }
                      className="rounded accent-emerald-600"
                    />
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Link2 className="h-3 w-3 text-emerald-600" />
                      Hubungkan otomatis ke dokumen terpilih
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Live Kop Preview */}
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Pratinjau Kop Surat Bersama
            </div>
            <div className="relative rounded-lg border border-black bg-white px-16 py-3 min-h-[78px] flex flex-col justify-center text-center">
              {logoSettings.leftLogoDataUrl ? (
                <img
                  src={logoSettings.leftLogoDataUrl}
                  alt="Logo Kiri Preview"
                  style={{
                    width: `${logoSettings.leftLogoWidthPx}px`,
                    height: 'auto',
                    maxHeight: '72px',
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 object-contain"
                />
              ) : (
                <div
                  style={{
                    width: `${logoSettings.leftLogoWidthPx}px`,
                    height: `${logoSettings.leftLogoWidthPx}px`,
                    maxHeight: '64px',
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-400 flex items-center justify-center text-[10px] font-bold text-slate-400"
                >
                  BGN
                </div>
              )}

              <div className="text-[11px] font-bold uppercase text-black">BADAN GIZI NASIONAL</div>
              <div className="text-[11px] font-bold uppercase text-black">
                SATUAN PELAYANAN PEMENUHAN GIZI
              </div>
              <div className="text-[11px] font-bold uppercase text-black">
                {namaSppg || 'SPPG'}
              </div>
              <div className="text-[10px] italic underline text-black">
                Alamat : {alamat || '-'}
              </div>

              {logoSettings.rightLogoDataUrl && (
                <img
                  src={logoSettings.rightLogoDataUrl}
                  alt="Logo Kanan Preview"
                  style={{
                    width: `${logoSettings.rightLogoWidthPx}px`,
                    height: 'auto',
                    maxHeight: '72px',
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 object-contain"
                />
              )}
            </div>
          </div>

          {/* Per-Document Matrix Checkboxes */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
              <span className="text-xs font-semibold text-slate-800">
                Terapkan Logo Kiri &amp; Kanan di Dokumen Mana Saja
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="text-slate-500">Logo Kiri:</span>
                <button
                  type="button"
                  onClick={() => setAllDocsFlag('left', true)}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setAllDocsFlag('left', false)}
                  className="font-semibold text-slate-500 hover:underline"
                >
                  Kosongkan
                </button>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">Logo Kanan:</span>
                <button
                  type="button"
                  onClick={() => setAllDocsFlag('right', true)}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setAllDocsFlag('right', false)}
                  className="font-semibold text-slate-500 hover:underline"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {LOGO_DOCUMENT_META.map((item) => {
                const leftOn = logoSettings.applyLeftToDocs?.[item.key] !== false;
                const rightOn = logoSettings.applyRightToDocs?.[item.key] !== false;
                return (
                  <div
                    key={item.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 text-xs hover:bg-slate-50/60"
                  >
                    <div>
                      <span className="font-medium text-slate-800">{item.label}</span>
                      <span className="ml-2 text-[10px] text-slate-400">({item.group})</span>
                    </div>
                    <div className="flex items-center gap-5 shrink-0">
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={leftOn}
                          onChange={() => toggleDocFlag('left', item.key)}
                          className="rounded accent-emerald-600"
                        />
                        Logo Kiri (BGN)
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rightOn}
                          onChange={() => toggleDocFlag('right', item.key)}
                          className="rounded accent-emerald-600"
                        />
                        Logo Kanan
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Menyimpan...' : isFirstTime ? 'Simpan & Buka Dashboard' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>

      <LogoUploadModal
        open={logoModalSide !== null}
        side={logoModalSide || 'left'}
        title={
          logoModalSide === 'left'
            ? 'Unggah & Atur Lebar Logo Kiri (BGN Pusat)'
            : 'Unggah & Atur Lebar Logo Kanan (Unit / Daerah)'
        }
        initialDataUrl={
          logoModalSide === 'left'
            ? logoSettings.leftLogoDataUrl
            : logoSettings.rightLogoDataUrl
        }
        initialWidthPx={
          logoModalSide === 'left'
            ? logoSettings.leftLogoWidthPx
            : logoSettings.rightLogoWidthPx
        }
        headerLine1="BADAN GIZI NASIONAL"
        headerLine2="SATUAN PELAYANAN PEMENUHAN GIZI"
        headerLine3={namaSppg || 'SPPG'}
        allowSyncGlobal={false}
        onClose={() => setLogoModalSide(null)}
        onApply={({ dataUrl, widthPx }) => {
          setLogoSettings((prev) =>
            logoModalSide === 'left'
              ? {
                  ...prev,
                  leftLogoDataUrl: dataUrl,
                  leftLogoWidthPx: widthPx,
                }
              : {
                  ...prev,
                  rightLogoDataUrl: dataUrl,
                  rightLogoWidthPx: widthPx,
                }
          );
        }}
      />
    </div>
  );
};
