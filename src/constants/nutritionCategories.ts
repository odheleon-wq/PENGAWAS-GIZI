import type {
  AkgTargetsConfig,
  DailyMenuEntry,
  NutritionValues,
  TargetCategoryId,
} from '../types';

export interface TargetCategoryMeta {
  id: TargetCategoryId;
  label: string;
  defaultAkg25: Omit<AkgTargetsConfig, 'targetOrang' | 'customTitle'>;
}

export const TARGET_CATEGORIES: TargetCategoryMeta[] = [
  {
    id: 'tk_paud_lb',
    label: 'Siswa TK/PAUD/LB',
    defaultAkg25: { energi: 350.0, protein: 6.3, lemak: 12.5, karbohidrat: 55.0, serat: 5.0 },
  },
  {
    id: 'sd_1_3',
    label: 'Siswa SD/MI/SLB Kelas 1-3',
    defaultAkg25: { energi: 412.5, protein: 10.0, lemak: 13.8, karbohidrat: 62.5, serat: 5.8 },
  },
  {
    id: 'sd_4_6',
    label: 'Siswa SD/MI/SLB Kelas 4-6',
    defaultAkg25: { energi: 500.0, protein: 13.8, lemak: 16.3, karbohidrat: 75.0, serat: 6.8 },
  },
  {
    id: 'smp_mts',
    label: 'Siswa SMP/MTS/SMPLB',
    defaultAkg25: { energi: 600.0, protein: 17.5, lemak: 20.0, karbohidrat: 87.5, serat: 8.5 },
  },
  {
    id: 'sma_smk',
    label: 'Siswa SMA/SMK/MK/MASMALB',
    defaultAkg25: { energi: 662.5, protein: 18.8, lemak: 21.3, karbohidrat: 100.0, serat: 9.3 },
  },
  {
    id: 'pendidik',
    label: 'Pendidik',
    defaultAkg25: { energi: 600.0, protein: 16.3, lemak: 16.7, karbohidrat: 90.0, serat: 8.5 },
  },
  {
    id: 'tendik',
    label: 'Tenaga Pendidikan',
    defaultAkg25: { energi: 600.0, protein: 16.3, lemak: 16.7, karbohidrat: 90.0, serat: 8.5 },
  },
  {
    id: 'anak_balita',
    label: 'Anak Balita',
    defaultAkg25: { energi: 337.5, protein: 5.0, lemak: 11.3, karbohidrat: 53.8, serat: 4.8 },
  },
  {
    id: 'balita_13_59',
    label: 'Anak Balita Usia 13-59 Bulan',
    defaultAkg25: { energi: 343.8, protein: 5.6, lemak: 11.9, karbohidrat: 54.4, serat: 4.9 },
  },
  {
    id: 'balita_6_11',
    label: 'Balita 6-11 Bulan',
    defaultAkg25: { energi: 200.0, protein: 3.8, lemak: 8.8, karbohidrat: 26.3, serat: 2.8 },
  },
  {
    id: 'ibu_hamil',
    label: 'Ibu Hamil',
    defaultAkg25: { energi: 637.5, protein: 19.5, lemak: 18.0, karbohidrat: 96.3, serat: 9.0 },
  },
  {
    id: 'ibu_menyusui',
    label: 'Ibu Menyusui',
    defaultAkg25: { energi: 650.0, protein: 20.0, lemak: 18.0, karbohidrat: 98.8, serat: 9.3 },
  },
];

export const CATEGORY_MAP: Record<TargetCategoryId, TargetCategoryMeta> = TARGET_CATEGORIES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<TargetCategoryId, TargetCategoryMeta>
);

export function createEmptyNutritionValues(): NutritionValues {
  return {
    energi: 0,
    protein: 0,
    lemak: 0,
    karbohidrat: 0,
    serat: 0,
    jumlahManfaat: 0,
  };
}

