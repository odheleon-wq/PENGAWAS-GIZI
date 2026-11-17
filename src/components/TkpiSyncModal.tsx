import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { TkpiFoodItem, TkpiSyncConfig } from '../types';
import {
  BASE_TKPI_2020_ITEMS,
  mergeTkpiCatalog,
  normalizeGoogleSheetsCsvUrl,
  parseTkpiSpreadsheetCsv,
} from '../utils/tkpiCsvParser';

interface TkpiSyncModalProps {
  open: boolean;
  config: TkpiSyncConfig | null;
  onClose: () => void;
  onSaveConfig: (next: Omit<TkpiSyncConfig, 'uid' | 'updatedAt'>) => Promise<void>;
}

export const TkpiSyncModal: React.FC<TkpiSyncModalProps> = ({
  open,
  config,
  onClose,
  onSaveConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'manual' | 'browse'>('sync');
  const [urlInput, setUrlInput] = useState(config?.spreadsheetUrl || '');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [newNama, setNewNama] = useState('');
  const [newBdd, setNewBdd] = useState('100');
  const [newEnergi, setNewEnergi] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newLemak, setNewLemak] = useState('');
  const [newKh, setNewKh] = useState('');
  const [newSerat, setNewSerat] = useState('');
  const [newHarga, setNewHarga] = useState('');
  const [newSatuan, setNewSatuan] = useState('Kg');

  const syncedItems = config?.syncedItems || [];
  const customItems = config?.customItems || [];

  const mergedCatalog = useMemo(
    () => mergeTkpiCatalog(syncedItems, customItems),
    [syncedItems, customItems]
  );

  const filteredBrowse = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? mergedCatalog.filter(
          (i) =>
            i.namaBahan.toLowerCase().includes(q) ||
            i.sumber.toLowerCase().includes(q) ||
            i.no.toLowerCase().includes(q)
        )
      : mergedCatalog;
    return list.slice(0, 80);
  }, [mergedCatalog, searchQuery]);

  if (!open) return null;

  const handleSyncFromLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setSyncStatus({ type: 'err', msg: 'Masukkan link Google Sheets atau URL CSV terlebih dahulu.' });
      return;
    }

    setSyncing(true);
    setSyncStatus(null);
    try {
      let csvText = '';
      // Prefer server proxy to avoid browser CORS blocks on Google Sheets links
      const proxyResp = await fetch('/api/fetch-tkpi-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      if (proxyResp.ok) {
        const json = (await proxyResp.json()) as { csvText?: string; error?: string };
        if (json.csvText) {
          csvText = json.csvText;
        }
      } else {
        const errBody = (await proxyResp.json().catch(() => ({}))) as { error?: string };
        // Fallback direct browser fetch only if proxy failed on network
        const normalized = normalizeGoogleSheetsCsvUrl(trimmed);
        const directResp = await fetch(normalized).catch(() => null);
        if (directResp && directResp.ok) {
          csvText = await directResp.text();
        } else {
          throw new Error(errBody.error || 'Gagal menyinkronkan link spreadsheet.');
        }
      }

      const parsed = parseTkpiSpreadsheetCsv(csvText, 'spreadsheet');
      if (parsed.length === 0) {
        throw new Error(
          'Tidak ditemukan baris bahan makanan yang valid. Pastikan kolom mencakup NAMA BAHAN, % BDD, ENERGI, PROTEIN, LEMAK, KH, dan SERAT.'
        );
      }

      const nowStr = new Date().toLocaleString('id-ID');
      await onSaveConfig({
        spreadsheetUrl: trimmed,
        lastSyncedAt: nowStr,
        syncedItems: parsed,
        customItems,
      });

      const baseNames = new Set(BASE_TKPI_2020_ITEMS.map((b) => b.namaBahan.toLowerCase()));
      const newAdditions = parsed.filter((p) => !baseNames.has(p.namaBahan.toLowerCase())).length;

      setSyncStatus({
        type: 'ok',
        msg: `Sinkronisasi berhasil! Terbaca ${parsed.length} baris dari spreadsheet (${newAdditions} bahan tambahan di luar TKPI dasar).`,
      });
    } catch (err) {
      setSyncStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Gagal membaca spreadsheet.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleUploadCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncing(true);
    setSyncStatus(null);
    try {
      const text = await file.text();
      const parsed = parseTkpiSpreadsheetCsv(text, 'spreadsheet');
      if (parsed.length === 0) {
        throw new Error('File CSV tidak memuat data bahan makanan yang dikenali.');
      }
      await onSaveConfig({
        spreadsheetUrl: urlInput.trim() || `Upload: ${file.name}`,
        lastSyncedAt: new Date().toLocaleString('id-ID'),
        syncedItems: parsed,
        customItems,
      });
      setSyncStatus({
        type: 'ok',
        msg: `Berhasil mengimpor ${parsed.length} bahan dari file "${file.name}".`,
      });
    } catch (err) {
      setSyncStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Gagal membaca file CSV.',
      });
    } finally {
      setSyncing(false);
      e.target.value = '';
    }
  };

  const handleAddCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const nama = newNama.trim();
    if (!nama) return;

    const item: TkpiFoodItem = {
      id: `custom_${Date.now().toString(36)}`,
      no: `M${customItems.length + 1}`,
      namaBahan: nama,
      sumber: 'Input Manual SPPG',
      beratStandar: 100,
      bdd: Math.max(1, parseFloat(newBdd) || 100),
      energi: Math.max(0, parseFloat(newEnergi) || 0),
      protein: Math.max(0, parseFloat(newProtein) || 0),
      lemak: Math.max(0, parseFloat(newLemak) || 0),
      kh: Math.max(0, parseFloat(newKh) || 0),
      serat: Math.max(0, parseFloat(newSerat) || 0),
      ...(parseFloat(newHarga) > 0 ? { defaultHargaSatuan: parseFloat(newHarga) } : {}),
      ...(newSatuan.trim() ? { defaultSatuan: newSatuan.trim() } : {}),
      sourceType: 'manual',
    };

    await onSaveConfig({
      spreadsheetUrl: config?.spreadsheetUrl || urlInput.trim(),
      lastSyncedAt: config?.lastSyncedAt || '',
      syncedItems,
      customItems: [...customItems, item],
    });

    setNewNama('');
    setNewBdd('100');
    setNewEnergi('');
    setNewProtein('');
    setNewLemak('');
    setNewKh('');
    setNewSerat('');
    setNewHarga('');
    setSyncStatus({ type: 'ok', msg: `Bahan "${nama}" ditambahkan ke rujukan TKPI.` });
  };

  const handleDeleteCustomItem = async (id: string) => {
    await onSaveConfig({
      spreadsheetUrl: config?.spreadsheetUrl || '',
      lastSyncedAt: config?.lastSyncedAt || '',
      syncedItems,
      customItems: customItems.filter((i) => i.id !== id),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Referensi TKPI 2020 & Sinkronisasi Spreadsheet
              </h3>
              <p className="text-xs text-slate-500 font-mono-num">
                Total aktif: {mergedCatalog.length} bahan ({BASE_TKPI_2020_ITEMS.length} TKPI 2020 dasar ·{' '}
                {syncedItems.length} spreadsheet · {customItems.length} manual)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Subtabs */}
        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-5 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'sync'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sinkronkan Link Spreadsheet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'manual'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tambah Bahan Manual ({customItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'browse'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Jelajah Tabel TKPI ({mergedCatalog.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {syncStatus && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                syncStatus.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{syncStatus.msg}</span>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-4">
              <form onSubmit={handleSyncFromLink} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-800">
                  Link Google Sheets TKPI 2020 / URL CSV
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Link2 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={syncing}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Menyinkronkan...' : 'Sinkronkan Ulang'}
                  </button>
                </div>
                {config?.lastSyncedAt && (
                  <p className="text-[11px] text-slate-500">
                    Terakhir disinkronkan: <span className="font-semibold">{config.lastSyncedAt}</span>
                  </p>
                )}
              </form>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  Cara menambah bahan di Spreadsheet agar terbaca otomatis:
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Buka spreadsheet TKPI 2020 Anda di Google Sheets lalu tambahkan baris bahan baru beserta kolom{' '}
                    <code className="rounded bg-white px-1 py-0.5 text-[11px] border border-slate-200">
                      NAMA BAHAN, % BDD, ENERGI, PROTEIN, LEMAK, KH, SERAT
                    </code>
                    .
                  </li>
                  <li>
                    Pastikan izin Bagikan diset <strong>&quot;Siapa saja yang memiliki link dapat melihat&quot;</strong> (atau gunakan File → Bagikan → Publikasikan ke web CSV).
                  </li>
                  <li>
                    Tempel link Google Sheets di atas dan klik <strong>Sinkronkan Ulang</strong>. Semua bahan baru otomatis tersedia di formulir Nilai Gizi & Food Cost.
                  </li>
                </ol>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-300 p-4">
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Atau Unggah File CSV Spreadsheet
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Gunakan hasil ekspor .csv dari Excel / Google Sheets jika link bersifat privat.
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                  Pilih File CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleUploadCsvFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddCustomItem}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
              >
                <div className="text-xs font-bold text-slate-800">
                  Tambah Bahan Makanan Kustom (Nilai Gizi per 100 gram)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Nama Bahan Makanan *
                    </label>
                    <input
                      type="text"
                      required
                      value={newNama}
                      onChange={(e) => setNewNama(e.target.value)}
                      placeholder="Contoh: Kecap Manis Bango"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      % BDD
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newBdd}
                      onChange={(e) => setNewBdd(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Harga Satuan (Rp)
                    </label>
                    <input
                      type="number"
                      value={newHarga}
                      onChange={(e) => setNewHarga(e.target.value)}
                      placeholder="Opsional"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Energi (kkal)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newEnergi}
                      onChange={(e) => setNewEnergi(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Protein (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newProtein}
                      onChange={(e) => setNewProtein(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Lemak (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newLemak}
                      onChange={(e) => setNewLemak(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      KH (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newKh}
                      onChange={(e) => setNewKh(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Serat (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={newSerat}
                      onChange={(e) => setNewSerat(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Satuan Default
                    </label>
                    <input
                      type="text"
                      value={newSatuan}
                      onChange={(e) => setNewSatuan(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Simpan ke Katalog Bahan
                  </button>
                </div>
              </form>

              {customItems.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2">Nama Bahan</th>
                        <th className="px-2 py-2 text-right">BDD</th>
                        <th className="px-2 py-2 text-right">Energi</th>
                        <th className="px-2 py-2 text-right">Prot</th>
                        <th className="px-2 py-2 text-right">Lemak</th>
                        <th className="px-2 py-2 text-right">KH</th>
                        <th className="px-2 py-2 text-right">Serat</th>
                        <th className="px-2 py-2 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {customItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-medium text-slate-900">{item.namaBahan}</td>
                          <td className="px-2 py-2 text-right font-mono-num">{item.bdd}%</td>
                          <td className="px-2 py-2 text-right font-mono-num">{item.energi}</td>
                          <td className="px-2 py-2 text-right font-mono-num">{item.protein}</td>
                          <td className="px-2 py-2 text-right font-mono-num">{item.lemak}</td>
                          <td className="px-2 py-2 text-right font-mono-num">{item.kh}</td>
                          <td className="px-2 py-2 text-right font-mono-num">{item.serat}</td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomItem(item.id)}
                              className="text-rose-600 hover:text-rose-800"
                              title="Hapus bahan manual"
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'browse' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari bahan TKPI 2020 (misal: Beras, Telur, Tempe, Wortel, Semangka...)"
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Nama Bahan</th>
                      <th className="px-2 py-2">Sumber</th>
                      <th className="px-2 py-2 text-right">% BDD</th>
                      <th className="px-2 py-2 text-right">Energi</th>
                      <th className="px-2 py-2 text-right">Prot</th>
                      <th className="px-2 py-2 text-right">Lemak</th>
                      <th className="px-2 py-2 text-right">KH</th>
                      <th className="px-2 py-2 text-right">Serat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBrowse.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-medium text-slate-900">{item.namaBahan}</td>
                        <td className="px-2 py-1.5 text-[11px] text-slate-500">
                          {item.sourceType === 'manual'
                            ? 'Manual'
                            : item.sourceType === 'spreadsheet'
                            ? 'Spreadsheet'
                            : item.sumber}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{item.bdd}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{item.energi}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{item.protein}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{item.lemak}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{item.kh}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{item.serat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                Menampilkan maksimal 80 hasil pencarian teratas dari total {mergedCatalog.length} bahan TKPI 2020.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
