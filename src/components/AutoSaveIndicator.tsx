import React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { AutoSaveStatus } from '../hooks/useAutoSave';

interface AutoSaveIndicatorProps {
  status: AutoSaveStatus;
  lastSavedAtLabel?: string;
  errorMessage?: string | null;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  status,
  lastSavedAtLabel,
  errorMessage,
}) => {
  if (status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-700"
        title={errorMessage || 'Gagal menyimpan otomatis'}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span>Gagal simpan otomatis</span>
      </span>
    );
  }

  if (status === 'saving' || status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 shrink-0" />
        <span>{status === 'saving' ? 'Menyimpan otomatis...' : 'Menunggu simpan...'}</span>
      </span>
    );
  }

  if (status === 'saved' && lastSavedAtLabel) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono-num">Tersimpan otomatis {lastSavedAtLabel}</span>
      </span>
    );
  }

  return (
    <span className="text-[11px] text-slate-400">
      Auto-simpan aktif
    </span>
  );
};