export function hasAnyNutritionValue(v?: NutritionValues | null): boolean {
  if (!v) return false;
  return (
    v.energi > 0 ||
    v.protein > 0 ||
    v.lemak > 0 ||
    v.karbohidrat > 0 ||
    v.serat > 0 ||
    v.jumlahManfaat > 0
  );
}

export function getCombinedCategoryTitle(
  selectedIds: TargetCategoryId[],
  customTitle?: string
): string {
  if (customTitle && customTitle.trim().length > 0) {
    return customTitle.trim();
  }
  if (selectedIds.length === 0) {
    return 'Semua Kelompok Sasaran';
  }
  if (selectedIds.length === 1) {
    return CATEGORY_MAP[selectedIds[0]]?.label || 'Kelompok Sasaran';
  }
  if (selectedIds.length <= 3) {
    return selectedIds.map((id) => CATEGORY_MAP[id]?.label || id).join(' + ');
  }
  return `Gabungan ${selectedIds.length} Kelompok Sasaran`;
}

export function getDefaultCombinedAkg(selectedIds: TargetCategoryId[]): Omit<AkgTargetsConfig, 'targetOrang' | 'customTitle'> {
  const active = selectedIds.length > 0 ? selectedIds : (['smp_mts'] as TargetCategoryId[]);
  const sum = { energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 };
  active.forEach((id) => {
    const meta = CATEGORY_MAP[id];
    if (meta) {
      sum.energi += meta.defaultAkg25.energi;
      sum.protein += meta.defaultAkg25.protein;
      sum.lemak += meta.defaultAkg25.lemak;
      sum.karbohidrat += meta.defaultAkg25.karbohidrat;
      sum.serat += meta.defaultAkg25.serat;
    }
  });
  const n = active.length || 1;
  return {
    energi: Math.round((sum.energi / n) * 10) / 10,
    protein: Math.round((sum.protein / n) * 10) / 10,
    lemak: Math.round((sum.lemak / n) * 10) / 10,
    karbohidrat: Math.round((sum.karbohidrat / n) * 10) / 10,
    serat: Math.round((sum.serat / n) * 10) / 10,
  };
}

export interface ComputedNutritionRow {
  entry: DailyMenuEntry;
  values: NutritionValues;
  activeCategoryCount: number;
}

