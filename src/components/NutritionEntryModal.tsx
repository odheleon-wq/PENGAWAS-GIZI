import React, { useState } from 'react';
import { Copy, Save, X } from 'lucide-react';
import {
  CATEGORY_MAP,
  TARGET_CATEGORIES,
  createEmptyNutritionValues,
} from '../constants/nutritionCategories';
import type { DailyMenuEntry, NutritionValues, TargetCategoryId } from '../types';
import { formatIndonesianFullDate } from '../utils/dateUtils';

interface NutritionEntryModalProps {
  entry: DailyMenuEntry;
  selectedCategories: TargetCategoryId[];
  onClose: () => void;
  onSave: (
    entryId: string,
    nutritionByCategory: Partial<Record<TargetCategoryId, NutritionValues>>,
    updatedNamaMenu?: string
  ) => Promise<void>;
}

export const NutritionEntryModal: React.FC<NutritionEntryModalProps> = ({
  entry,
  selectedCategories,
  onClose,
  onSave,
}) => {
  const initialActiveCat: TargetCategoryId =
    selectedCategories[0] || TARGET_CATEGORIES[3].id; // default Siswa SMP/MTS/SMPLB

  const [activeCat, setActiveCat] = useState<TargetCategoryId>(initialActiveCat);
  const [namaMenu, setNamaMenu] = useState(entry.namaMenu);
  const [nutritionMap, setNutritionMap] = useState<
    Partial<Record<TargetCategoryId, NutritionValues>>
  >(() => ({ ...(entry.nutritionByCategory || {}) }));
  const [saving, setSaving] = useState(false);
  const [copiedNote, setCopiedNote] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentValues = nutritionMap[activeCat] || createEmptyNutritionValues();

  const updateField = (field: keyof NutritionValues, rawValue: string) => {
    const parsed = rawValue === '' ? 0 : Math.max(0, Number(rawValue));
    setNutritionMap((prev) => ({
      ...prev,
      [activeCat]: {
        ...(prev[activeCat] || createEmptyNutritionValues()),
        [field]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  };

  const handleCopyToSelected = () => {
    const targets = selectedCategories.length > 0 ? selectedCategories : [activeCat];
    const source = nutritionMap[activeCat] || createEmptyNutritionValues();
    setNutritionMap((prev) => {
      const next = { ...prev };
      targets.forEach((catId) => {
        next[catId] = { ...source };
      });
      return next;
    });
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaving(true);
    try {
      const menuChanged = namaMenu.trim() !== entry.namaMenu.trim() ? namaMenu.trim() : undefined;
      await onSave(entry.id, nutritionMap, menuChanged);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data nilai gizi.');
      setSaving(false);
    }
  };

  const categoryTabs =
    selectedCategories.length > 0
      ? selectedCategories
      : TARGET_CATEGORIES.map((c) => c.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Input Nilai Gizi Harian"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Input Nilai Gizi · {formatIndonesianFullDate(entry.dateIso)}
            </h3>
            <p className="text-xs text-slate-500">
              Menu otomatis tersinkron dengan Tabel Rekapan Nama Menu.
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

          {/* Synced Menu Name */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nama Menu (Sinkron Otomatis)
            </label>
            <textarea
              rows={2}
              value={namaMenu}
              onChange={(e) => setNamaMenu(e.target.value)}
              maxLength={1000}
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Category Switcher */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Pilih Kategori Kelompok Sasaran untuk Diisi
              </label>
              <select
                value={activeCat}
                onChange={(e) => setActiveCat(e.target.value as TargetCategoryId)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none"
              >
                {TARGET_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {categoryTabs.map((catId) => {
                const isActive = catId === activeCat;
                const val = nutritionMap[catId];
                const hasData = Boolean(val && (val.energi > 0 || val.protein > 0 || val.jumlahManfaat > 0));
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => setActiveCat(catId)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold'
                        : hasData
                        ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {CATEGORY_MAP[catId]?.label}
                    {hasData ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6 Nutrition Inputs */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                Nilai Gizi: {CATEGORY_MAP[activeCat]?.label}
              </span>
              {selectedCategories.length > 1 && (
                <button
                  type="button"
                  onClick={handleCopyToSelected}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Salin ke {selectedCategories.length} Kategori Terpilih
                </button>
              )}
            </div>

            {copiedNote && (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                Nilai gizi berhasil disalin ke semua kategori yang sedang digabungkan.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Energi (kkal)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={currentValues.energi || ''}
                  placeholder="0.0"
                  onChange={(e) => updateField('energi', e.target.value)}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Protein (gram)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={currentValues.protein || ''}
                  placeholder="0.0"
                  onChange={(e) => updateField('protein', e.target.value)}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Lemak (gram)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={currentValues.lemak || ''}
                  placeholder="0.0"
                  onChange={(e) => updateField('lemak', e.target.value)}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Karbohidrat (gram)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={currentValues.karbohidrat || ''}
                  placeholder="0.0"
                  onChange={(e) => updateField('karbohidrat', e.target.value)}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Serat (gram)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={currentValues.serat || ''}
                  placeholder="0.0"
                  onChange={(e) => updateField('serat', e.target.value)}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Jumlah Manfaat (Orang)
                </label>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={currentValues.jumlahManfaat || ''}
                  placeholder="0"
                  onChange={(e) => updateField('jumlahManfaat', e.target.value)}
                  className="font-mono-num w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
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
              {saving ? 'Menyimpan...' : 'Simpan Nilai Gizi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
