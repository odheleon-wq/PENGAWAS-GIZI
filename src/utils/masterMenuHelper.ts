import { CATEGORY_MAP } from '../constants/nutritionCategories';
import type {
  FoodCostIngredientRow,
  MasterMenuCycleMode,
  MasterMenuDayCell,
  MasterMenuPlan,
  MasterMenuRowLabels,
  MasterMenuWeekBlock,
  TargetCategoryId,
  TkpiFoodItem,
} from '../types';
import { formatIndonesianFullDate, getDaysInMonth, parseMonthKey } from './dateUtils';

export const DEFAULT_MASTER_MENU_ROW_LABELS: MasterMenuRowLabels = {
  kelompokHeader: 'Kelompok Bahan Makanan',
  makananPokok: 'Makanan Pokok',
  laukHewani: 'Lauk Hewani',
  laukNabati: 'Lauk Nabati',
  sayuran: 'Sayuran',
  buah: 'Buah',
  susu: 'Susu',
};

const SHORT_CATEGORY_LABELS: Partial<Record<TargetCategoryId, string>> = {
  tk_paud_lb: 'TK/PAUD',
  sd_1_3: '1-3 SD',
  sd_4_6: '4-6 SD',
  smp_mts: 'SMP/MTs',
  sma_smk: 'SMA/SMK',
  pendidik: 'PENDIDIK',
  tendik: 'TENDIK',
  anak_balita: 'BALITA',
  balita_13_59: 'BALITA 13-59 BLN',
  balita_6_11: 'BALITA 6-11 BLN',
  ibu_hamil: 'IBU HAMIL',
  ibu_menyusui: 'IBU MENYUSUI',
};

export function getShortCategorySummary(categoryIds: TargetCategoryId[]): string {
  if (!categoryIds || categoryIds.length === 0) return 'SEMUA SASARAN';
  if (categoryIds.length === 1) {
    return SHORT_CATEGORY_LABELS[categoryIds[0]] || CATEGORY_MAP[categoryIds[0]]?.label.toUpperCase() || categoryIds[0];
  }
  if (categoryIds.length <= 3) {
    return categoryIds
      .map((id) => SHORT_CATEGORY_LABELS[id] || CATEGORY_MAP[id]?.label || id)
      .join(' & ')
      .toUpperCase();
  }
  return `GABUNGAN ${categoryIds.length} KATEGORI`;
}

export function getWeekCountForCycle(mode: MasterMenuCycleMode, monthKey: string): number {
  if (mode === '1_minggu') return 1;
  if (mode === '2_minggu') return 2;
  if (mode === '3_minggu') return 3;
  if (mode === '4_minggu') return 4;
  // bulanan: cover all weekdays (Senin-Jumat) in monthKey, min 4 weeks
  const { year, month } = parseMonthKey(monthKey);
  const totalDays = getDaysInMonth(year, month);
  let weekdayCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow >= 1 && dow <= 5) weekdayCount += 1;
  }
  return Math.max(4, Math.min(5, Math.ceil(weekdayCount / 5)));
}

export function formatMasterMenuDefaultTitle(
  categoryIds: TargetCategoryId[],
  cycleMode: MasterMenuCycleMode,
  monthKey: string
): string {
  const weeks = getWeekCountForCycle(cycleMode, monthKey);
  const daysCount = weeks * 5;
  const catSummary = getShortCategorySummary(categoryIds);
  if (cycleMode === 'bulanan') {
    return `MASTER MENU BULANAN (${daysCount} HARI) ${catSummary}`;
  }
  return `MASTER MENU ${daysCount} HARI ${catSummary}`;
}

function toIsoDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekdayDatesForMonth(monthKey: string, totalSlots: number): string[] {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(year, month - 1, 1);
  // Find first Monday in month (matching Nov 2, 2026 example) or Monday of week 1 if 1st is weekday
  const firstDow = firstDay.getDay(); // 0=Sun, 1=Mon, ...
  let startDt: Date;
  if (firstDow === 0) {
    startDt = new Date(year, month - 1, 2);
  } else if (firstDow === 6) {
    startDt = new Date(year, month - 1, 3);
  } else {
    startDt = new Date(year, month - 1, 1);
  }

  const dates: string[] = [];
  const cursor = new Date(startDt);
  while (dates.length < totalSlots) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      dates.push(toIsoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function generateMasterMenuWeeks(
  monthKey: string,
  cycleMode: MasterMenuCycleMode,
  existingWeeks?: MasterMenuWeekBlock[]
): MasterMenuWeekBlock[] {
  const weekCount = getWeekCountForCycle(cycleMode, monthKey);
  const totalSlots = weekCount * 5;
  const dates = getWeekdayDatesForMonth(monthKey, totalSlots);

  const flatExisting: MasterMenuDayCell[] = [];
  (existingWeeks || []).forEach((w) => {
    (w.days || []).forEach((d) => flatExisting.push(d));
  });

  const blocks: MasterMenuWeekBlock[] = [];
  let idx = 0;
  for (let w = 1; w <= weekCount; w++) {
    const prevWeek = existingWeeks?.find((ew) => ew.weekNumber === w);
    const days: MasterMenuDayCell[] = [];
    for (let d = 0; d < 5; d++) {
      const slotIdx = idx;
      idx += 1;
      const dateIso = dates[slotIdx];
      const existingByDate = flatExisting.find((x) => x.dateIso === dateIso);
      const existingBySlot = flatExisting[slotIdx];
      const source = existingByDate || existingBySlot;

      days.push({
        id: source?.id || `mm_d_${w}_${d + 1}`,
        dateIso,
        dayLabel: formatIndonesianFullDate(dateIso),
        menuNumber: source?.menuNumber || slotIdx + 1,
        makananPokok: source?.makananPokok || '',
        laukHewani: source?.laukHewani || '',
        laukNabati: source?.laukNabati || '',
        sayuran: source?.sayuran || '',
        buah: source?.buah || '',
        susu: source?.susu || '',
      });
    }

    blocks.push({
      id: prevWeek?.id || `mm_w_${w}`,
      weekNumber: w,
      weekLabel: prevWeek?.weekLabel || `Minggu Ke- ${w}`,
      days,
    });
  }

  return blocks;
}

export function formatMasterMenuDayAsMenuString(day: MasterMenuDayCell): string {
  return [
    day.makananPokok,
    day.laukHewani,
    day.laukNabati,
    day.sayuran,
    day.buah,
    day.susu,
  ]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(', ');
}

export function findMatchingMasterMenuForDate(
  masterMenus: MasterMenuPlan[],
  dateIso: string,
  preferredCategories?: TargetCategoryId[]
): { plan: MasterMenuPlan; week: MasterMenuWeekBlock; day: MasterMenuDayCell } | null {
  if (!masterMenus || masterMenus.length === 0) return null;

  const candidates: Array<{
    score: number;
    plan: MasterMenuPlan;
    week: MasterMenuWeekBlock;
    day: MasterMenuDayCell;
  }> = [];

  masterMenus.forEach((plan) => {
    for (const week of plan.weeks || []) {
      for (const day of week.days || []) {
        if (day.dateIso === dateIso) {
          let score = 1;
          if (preferredCategories && preferredCategories.length > 0) {
            const overlap = preferredCategories.filter((c) =>
              plan.categoryIds.includes(c)
            ).length;
            const exact =
              overlap === preferredCategories.length &&
              overlap === plan.categoryIds.length;
            score += exact ? 100 : overlap * 10;
          }
          const filledFields = [
            day.makananPokok,
            day.laukHewani,
            day.laukNabati,
            day.sayuran,
            day.buah,
            day.susu,
          ].filter((x) => x.trim().length > 0).length;
          score += filledFields > 0 ? 5 : 0;
          candidates.push({ score, plan, week, day });
        }
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;
  const best = candidates[0];
  return { plan: best.plan, week: best.week, day: best.day };
}

function matchTkpiItemByName(queryName: string, catalog: TkpiFoodItem[]): TkpiFoodItem | null {
  const clean = queryName.trim().toLowerCase();
  if (!clean || catalog.length === 0) return null;

  // Common cooking-phrase keyword normalization to improve TKPI 2020 matching
  const stopWords = new Set([
    'goreng',
    'rebus',
    'kukus',
    'bakar',
    'panggang',
    'tumis',
    'oseng',
    'saute',
    'capcay',
    'kering',
    'kuah',
    'saos',
    'saus',
    'kecap',
    'balado',
    'crispy',
    'bacem',
    'orek',
    'mendoan',
    'mix',
    'ceplok',
    'dadar',
    'manis',
    'muda',
    'pasele',
    'putih',
  ]);

  const exact = catalog.find((it) => it.namaBahan.toLowerCase() === clean);
  if (exact) return exact;

  const starts = catalog.find((it) => it.namaBahan.toLowerCase().startsWith(clean));
  if (starts) return starts;

  const tokens = clean
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const meaningful = tokens.filter((t) => !stopWords.has(t));
  const searchTokens = meaningful.length > 0 ? meaningful : tokens;
  if (searchTokens.length === 0) return null;

  // Special common Indonesian food aliases in TKPI 2020
  const joined = searchTokens.join(' ');
  const aliasMap: Record<string, string> = {
    'nasi': 'nasi',
    'telur': 'telur ayam',
    'ayam': 'ayam',
    'tempe': 'tempe',
    'tahu': 'tahu',
    'wortel': 'wortel',
    'kol': 'kol',
    'buncis': 'buncis',
    'pepaya': 'pepaya',
    'papya': 'pepaya',
    'kacang panjang': 'kacang panjang',
    'jagung': 'jagung',
    'semangka': 'semangka',
    'pisang': 'pisang',
    'jeruk': 'jeruk',
    'susu': 'susu sapi',
    'ikan': 'ikan',
    'daging': 'daging sapi',
    'bayam': 'bayam',
    'kangkung': 'kangkung',
  };

  let bestItem: TkpiFoodItem | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const target = item.namaBahan.toLowerCase();
    let score = 0;

    if (target.includes(clean)) score += 30;
    for (const tok of searchTokens) {
      const alias = aliasMap[tok] || tok;
      if (target.startsWith(alias)) score += 16;
      else if (target.includes(alias)) score += 10;
    }
    if (aliasMap[joined] && target.includes(aliasMap[joined])) {
      score += 18;
    }
    if (target.includes('segar') || target.includes('mentah')) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 10 ? bestItem : null;
}

export function buildFoodCostRowsFromMasterDay(
  dayCell: MasterMenuDayCell,
  tkpiCatalog: TkpiFoodItem[],
  defaultBeratMap?: Partial<Record<'pokok' | 'hewani' | 'nabati' | 'sayur' | 'buah' | 'susu', number>>
): FoodCostIngredientRow[] {
  const entries: Array<{
    kind: 'pokok' | 'hewani' | 'nabati' | 'sayur' | 'buah' | 'susu';
    dish: string;
    defaultGr: number;
  }> = [
    { kind: 'pokok', dish: dayCell.makananPokok.trim(), defaultGr: defaultBeratMap?.pokok ?? 100 },
    { kind: 'hewani', dish: dayCell.laukHewani.trim(), defaultGr: defaultBeratMap?.hewani ?? 55 },
    { kind: 'nabati', dish: dayCell.laukNabati.trim(), defaultGr: defaultBeratMap?.nabati ?? 35 },
    { kind: 'sayur', dish: dayCell.sayuran.trim(), defaultGr: defaultBeratMap?.sayur ?? 60 },
    { kind: 'buah', dish: dayCell.buah.trim(), defaultGr: defaultBeratMap?.buah ?? 100 },
    { kind: 'susu', dish: dayCell.susu.trim(), defaultGr: defaultBeratMap?.susu ?? 125 },
  ];

  const rows: FoodCostIngredientRow[] = [];

  entries.forEach(({ dish, defaultGr }, gIdx) => {
    if (!dish) return;
    // Split multi-ingredient dishes like "Oseng Kol + Wortel" or "Semangka/Jeruk Manis"
    const subParts = dish
      .split(/\s*[+/,]\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && !/^(saos|saus|goreng|rebus|kukus|kecap|crispy)$/i.test(s));

    const parts = subParts.length > 0 ? subParts : [dish];
    const perPartGr = parts.length > 1 ? Math.max(15, Math.round(defaultGr / parts.length)) : defaultGr;

    parts.forEach((part, pIdx) => {
      const matched = matchTkpiItemByName(part, tkpiCatalog) || matchTkpiItemByName(dish, tkpiCatalog);
      rows.push({
        id: `ing_mm_${Date.now().toString(36)}_${gIdx}_${pIdx}_${Math.random().toString(36).slice(2, 5)}`,
        menuName: pIdx === 0 ? dish : '',
        tkpiId: matched?.id,
        bahanMakanan: matched ? matched.namaBahan : part,
        beratBb: perPartGr,
        urt: '',
        energiPer100: matched ? matched.energi : 0,
        proteinPer100: matched ? matched.protein : 0,
        lemakPer100: matched ? matched.lemak : 0,
        khPer100: matched ? matched.kh : 0,
        seratPer100: matched ? matched.serat : 0,
        bddPercent: matched && matched.bdd > 0 ? matched.bdd : 100,
        jumlahManfaatOverride: null,
        purchaseUnit: 'kg',
        gramPerUnit: null,
        hargaSatuan: matched?.defaultHargaSatuan || 0,
      });
    });
  });

  return rows;
}
