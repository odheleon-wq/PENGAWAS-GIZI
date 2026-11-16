export interface SopBgnRoomStandard {
  presetKey: string;
  label: string;
  standardSuhu: string;
  standardRh: string;
  sopNote: string;
}

export const SOP_BGN_ROOM_PRESETS: SopBgnRoomStandard[] = [
  {
    presetKey: 'gudang_basah',
    label: 'Gudang Basah',
    standardSuhu: '0°C – 4°C (Chiller Segar) / 4°C – 10°C (Sayur & Buah)',
    standardRh: '80% – 90%',
    sopNote:
      'Penyimpanan bahan pangan basah/segar (ikan, daging, ayam, telur, sayur, buah); jaga sirkulasi dingin & cegah kondensasi berlebih.',
  },
  {
    presetKey: 'gudang_kering',
    label: 'Gudang Kering',
    standardSuhu: '19°C – 25°C (Maks. 25°C)',
    standardRh: '40% – 60% (< 65%)',
    sopNote:
      'Penyimpanan bahan pangan kering/kemasan; ruangan harus sejuk, kering, berventilasi baik, dan bebas hama (prinsip FIFO/FEFO).',
  },
  {
    presetKey: 'gudang_beras',
    label: 'Gudang Beras',
    standardSuhu: '15°C – 25°C',
    standardRh: '50% – 65%',
    sopNote:
      'Karung beras diletakkan di atas palet minimal 15 cm dari lantai dan 30 cm dari dinding agar tetap kering dan bebas kutu/jamur.',
  },
  {
    presetKey: 'loading_area',
    label: 'Loading Area',
    standardSuhu: '≤ 25°C (Area Bongkar Terkendali < 28°C)',
    standardRh: '50% – 70%',
    sopNote:
      'Area penerimaan & pemeriksaan bahan baku; pastikan tertutup, bersih, dan waktu transit bahan pangan dingin sesingkat mungkin.',
  },
  {
    presetKey: 'ruang_produksi',
    label: 'Ruang Produksi',
    standardSuhu: '20°C – 30°C (Sajian Matang Panas ≥ 60°C)',
    standardRh: '50% – 70%',
    sopNote:
      'Area pemasakan dilengkapi exhaust fan & ventilasi memadai; pertahankan suhu penyajian makanan matang panas minimal 60°C.',
  },
  {
    presetKey: 'ruang_pendinginan',
    label: 'Ruang Pendinginan',
    standardSuhu: 'Chiller: 0°C – 4°C | Freezer: -18°C s/d -15°C',
    standardRh: '75% – 85%',
    sopNote:
      'Pemantauan suhu chiller/freezer secara rutin; pastikan pintu tertutup rapat agar suhu penyimpanan beku dan dingin stabil.',
  },
  {
    presetKey: 'ruang_persiapan',
    label: 'Ruang Persiapan',
    standardSuhu: '15°C – 21°C (Maks. 21°C)',
    standardRh: '50% – 70%',
    sopNote:
      'Area pencucian, pemotongan & peracikan bahan; suhu sejuk terkontrol mencegah perkembangbiakan mikroba sebelum pemasakan.',
  },
  {
    presetKey: 'ruang_pemorsan',
    label: 'Ruang Pemorsan',
    standardSuhu: '18°C – 22°C',
    standardRh: '50% – 65%',
    sopNote:
      'Area pemorsian/pengemasan ompreng ber-AC higienis; petugas wajib mengenakan APD lengkap dan menjaga kebersihan permukaan kerja.',
  },
];

export function matchPresetByRoomName(name: string): SopBgnRoomStandard {
  const normalized = name.trim().toLowerCase();
  const found = SOP_BGN_ROOM_PRESETS.find(
    (p) =>
      p.label.toLowerCase() === normalized ||
      normalized.includes(p.label.toLowerCase()) ||
      (p.presetKey === 'ruang_pemorsan' && normalized.includes('pemorsian'))
  );
  if (found) return found;
  return {
    presetKey: 'custom',
    label: name.trim(),
    standardSuhu: 'Sesuai jenis ruang (18°C – 25°C / Chiller 0°C – 4°C)',
    standardRh: '50% – 70%',
    sopNote: 'Ruangan tambahan kustom; sesuaikan standar suhu & RH dengan peruntukan SOP BGN Pusat.',
  };
}

export const BGN_FREEZER_CHILLER_DEFAULTS: Record<
  'freezer' | 'chiller',
  {
    label: string;
    normalSuhuBgn: string;
    bgnSopNote: string;
  }
> = {
  freezer: {
    label: 'Freezer',
    normalSuhuBgn: '-18°C s/d -15°C (Ideal ≤ -18°C)',
    bgnSopNote:
      'Standar Suhu Normal Freezer SOP BGN Pusat: -18°C s/d -15°C untuk penyimpanan bahan pangan beku (daging, ayam, ikan). Segera periksa/perbaiki jika suhu naik di atas -15°C.',
  },
  chiller: {
    label: 'Chiller',
    normalSuhuBgn: '0°C s/d 4°C (Maks. 4°C)',
    bgnSopNote:
      'Standar Suhu Normal Chiller SOP BGN Pusat: 0°C s/d 4°C untuk bahan pangan segar, protein & sampel pertinggal (atau 4°C – 10°C khusus chiller sayur/buah).',
  },
};
