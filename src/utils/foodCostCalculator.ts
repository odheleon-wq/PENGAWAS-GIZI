import {
  CATEGORY_MAP,
  TARGET_CATEGORIES,
  getDefaultCombinedAkg,
} from '../constants/nutritionCategories';
import type {
  DailyPmRecord,
  FoodCostDayPlan,
  FoodCostIngredientRow,
  FoodCostPurchaseUnit,
  FoodCostWorksheet,
  NutritionValues,
  PmCategoryCounts,
  PmCategoryOrSampleId,
  RawMaterialRecapDayConfig,
  TargetCategoryId,
} from '../types';

export interface PmOrderedGroupMeta {
  id: PmCategoryOrSampleId;
  no: number;
  label: string;
  defaultPortion: 'kecil' | 'besar';
}

export const PM_ORDERED_GROUPS: PmOrderedGroupMeta[] = [
  { id: 'balita_6_11', no: 1, label: 'Balita 6-11 Bulan', defaultPortion: 'kecil' },
  { id: 'balita_13_59', no: 2, label: 'Anak Balita Usia 13-59 Bulan', defaultPortion: 'kecil' },
  { id: 'anak_balita', no: 3, label: 'Anak Balita', defaultPortion: 'kecil' },
  { id: 'tk_paud_lb', no: 4, label: 'Siswa TK/PAUD/LB', defaultPortion: 'kecil' },
  { id: 'sd_1_3', no: 5, label: 'Siswa SD/MI/SLB Kelas 1-3', defaultPortion: 'kecil' },
  { id: 'sd_4_6', no: 6, label: 'Siswa SD/MI/SLB Kelas 4-6', defaultPortion: 'besar' },
  { id: 'smp_mts', no: 7, label: 'Siswa SMP/MTS/SMPLB', defaultPortion: 'besar' },
  { id: 'sma_smk', no: 8, label: 'Siswa SMA/SMK/MK/MASMALB', defaultPortion: 'besar' },
  { id: 'pendidik', no: 9, label: 'Pendidik', defaultPortion: 'besar' },
  { id: 'tendik', no: 10, label: 'Tenaga Pendidikan', defaultPortion: 'besar' },
  { id: 'ibu_hamil', no: 11, label: 'Ibu Hamil', defaultPortion: 'besar' },
  { id: 'ibu_menyusui', no: 12, label: 'Ibu Menyusui', defaultPortion: 'besar' },
  { id: 'sampel', no: 13, label: 'Sampel', defaultPortion: 'kecil' },
];

export const SMALL_PORTION_CATEGORY_IDS: TargetCategoryId[] = [
  'balita_6_11',
  'balita_13_59',
  'anak_balita',
  'tk_paud_lb',
  'sd_1_3',
];

export const LARGE_PORTION_CATEGORY_IDS: TargetCategoryId[] = [
  'sd_4_6',
  'smp_mts',
  'sma_smk',
  'pendidik',
  'tendik',
  'ibu_hamil',
  'ibu_menyusui',
];

export function isSmallPortionCategory(catId: TargetCategoryId): boolean {
  return SMALL_PORTION_CATEGORY_IDS.includes(catId);
}

export interface PmSummaryRowComputed extends PmCategoryCounts {
  id: PmCategoryOrSampleId;
  no: number;
  label: string;
  total: number;
  fromSpecific: PmCategoryCounts;
  hasManualOverride: boolean;
}

export interface PmSummaryComputed {
  rows: PmSummaryRowComputed[];
  subTotal: PmCategoryCounts & { total: number };
}

