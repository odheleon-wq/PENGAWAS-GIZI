import React, { useEffect, useState } from 'react';
import { CheckCircle2, Save, Sparkles } from 'lucide-react';
import type { SppgUserProfile } from '../types';

interface SppgProfileFormProps {
  profile: SppgUserProfile;
  isFirstTime?: boolean;
  onSave: (
    data: Omit<SppgUserProfile, 'uid' | 'email' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
}

export const SppgProfileForm: React.FC<SppgProfileFormProps> = ({
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
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setReportTitle(profile.reportTitle || 'REKAPAN MENU SMP');
    setNamaSppg(profile.namaSppg || '');
    setIdSppg(profile.idSppg || '');
    setAlamat(profile.alamat || '');
    setKabKota(profile.kabKota || '');
    setProvinsi(profile.provinsi || '');
    setNamaSppi(profile.namaSppi || '');
    setNomorHp(profile.nomorHp || '');
  }, [profile]);

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
      await onSave({
        reportTitle: reportTitle.trim() || 'REKAPAN MENU SMP',
        namaSppg: namaSppg.trim(),
        idSppg: idSppg.trim(),
        alamat: alamat.trim(),
        kabKota: kabKota.trim(),
        provinsi: provinsi.trim(),
        namaSppi: namaSppi.trim(),
        nomorHp: nomorHp.trim(),
      });
      setSavedNotice(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan identitas SPPG.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {isFirstTime ? 'Lengkapi Identitas SPPG' : 'Identitas SPPG & Format Kepala Laporan'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Data ini otomatis mengisi kop tabel pada seluruh formulir serta hasil ekspor PDF F4.
          </p>
        </div>
        <button
          type="button"
          onClick={handleApplyTemplate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          Isi Contoh Format
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {errorMsg}
          </div>
        )}
        {savedNotice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            Identitas SPPG berhasil disimpan ke dashboard.
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
    </div>
  );
};
