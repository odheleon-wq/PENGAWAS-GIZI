export interface SppgUserProfile {
  uid: string;
  email: string;
  reportTitle: string;
  namaSppg: string;
  idSppg: string;
  alamat: string;
  kabKota: string;
  provinsi: string;
  namaSppi: string;
  nomorHp: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MonthlyArchive {
  id: string;
  uid: string;
  monthKey: string; // YYYY-MM
  year: number;
  month: number; // 1-12
  periodeLabel: string;
  entryCount: number;
  photoCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DailyMenuEntry {
  id: string;
  uid: string;
  monthKey: string; // YYYY-MM
  dateIso: string; // YYYY-MM-DD
  hariKe: number;
  namaMenu: string;
  photoDataUrl: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PdfOrientation = 'landscape' | 'portrait';

export type WorkspaceTab = 'rekapan' | 'kalender' | 'arsip' | 'identitas';