export function computePmSummary(record?: DailyPmRecord | null): PmSummaryComputed {
  const accMap: Record<PmCategoryOrSampleId, PmCategoryCounts> = {} as Record<
    PmCategoryOrSampleId,
    PmCategoryCounts
  >;

  PM_ORDERED_GROUPS.forEach((g) => {
    accMap[g.id] = {
      tanpaAlergiBesar: 0,
      tanpaAlergiKecil: 0,
      dietAlergiBesar: 0,
      dietAlergiKecil: 0,
    };
  });

  if (record?.specificRows) {
    record.specificRows.forEach((row) => {
      const besarCat = row.porsiBesarCategoryId || 'sd_4_6';
      const kecilCat = row.porsiKecilCategoryId || 'sd_1_3';

      if (accMap[besarCat]) {
        accMap[besarCat].tanpaAlergiBesar += Math.max(0, Math.round(row.tanpaAlergiBesar || 0));
        accMap[besarCat].dietAlergiBesar += Math.max(0, Math.round(row.dietAlergiBesar || 0));
      }
      if (accMap[kecilCat]) {
        accMap[kecilCat].tanpaAlergiKecil += Math.max(0, Math.round(row.tanpaAlergiKecil || 0));
        accMap[kecilCat].dietAlergiKecil += Math.max(0, Math.round(row.dietAlergiKecil || 0));
      }
    });
  }

  const subTotal: PmCategoryCounts & { total: number } = {
    tanpaAlergiBesar: 0,
    tanpaAlergiKecil: 0,
    dietAlergiBesar: 0,
    dietAlergiKecil: 0,
    total: 0,
  };

  const rows: PmSummaryRowComputed[] = PM_ORDERED_GROUPS.map((g) => {
    const fromSpecific = accMap[g.id];
    const override = record?.summaryOverrides?.[g.id];
    const hasManualOverride = Boolean(
      override &&
        (override.tanpaAlergiBesar !== undefined ||
          override.tanpaAlergiKecil !== undefined ||
          override.dietAlergiBesar !== undefined ||
          override.dietAlergiKecil !== undefined)
    );

    const tanpaAlergiBesar =
      override?.tanpaAlergiBesar !== undefined
        ? Math.max(0, Math.round(override.tanpaAlergiBesar))
        : fromSpecific.tanpaAlergiBesar;
    const tanpaAlergiKecil =
      override?.tanpaAlergiKecil !== undefined
        ? Math.max(0, Math.round(override.tanpaAlergiKecil))
        : fromSpecific.tanpaAlergiKecil;
    const dietAlergiBesar =
      override?.dietAlergiBesar !== undefined
        ? Math.max(0, Math.round(override.dietAlergiBesar))
        : fromSpecific.dietAlergiBesar;
    const dietAlergiKecil =
      override?.dietAlergiKecil !== undefined
        ? Math.max(0, Math.round(override.dietAlergiKecil))
        : fromSpecific.dietAlergiKecil;

    const total = tanpaAlergiBesar + tanpaAlergiKecil + dietAlergiBesar + dietAlergiKecil;

    subTotal.tanpaAlergiBesar += tanpaAlergiBesar;
    subTotal.tanpaAlergiKecil += tanpaAlergiKecil;
    subTotal.dietAlergiBesar += dietAlergiBesar;
    subTotal.dietAlergiKecil += dietAlergiKecil;
    subTotal.total += total;

    return {
      id: g.id,
      no: g.no,
      label: g.label,
      tanpaAlergiBesar,
      tanpaAlergiKecil,
      dietAlergiBesar,
      dietAlergiKecil,
      total,
      fromSpecific,
      hasManualOverride,
    };
  });

  return { rows, subTotal };
}

export function resolveWorksheetJumlahManfaat(
  worksheet: FoodCostWorksheet,
  pmSummary: PmSummaryComputed
): number {
  let total = 0;
  const catSet = new Set(worksheet.categoryIds);

  pmSummary.rows.forEach((row) => {
    if (row.id === 'sampel') return;
    if (catSet.size > 0 && !catSet.has(row.id as TargetCategoryId)) return;

    const besar = worksheet.isAllergySheet ? row.dietAlergiBesar : row.tanpaAlergiBesar;
    const kecil = worksheet.isAllergySheet ? row.dietAlergiKecil : row.tanpaAlergiKecil;

    if (worksheet.portionScope === 'kecil') {
      total += kecil;
    } else if (worksheet.portionScope === 'besar') {
      total += besar;
    } else {
      total += besar + kecil;
    }
  });

  return total;
}

