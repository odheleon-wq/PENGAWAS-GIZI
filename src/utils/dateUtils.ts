export const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const INDONESIAN_DAYS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

export const INDONESIAN_DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;

export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split('-').map(Number);
  return {
    year: Number.isFinite(y) ? y : new Date().getFullYear(),
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1,
  };
}

export function getPeriodeLabel(year: number, month: number, includeYear = false): string {
  const name = (INDONESIAN_MONTHS[month - 1] ?? 'Januari').toUpperCase();
  return includeYear ? `${name} ${year}` : name;
}

export function getPeriodeDisplayName(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return `${INDONESIAN_MONTHS[month - 1] ?? 'Januari'} ${year}`;
}

export function formatIndonesianFullDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  const dt = new Date(year, month - 1, day);
  const dayName = INDONESIAN_DAYS[dt.getDay()] ?? '';
  const monthName = INDONESIAN_MONTHS[month - 1] ?? '';
  return `${dayName}, ${String(day).padStart(2, '0')} ${monthName} ${year}`;
}

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthCalendarCells(year: number, month: number): Array<{
  dateIso: string | null;
  dayNumber: number | null;
  dayOfWeek: number;
  isPast: boolean;
  isToday: boolean;
  isWeekend: boolean;
}> {
  const totalDays = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 = Minggu
  const mondayBasedOffset = (firstDayOfWeek + 6) % 7; // Senin = 0 .. Minggu = 6
  const todayIso = getTodayIso();

  const cells: Array<{
    dateIso: string | null;
    dayNumber: number | null;
    dayOfWeek: number;
    isPast: boolean;
    isToday: boolean;
    isWeekend: boolean;
  }> = [];

  for (let i = 0; i < mondayBasedOffset; i++) {
    cells.push({
      dateIso: null,
      dayNumber: null,
      dayOfWeek: (i + 1) % 7,
      isPast: false,
      isToday: false,
      isWeekend: i >= 5,
    });
  }

  for (let day = 1; day <= totalDays; day++) {
    const dt = new Date(year, month - 1, day);
    const dayOfWeek = dt.getDay();
    const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      dateIso,
      dayNumber: day,
      dayOfWeek,
      isPast: dateIso < todayIso,
      isToday: dateIso === todayIso,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }

  return cells;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const d = new Date(year, month - 1 + delta, 1);
  return getMonthKey(d.getFullYear(), d.getMonth() + 1);
}

export function getNextSuggestedDateInMonth(
  monthKey: string,
  existingDateIsos: string[]
): string {
  const { year, month } = parseMonthKey(monthKey);
  const totalDays = getDaysInMonth(year, month);

  if (existingDateIsos.length === 0) {
    const today = getTodayIso();
    return today.startsWith(monthKey) ? today : `${monthKey}-01`;
  }

  const sorted = [...existingDateIsos].filter((d) => d.startsWith(monthKey)).sort();
  const latest = sorted[sorted.length - 1];
  if (!latest) {
    const today = getTodayIso();
    return today.startsWith(monthKey) ? today : `${monthKey}-01`;
  }

  const latestDay = Number(latest.split('-')[2]) || 1;
  const nextDay = Math.min(totalDays, latestDay + 1);
  return `${monthKey}-${String(nextDay).padStart(2, '0')}`;
}

