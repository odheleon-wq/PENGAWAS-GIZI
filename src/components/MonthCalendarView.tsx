import React from 'react';
import { CalendarCheck2, Clock, Plus } from 'lucide-react';
import type { DailyMenuEntry } from '../types';
import {
  formatIndonesianFullDate,
  getMonthCalendarCells,
  getPeriodeDisplayName,
  parseMonthKey,
} from '../utils/dateUtils';

interface MonthCalendarViewProps {
  monthKey: string;
  entries: DailyMenuEntry[];
  onSelectDate: (dateIso: string, existingEntry: DailyMenuEntry | null) => void;
}

const WEEKDAY_HEADERS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export const MonthCalendarView: React.FC<MonthCalendarViewProps> = ({
  monthKey,
  entries,
  onSelectDate,
}) => {
  const { year, month } = parseMonthKey(monthKey);
  const cells = getMonthCalendarCells(year, month);
  const entryMap = new Map(entries.map((e) => [e.dateIso, e]));

  const pastMissedDates = cells.filter(
    (c) => c.dateIso && c.isPast && !c.isWeekend && !entryMap.has(c.dateIso)
  );
  const filledCount = cells.filter((c) => c.dateIso && entryMap.has(c.dateIso)).length;

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Kalender & Tanggal Terlewat · {getPeriodeDisplayName(monthKey)}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Klik tanggal mana saja untuk melihat kembali menu yang sudah terisi atau melengkapi tanggal lampau yang terlewat.
          </p>
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-600 shrink-0">
          <div>
            <span className="font-mono-num text-base font-semibold text-emerald-700">{filledCount}</span>
            <span className="ml-1.5">hari terisi</span>
          </div>
          <span className="text-slate-300" aria-hidden="true">|</span>
          <div>
            <span className="font-mono-num text-base font-semibold text-amber-600">
              {pastMissedDates.length}
            </span>
            <span className="ml-1.5">hari kerja terlewat</span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAY_HEADERS.map((day) => (
            <div
              key={day}
              className="px-2 py-2.5 text-center text-xs font-semibold text-slate-600"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
          {cells.map((cell, index) => {
            if (!cell.dateIso || !cell.dayNumber) {
              return <div key={`empty-${index}`} className="min-h-[104px] bg-slate-50/50" />;
            }

            const entry = entryMap.get(cell.dateIso) || null;
            const isMissedPast = cell.isPast && !cell.isWeekend && !entry;

            return (
              <button
                key={cell.dateIso}
                type="button"
                onClick={() => onSelectDate(cell.dateIso!, entry)}
                className={`group flex min-h-[104px] flex-col justify-between p-2.5 text-left transition-colors hover:bg-emerald-50/50 ${
                  cell.isToday
                    ? 'bg-emerald-50/40 ring-1 ring-inset ring-emerald-500'
                    : isMissedPast
                    ? 'bg-amber-50/35'
                    : cell.isWeekend
                    ? 'bg-slate-50/40'
                    : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`font-mono-num text-xs font-semibold ${
                      cell.isToday
                        ? 'text-emerald-700'
                        : cell.isWeekend
                        ? 'text-slate-400'
                        : 'text-slate-800'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {entry ? (
                    <span className="font-mono-num text-[11px] font-medium text-emerald-700">
                      H-{entry.hariKe}
                    </span>
                  ) : isMissedPast ? (
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>

                {entry ? (
                  <div className="mt-1.5 space-y-1">
                    {entry.photoDataUrl && (
                      <div className="h-10 w-full overflow-hidden rounded border border-slate-200">
                        <img
                          src={entry.photoDataUrl}
                          alt={entry.namaMenu}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <p className="line-clamp-2 text-[11px] leading-tight text-slate-700">
                      {entry.namaMenu}
                    </p>
                  </div>
                ) : (
                  <div className="mt-auto">
                    <span className="text-[11px] text-slate-400">
                      {isMissedPast ? 'Terlewat · Isi susulan' : cell.isWeekend ? 'Akhir pekan' : 'Kosong'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick List of Missed Past Dates for Fast Recovery */}
      {pastMissedDates.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck2 className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Tanggal Lampau yang Belum Diisi ({pastMissedDates.length} hari)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pastMissedDates.map((c) => (
              <button
                key={c.dateIso}
                type="button"
                onClick={() => onSelectDate(c.dateIso!, null)}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
              >
                <span className="font-medium text-slate-800">
                  {formatIndonesianFullDate(c.dateIso!)}
                </span>
                <span className="font-medium text-emerald-700">Isi Menu</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