export interface ComputedFoodCostRow {
  row: FoodCostIngredientRow;
  energi: number;
  protein: number;
  lemak: number;
  kh: number;
  serat: number;
  bddPercent: number;
  bkGram: number;
  jumlahManfaat: number;
  totalGram: number;
  totalKg: number;
  potong: number | null;
  ekor: number | null;
  lembar: number | null;
  rak: number | null;
  activeUnitQty: number;
  hargaTotal: number;
}

export interface ComputedFoodCostWorksheet {
  worksheet: FoodCostWorksheet;
  defaultJumlahManfaat: number;
  rows: ComputedFoodCostRow[];
  nutritionTotals: {
    energi: number;
    protein: number;
    lemak: number;
    kh: number;
    serat: number;
  };
  akgRef: {
    energi: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  percentNeeds: {
    energi: number;
    protein: number;
    lemak: number;
    kh: number;
    serat: number;
  };
  subTotalHarga: number;
  bumbuAmount: number;
  totalWithBumbu: number;
  effectivePortionsForCost: number;
  hargaPerPorsi: number;
}

export function computeFoodCostWorksheet(
  worksheet: FoodCostWorksheet,
  pmSummary: PmSummaryComputed
): ComputedFoodCostWorksheet {
  const defaultJumlahManfaat = resolveWorksheetJumlahManfaat(worksheet, pmSummary);

  let sumEnergi = 0;
  let sumProtein = 0;
  let sumLemak = 0;
  let sumKh = 0;
  let sumSerat = 0;
  let subTotalHarga = 0;
  let maxRowManfaat = defaultJumlahManfaat;

  const computedRows: ComputedFoodCostRow[] = worksheet.rows.map((row) => {
    const bb = Math.max(0, Number(row.beratBb) || 0);
    const factor = bb / 100;
    const energi = (Number(row.energiPer100) || 0) * factor;
    const protein = (Number(row.proteinPer100) || 0) * factor;
    const lemak = (Number(row.lemakPer100) || 0) * factor;
    const kh = (Number(row.khPer100) || 0) * factor;
    const serat = (Number(row.seratPer100) || 0) * factor;

    const bddPercent = Number(row.bddPercent) > 0 ? Number(row.bddPercent) : 100;
    const bkGram = bb > 0 ? bb / (bddPercent / 100) : 0;

    const jumlahManfaat =
      row.jumlahManfaatOverride !== undefined && row.jumlahManfaatOverride !== null
        ? Math.max(0, Math.round(row.jumlahManfaatOverride))
        : defaultJumlahManfaat;

    if (jumlahManfaat > maxRowManfaat) maxRowManfaat = jumlahManfaat;

    const totalGram = bkGram * jumlahManfaat;
    const totalKg = totalGram / 1000;

    const calcUnitVal = (
      unit: FoodCostPurchaseUnit,
      manualVal?: number | null
    ): number | null => {
      if (manualVal !== undefined && manualVal !== null && Number.isFinite(manualVal)) {
        return manualVal;
      }
      if (row.purchaseUnit === unit && row.gramPerUnit && row.gramPerUnit > 0 && totalGram > 0) {
        return totalGram / row.gramPerUnit;
      }
      return null;
    };

    const potong = calcUnitVal('potong', row.manualPotong);
    const ekor = calcUnitVal('ekor', row.manualEkor);
    const lembar = calcUnitVal('lembar', row.manualLembar);
    const rak = calcUnitVal('rak', row.manualRak);

    let activeUnitQty = totalKg;
    if (row.purchaseUnit === 'potong') activeUnitQty = potong ?? 0;
    else if (row.purchaseUnit === 'ekor') activeUnitQty = ekor ?? 0;
    else if (row.purchaseUnit === 'lembar') activeUnitQty = lembar ?? 0;
    else if (row.purchaseUnit === 'rak') activeUnitQty = rak ?? 0;

    const hargaSatuan = Math.max(0, Number(row.hargaSatuan) || 0);
    const hargaTotal = activeUnitQty * hargaSatuan;

    sumEnergi += energi;
    sumProtein += protein;
    sumLemak += lemak;
    sumKh += kh;
    sumSerat += serat;
    subTotalHarga += hargaTotal;

    return {
      row,
      energi,
      protein,
      lemak,
      kh,
      serat,
      bddPercent,
      bkGram,
      jumlahManfaat,
      totalGram,
      totalKg,
      potong,
      ekor,
      lembar,
      rak,
      activeUnitQty,
      hargaTotal,
    };
  });

  const defaultAkg = getDefaultCombinedAkg(worksheet.categoryIds);
  const akgRef = {
    energi: worksheet.akgOverride?.energi ?? defaultAkg.energi,
    protein: worksheet.akgOverride?.protein ?? defaultAkg.protein,
    lemak: worksheet.akgOverride?.lemak ?? defaultAkg.lemak,
    karbohidrat: worksheet.akgOverride?.karbohidrat ?? defaultAkg.karbohidrat,
    serat: worksheet.akgOverride?.serat ?? defaultAkg.serat,
  };

  const percentNeeds = {
    energi: akgRef.energi > 0 ? (sumEnergi / akgRef.energi) * 100 : 0,
    protein: akgRef.protein > 0 ? (sumProtein / akgRef.protein) * 100 : 0,
    lemak: akgRef.lemak > 0 ? (sumLemak / akgRef.lemak) * 100 : 0,
    kh: akgRef.karbohidrat > 0 ? (sumKh / akgRef.karbohidrat) * 100 : 0,
    serat: akgRef.serat > 0 ? (sumSerat / akgRef.serat) * 100 : 0,
  };

  const bumbuPct = Math.max(0, Number(worksheet.bumbuPercent) || 0);
  const bumbuAmount = subTotalHarga * (bumbuPct / 100);
  const totalWithBumbu = subTotalHarga + bumbuAmount;
  const effectivePortionsForCost =
    defaultJumlahManfaat > 0 ? defaultJumlahManfaat : maxRowManfaat;
  const hargaPerPorsi =
    effectivePortionsForCost > 0 ? totalWithBumbu / effectivePortionsForCost : 0;

  return {
    worksheet,
    defaultJumlahManfaat,
    rows: computedRows,
    nutritionTotals: {
      energi: sumEnergi,
      protein: sumProtein,
      lemak: sumLemak,
      kh: sumKh,
      serat: sumSerat,
    },
    akgRef,
    percentNeeds,
    subTotalHarga,
    bumbuAmount,
    totalWithBumbu,
    effectivePortionsForCost,
    hargaPerPorsi,
  };
}

export function extractNutritionValuesFromWorksheet(
  computed: ComputedFoodCostWorksheet
): NutritionValues {
  return {
    energi: Math.round(computed.nutritionTotals.energi * 10) / 10,
    protein: Math.round(computed.nutritionTotals.protein * 10) / 10,
    lemak: Math.round(computed.nutritionTotals.lemak * 10) / 10,
    karbohidrat: Math.round(computed.nutritionTotals.kh * 10) / 10,
    serat: Math.round(computed.nutritionTotals.serat * 10) / 10,
    jumlahManfaat: Math.round(computed.effectivePortionsForCost),
  };
}

export interface AggregatedRawMaterialRow {
  key: string;
  bahanMakanan: string;
  primaryUnit: FoodCostPurchaseUnit;
  satuanPo: string;
  estimasiAuto: number;
  estimasiUsed: number;
  kg: number;
  potong: number;
  ekor: number;
  lembar: number;
  rak: number;
  bufferPercent: number;
  bufferAmount: number;
  jumlahPlusBuffer: number;
  totalPo: number;
  hargaSatuan: number;
  hargaTotal: number;
}

export interface ComputedRawMaterialRecap {
  totalPenerimaManfaat: number;
  porsiKecilCount: number;
  porsiBesarCount: number;
  bumbuPercent: number;
  bumbuTotalRp: number;
  rabPorsiKecilRate: number;
  rabPorsiBesarRate: number;
  rabPorsiKecilTotal: number;
  rabPorsiBesarTotal: number;
  totalRab: number;
  totalBelanjaBahanBaku: number;
  selisihRab: number;
  rows: AggregatedRawMaterialRow[];
}

export function unitDisplayLabel(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === 'kg') return 'Kg';
  if (lower === 'potong') return 'Potong';
  if (lower === 'ekor') return 'Ekor';
  if (lower === 'lembar') return 'Lembar';
  if (lower === 'rak') return 'Rak';
  return unit || 'Kg';
}