export interface MonthlyNutritionSummary {
  rows: ComputedNutritionRow[];
  totals: NutritionValues;
  dayCounts: NutritionValues;
  averages: {
    energi: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  akgRef: {
    energi: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  percentAkg: {
    energi: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  targetOrang: number;
}

export function computeEntryCombinedNutrition(
  entry: DailyMenuEntry,
  selectedIds: TargetCategoryId[]
): { values: NutritionValues; activeCategoryCount: number } {
  const map = entry.nutritionByCategory || {};
  const idsToCheck =
    selectedIds.length > 0 ? selectedIds : (Object.keys(map) as TargetCategoryId[]);

  let sumEnergi = 0;
  let countEnergi = 0;
  let sumProtein = 0;
  let countProtein = 0;
  let sumLemak = 0;
  let countLemak = 0;
  let sumKarbo = 0;
  let countKarbo = 0;
  let sumSerat = 0;
  let countSerat = 0;
  let sumManfaat = 0;
  let activeCategoryCount = 0;

  idsToCheck.forEach((catId) => {
    const v = map[catId];
    if (!v || !hasAnyNutritionValue(v)) return;
    activeCategoryCount += 1;
    if (v.energi > 0) {
      sumEnergi += v.energi;
      countEnergi += 1;
    }
    if (v.protein > 0) {
      sumProtein += v.protein;
      countProtein += 1;
    }
    if (v.lemak > 0) {
      sumLemak += v.lemak;
      countLemak += 1;
    }
    if (v.karbohidrat > 0) {
      sumKarbo += v.karbohidrat;
      countKarbo += 1;
    }
    if (v.serat > 0) {
      sumSerat += v.serat;
      countSerat += 1;
    }
    if (v.jumlahManfaat > 0) {
      sumManfaat += v.jumlahManfaat;
    }
  });

  return {
    activeCategoryCount,
    values: {
      energi: countEnergi > 0 ? sumEnergi / countEnergi : 0,
      protein: countProtein > 0 ? sumProtein / countProtein : 0,
      lemak: countLemak > 0 ? sumLemak / countLemak : 0,
      karbohidrat: countKarbo > 0 ? sumKarbo / countKarbo : 0,
      serat: countSerat > 0 ? sumSerat / countSerat : 0,
      jumlahManfaat: Math.round(sumManfaat),
    },
  };
}

export function computeMonthlyNutritionSummary(
  entries: DailyMenuEntry[],
  selectedIds: TargetCategoryId[],
  akgOverride?: AkgTargetsConfig | null
): MonthlyNutritionSummary {
  const sorted = [...entries].sort(
    (a, b) => a.hariKe - b.hariKe || a.dateIso.localeCompare(b.dateIso)
  );

  const rows: ComputedNutritionRow[] = sorted.map((entry) => {
    const computed = computeEntryCombinedNutrition(entry, selectedIds);
    return {
      entry,
      values: computed.values,
      activeCategoryCount: computed.activeCategoryCount,
    };
  });

  const totals = createEmptyNutritionValues();
  const dayCounts = createEmptyNutritionValues();

  rows.forEach(({ values }) => {
    totals.energi += values.energi;
    totals.protein += values.protein;
    totals.lemak += values.lemak;
    totals.karbohidrat += values.karbohidrat;
    totals.serat += values.serat;
    totals.jumlahManfaat += values.jumlahManfaat;

    if (values.energi > 0) dayCounts.energi += 1;
    if (values.protein > 0) dayCounts.protein += 1;
    if (values.lemak > 0) dayCounts.lemak += 1;
    if (values.karbohidrat > 0) dayCounts.karbohidrat += 1;
    if (values.serat > 0) dayCounts.serat += 1;
    if (values.jumlahManfaat > 0) dayCounts.jumlahManfaat += 1;
  });

  const averages = {
    energi: dayCounts.energi > 0 ? totals.energi / dayCounts.energi : 0,
    protein: dayCounts.protein > 0 ? totals.protein / dayCounts.protein : 0,
    lemak: dayCounts.lemak > 0 ? totals.lemak / dayCounts.lemak : 0,
    karbohidrat: dayCounts.karbohidrat > 0 ? totals.karbohidrat / dayCounts.karbohidrat : 0,
    serat: dayCounts.serat > 0 ? totals.serat / dayCounts.serat : 0,
  };

  const defaultAkg = getDefaultCombinedAkg(selectedIds);
  const akgRef = {
    energi: akgOverride?.energi ?? defaultAkg.energi,
    protein: akgOverride?.protein ?? defaultAkg.protein,
    lemak: akgOverride?.lemak ?? defaultAkg.lemak,
    karbohidrat: akgOverride?.karbohidrat ?? defaultAkg.karbohidrat,
    serat: akgOverride?.serat ?? defaultAkg.serat,
  };

  const percentAkg = {
    energi: akgRef.energi > 0 ? (averages.energi / akgRef.energi) * 100 : 0,
    protein: akgRef.protein > 0 ? (averages.protein / akgRef.protein) * 100 : 0,
    lemak: akgRef.lemak > 0 ? (averages.lemak / akgRef.lemak) * 100 : 0,
    karbohidrat: akgRef.karbohidrat > 0 ? (averages.karbohidrat / akgRef.karbohidrat) * 100 : 0,
    serat: akgRef.serat > 0 ? (averages.serat / akgRef.serat) * 100 : 0,
  };

  const maxManfaat = rows.reduce((m, r) => Math.max(m, r.values.jumlahManfaat), 0);
  const targetOrang =
    akgOverride?.targetOrang !== undefined && akgOverride.targetOrang > 0
      ? akgOverride.targetOrang
      : maxManfaat;

  return {
    rows,
    totals,
    dayCounts,
    averages,
    akgRef,
    percentAkg,
    targetOrang,
  };
}
