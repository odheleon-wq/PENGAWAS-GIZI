export type TargetCategoryId =
  | 'tk_paud_lb'
  | 'sd_1_3'
  | 'sd_4_6'
  | 'smp_mts'
  | 'sma_smk'
  | 'pendidik'
  | 'tendik'
  | 'anak_balita'
  | 'balita_13_59'
  | 'balita_6_11'
  | 'ibu_hamil'
  | 'ibu_menyusui';

export interface NutritionValues {
  energi: number;
  protein: number;
  lemak: number;
  karbohidrat: number;
  serat: number;
  jumlahManfaat: number;
}

export interface AkgTargetsConfig {
  energi: number;
  protein: number;
  lemak: number;
  karbohidrat: number;
  serat: number;
  targetOrang: number;
  customTitle?: string;
}

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
  selectedCategories?: TargetCategoryId[];
  akgTargets?: AkgTargetsConfig;
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
  nutritionByCategory?: Partial<Record<TargetCategoryId, NutritionValues>>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SampleColumnLabels {
  kodeIdentitas: string;
  jumlahSampel: string;
  kondisiSampel: string;
  ok: string;
  nok: string;
  penanggungJawab: string;
  masukChiler: string;
  keluarChiler: string;
  tanggal: string;
  jam: string;
}

export interface SampleFormConfig {
  uid: string;
  monthKey: string;
  logoDataUrl?: string;
  logoCaption: string;
  unitName: string;
  formLabel: string;
  formTitle: string;
  docNumber: string;
  revision: string;
  effectiveDate: string;
  bulanLabel: string;
  tahunLabel: string;
  colLabels?: SampleColumnLabels;
  verifierLine1: string;
  verifierLine2: string;
  verifierName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SamplePertinggalRow {
  id: string;
  uid: string;
  monthKey: string;
  rowOrder: number;
  kodeIdentitas: string;
  jumlahSampel: string;
  kondisiOk: string;
  kondisiNok: string;
  penanggungJawab: string;
  masukTanggal: string;
  masukJam: string;
  keluarTanggal: string;
  keluarJam: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TempTableLabels {
  kegiatan: string;
  tanggal: string;
  jam: string;
  suhu: string;
  rh: string;
  paraf: string;
  namaPetugas: string;
}

export interface TempFormConfig {
  uid: string;
  monthKey: string;
  logoDataUrl?: string;
  logoCaption: string;
  unitName: string;
  formLabel: string;
  formTitle: string;
  docNumber: string;
  revision: string;
  effectiveDate: string;
  periodeLabel: string;
  tableLabels?: TempTableLabels;
  sopTitle: string;
  sopSubtitle: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TempMonitoringRoom {
  id: string;
  uid: string;
  monthKey: string;
  roomOrder: number;
  roomName: string;
  presetKey: string;
  standardSuhu: string;
  standardRh: string;
  sopNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TempDayReading {
  id: string; // "1".."31"
  uid: string;
  monthKey: string;
  roomId: string;
  day: number;
  jam: string;
  suhu: string;
  rh: string;
  paraf: string;
  namaPetugas: string;
  photoDataUrl?: string;
  detectedNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DetectedTemperatureResult {
  temperatureCelsius: number | null;
  humidityPercent: number | null;
  timeDetected: string;
  rawReading: string;
  statusNote: string;
}

export type FreezerMachineType = 'freezer' | 'chiller';

export interface FreezerColumnLabels {
  namaMesin: string;
  merk: string;
  noMesin: string;
  lokasi: string;
  periode: string;
  no: string;
  tanggal: string;
  jamCek1: string;
  suhu1: string;
  pic1: string;
  jamCek2: string;
  suhu2: string;
  pic2: string;
  jamCek3: string;
  suhu3: string;
  pic3: string;
  keterangan: string;
}

export interface FreezerFormConfig {
  uid: string;
  monthKey: string;
  logoDataUrl?: string;
  logoCaption: string;
  unitName: string;
  formLabel: string;
  formTitle: string;
  docNumber: string;
  revision: string;
  effectiveDate: string;
  periodeLabel: string;
  colLabels?: FreezerColumnLabels;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FreezerMachine {
  id: string;
  uid: string;
  monthKey: string;
  machineOrder: number;
  machineType: FreezerMachineType;
  namaMesin: string;
  merk: string;
  noMesin: string;
  lokasi: string;
  normalSuhuBgn: string;
  bgnSopNote: string;
  conclusionHeader: string;
  repairPrompt: string;
  repairNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FreezerLogRow {
  id: string;
  uid: string;
  monthKey: string;
  machineId: string;
  rowOrder: number;
  noLabel: string;
  tanggal: string;
  jamCek1: string;
  suhu1: string;
  pic1: string;
  jamCek2: string;
  suhu2: string;
  pic2: string;
  jamCek3: string;
  suhu3: string;
  pic3: string;
  keterangan: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PdfOrientation = 'landscape' | 'portrait';

export type WorkspaceTab =
  | 'rekapan'
  | 'gizi'
  | 'sampel'
  | 'suhu'
  | 'freezer'
  | 'kalender'
  | 'arsip'
  | 'identitas';