export function computeRawMaterialRecap(
  dayPlan: FoodCostDayPlan | null | undefined,
  pmSummary: PmSummaryComputed,
  recapConfig: RawMaterialRecapDayConfig
): ComputedRawMaterialRecap {
  const map = new Map<
    string,
    {
      bahanMakanan: string;
      primaryUnit: FoodCostPurchaseUnit;
      kg: number;
      potong: number;
      ekor: number;
      lembar: number;
      rak: number;
      estimasiAuto: number;
      lastPrice: number;
    }
  >();

  let worksheetBumbuSum = 0;

  if (dayPlan?.worksheets) {
    dayPlan.worksheets.forEach((ws) => {
      const computedWs = computeFoodCostWorksheet(ws, pmSummary);
      worksheetBumbuSum += computedWs.bumbuAmount;

      computedWs.rows.forEach((cr) => {
        const name = cr.row.bahanMakanan.trim();
        if (!name) return;
        const key = name.toLowerCase();

        const existing = map.get(key) || {
          bahanMakanan: name,
          primaryUnit: cr.row.purchaseUnit || 'kg',
          kg: 0,
          potong: 0,
          ekor: 0,
          lembar: 0,
          rak: 0,
          estimasiAuto: 0,
          lastPrice: 0,
        };

        existing.kg += cr.totalKg;
        existing.potong += cr.potong ?? 0;
        existing.ekor += cr.ekor ?? 0;
        existing.lembar += cr.lembar ?? 0;
        existing.rak += cr.rak ?? 0;
        existing.estimasiAuto += cr.activeUnitQty;
        if (cr.row.hargaSatuan > 0) {
          existing.lastPrice = cr.row.hargaSatuan;
          existing.primaryUnit = cr.row.purchaseUnit || existing.primaryUnit;
        }
        map.set(key, existing);
      });
    });
  }

  const globalBufferPct = Math.max(0, Number(recapConfig.bufferPercent) || 0);
  const rows: AggregatedRawMaterialRow[] = [];
  let totalBelanjaBahanBaku = 0;

  map.forEach((agg, key) => {
    const ov = recapConfig.itemOverrides?.[key];
    const bufferPercent =
      ov?.bufferPercent !== undefined && ov.bufferPercent !== null
        ? Math.max(0, Number(ov.bufferPercent))
        : globalBufferPct;

    const estimasiUsed =
      ov?.estimasiBufferManual !== undefined && ov.estimasiBufferManual !== null
        ? Math.max(0, Number(ov.estimasiBufferManual))
        : agg.estimasiAuto;

    const bufferAmount = estimasiUsed * (bufferPercent / 100);
    const jumlahPlusBuffer = estimasiUsed + bufferAmount;
    const totalPo =
      ov?.totalPoManual !== undefined && ov.totalPoManual !== null
        ? Math.max(0, Number(ov.totalPoManual))
        : jumlahPlusBuffer;

    const hargaSatuan =
      ov?.hargaSatuan !== undefined && ov.hargaSatuan !== null
        ? Math.max(0, Number(ov.hargaSatuan))
        : agg.lastPrice;

    const hargaTotal = totalPo * hargaSatuan;
    totalBelanjaBahanBaku += hargaTotal;

    const satuanPo = ov?.satuanPo?.trim()
      ? ov.satuanPo.trim()
      : unitDisplayLabel(agg.primaryUnit);

    rows.push({
      key,
      bahanMakanan: agg.bahanMakanan,
      primaryUnit: agg.primaryUnit,
      satuanPo,
      estimasiAuto: agg.estimasiAuto,
      estimasiUsed,
      kg: agg.kg,
      potong: agg.potong,
      ekor: agg.ekor,
      lembar: agg.lembar,
      rak: agg.rak,
      bufferPercent,
      bufferAmount,
      jumlahPlusBuffer,
      totalPo,
      hargaSatuan,
      hargaTotal,
    });
  });

  const porsiKecilCount =
    pmSummary.subTotal.tanpaAlergiKecil + pmSummary.subTotal.dietAlergiKecil;
  const porsiBesarCount =
    pmSummary.subTotal.tanpaAlergiBesar + pmSummary.subTotal.dietAlergiBesar;
  const totalPenerimaManfaat = porsiKecilCount + porsiBesarCount;

  const rabPorsiKecilRate = Math.max(0, Number(recapConfig.rabPorsiKecilRate) || 0);
  const rabPorsiBesarRate = Math.max(0, Number(recapConfig.rabPorsiBesarRate) || 0);
  const rabPorsiKecilTotal = porsiKecilCount * rabPorsiKecilRate;
  const rabPorsiBesarTotal = porsiBesarCount * rabPorsiBesarRate;
  const totalRab = rabPorsiKecilTotal + rabPorsiBesarTotal;

  const bumbuPercent = Math.max(0, Number(recapConfig.bumbuPercent) || 0);
  const bumbuTotalRp =
    worksheetBumbuSum > 0
      ? worksheetBumbuSum
      : totalBelanjaBahanBaku * (bumbuPercent / 100);

  const selisihRab = totalRab - totalBelanjaBahanBaku;

  return {
    totalPenerimaManfaat,
    porsiKecilCount,
    porsiBesarCount,
    bumbuPercent,
    bumbuTotalRp,
    rabPorsiKecilRate,
    rabPorsiBesarRate,
    rabPorsiKecilTotal,
    rabPorsiBesarTotal,
    totalRab,
    totalBelanjaBahanBaku,
    selisihRab,
    rows,
  };
}

export function getWorksheetSideLabelDefault(
  categoryIds: TargetCategoryId[],
  isAllergySheet: boolean
): string {
  if (isAllergySheet) return 'A L E R G I';
  if (categoryIds.length === 0) return 'S P P G';
  if (categoryIds.length === 1) {
    const id = categoryIds[0];
    if (id === 'tk_paud_lb') return 'TK / PAUD';
    if (id === 'sd_1_3') return 'SD KLS 1-3';
    if (id === 'sd_4_6') return 'SD KLS 4-6';
    if (id === 'smp_mts') return 'S M P';
    if (id === 'sma_smk') return 'S M A';
    if (id === 'ibu_hamil') return 'BUMIL';
    if (id === 'ibu_menyusui') return 'BUSUI';
    if (id === 'balita_6_11' || id === 'balita_13_59' || id === 'anak_balita') return 'BALITA';
    return (CATEGORY_MAP[id]?.label || 'SPPG').toUpperCase();
  }
  return `GABUNGAN (${categoryIds.length})`;
}

export function getWorksheetDefaultTitle(
  categoryIds: TargetCategoryId[],
  isAllergySheet: boolean,
  portionScope: 'auto' | 'kecil' | 'besar' | 'semua'
): string {
  const portionTxt =
    portionScope === 'kecil'
      ? 'PORSI KECIL'
      : portionScope === 'besar'
      ? 'PORSI BESAR'
      : 'GABUNGAN';
  if (isAllergySheet) {
    if (categoryIds.length === 1) {
      return `NILAI GIZI DAN FOOD COST ALERGI / DIET (${CATEGORY_MAP[categoryIds[0]]?.label || ''})`;
    }
    return `NILAI GIZI DAN FOOD COST LEMBAR KERJA ALERGI / DIET (${portionTxt})`;
  }
  if (categoryIds.length === 1) {
    return `NILAI GIZI DAN FOOD COST ${portionTxt} ${CATEGORY_MAP[categoryIds[0]]?.label || ''}`.toUpperCase();
  }
  if (categoryIds.length === TARGET_CATEGORIES.length) {
    return 'NILAI GIZI DAN FOOD COST GABUNGAN SEMUA KATEGORI';
  }
  const names = categoryIds.slice(0, 2).map((id) => CATEGORY_MAP[id]?.label || id).join(' + ');
  const suffix = categoryIds.length > 2 ? ` +${categoryIds.length - 2} Lainnya` : '';
  return `NILAI GIZI DAN FOOD COST (${names}${suffix})`.toUpperCase();
}
