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

export type LogoDocumentKey =
  | 'master_menu'
  | 'update_pm'
  | 'rekap_bahan'
  | 'po_bahan'
  | 'foodcost'
  | 'rekapan'
  | 'gizi'
  | 'sampel'
  | 'suhu'
  | 'freezer'
  | 'makanan';

export interface SppgLogoSettings {
  leftLogoDataUrl: string;
  leftLogoWidthPx: number;
  autoLinkLeftLogo: boolean;
  rightLogoDataUrl: string;
  rightLogoWidthPx: number;
  autoLinkRightLogo: boolean;
  applyLeftToDocs: Partial<Record<LogoDocumentKey, boolean>>;
  applyRightToDocs: Partial<Record<LogoDocumentKey, boolean>>;
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
  logoSettings?: SppgLogoSettings;
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
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
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
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
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
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
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

export type FoodTempSheetType = 'masak' | 'ompreng';

export interface FoodTempColumnLabels {
  tanggal: string;
  namaMakanan: string;
  suhuMakanan: string;
  paraf: string;
}

export interface FoodTempFormConfig {
  uid: string;
  monthKey: string;
  logoLeftDataUrl?: string;
  logoLeftWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
  headerLine1: string;
  headerLine2: string;
  headerLine3: string;
  headerLine4: string;
  titleMasak: string;
  titleOmpreng: string;
  bulanLabel: string;
  colLabels?: FoodTempColumnLabels;
  signerLine1: string;
  signerLine2: string;
  signerName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FoodTempItemRow {
  namaMakanan: string;
  suhu: string;
}

export interface FoodTempDayBlock {
  id: string;
  uid: string;
  monthKey: string;
  sheetType: FoodTempSheetType;
  blockOrder: number;
  tanggal: string;
  paraf: string;
  items: FoodTempItemRow[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PdfOrientation = 'landscape' | 'portrait';

export type WorkspaceTab =
  | 'dashboard'
  | 'master_menu'
  | 'update_pm'
  | 'rekap_bahan'
  | 'po_bahan'
  | 'rekapan'
  | 'gizi'
  | 'foodcost'
  | 'sampel'
  | 'suhu'
  | 'freezer'
  | 'makanan'
  | 'kalender'
  | 'arsip'
  | 'identitas';

// --- TKPI 2020 & Spreadsheet Sync ---

export interface TkpiFoodItem {
  id: string;
  no: string;
  namaBahan: string;
  sumber: string;
  beratStandar: number;
  bdd: number;
  energi: number;
  protein: number;
  lemak: number;
  kh: number;
  serat: number;
  defaultHargaSatuan?: number;
  defaultSatuan?: string;
  sourceType: 'tkpi' | 'spreadsheet' | 'manual';
}

export interface TkpiSyncConfig {
  uid: string;
  spreadsheetUrl: string;
  lastSyncedAt: string;
  syncedItems: TkpiFoodItem[];
  customItems: TkpiFoodItem[];
  updatedAt?: unknown;
}

// --- Update PM (Data Spesifik & Data Penerima Manfaat) ---

export type PmCategoryOrSampleId = TargetCategoryId | 'sampel';

export interface PmCategoryCounts {
  tanpaAlergiBesar: number;
  tanpaAlergiKecil: number;
  dietAlergiBesar: number;
  dietAlergiKecil: number;
}

export interface PmSpecificRow {
  id: string;
  rowOrder: number;
  namaSekolah: string;
  porsiBesarCategoryId: TargetCategoryId;
  porsiKecilCategoryId: TargetCategoryId;
  tanpaAlergiBesar: number;
  tanpaAlergiKecil: number;
  dietAlergiBesar: number;
  dietAlergiKecil: number;
}

export interface DailyPmRecord {
  id: string; // dateIso (YYYY-MM-DD)
  uid: string;
  monthKey: string;
  dateIso: string;
  hariKe: number;
  headerLine1: string;
  headerLine2: string;
  headerLine3: string;
  headerAlamat: string;
  titleSpecific: string;
  titleSummary: string;
  logoDataUrl?: string;
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
  specificRows: PmSpecificRow[];
  summaryOverrides: Partial<Record<PmCategoryOrSampleId, Partial<PmCategoryCounts>>>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// --- Nilai Gizi & Food Cost ---

export type FoodCostPurchaseUnit = 'kg' | 'potong' | 'ekor' | 'lembar' | 'rak';
export type FoodCostPortionScope = 'auto' | 'kecil' | 'besar' | 'semua';

export interface FoodCostIngredientRow {
  id: string;
  menuName: string;
  tkpiId?: string;
  bahanMakanan: string;
  beratBb: number;
  urt: string;
  energiPer100: number;
  proteinPer100: number;
  lemakPer100: number;
  khPer100: number;
  seratPer100: number;
  bddPercent: number;
  jumlahManfaatOverride?: number | null;
  purchaseUnit: FoodCostPurchaseUnit;
  /** Gram per 1 satuan (misal 250g/lembar tempe, 1850g/rak telur). Kosong jika pakai Kg atau input manual jumlah unit. */
  gramPerUnit?: number | null;
  manualPotong?: number | null;
  manualEkor?: number | null;
  manualLembar?: number | null;
  manualRak?: number | null;
  hargaSatuan: number;
}

export interface FoodCostWorksheet {
  id: string;
  title: string;
  sideLabel: string;
  categoryIds: TargetCategoryId[];
  portionScope: FoodCostPortionScope;
  isAllergySheet: boolean;
  bumbuPercent: number;
  akgOverride?: {
    energi: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  rows: FoodCostIngredientRow[];
}

export interface FoodCostDayPlan {
  id: string; // dateIso (YYYY-MM-DD)
  uid: string;
  monthKey: string;
  dateIso: string;
  hariKe: number;
  headerLine1: string;
  headerLine2: string;
  headerLine3: string;
  headerAlamat: string;
  logoDataUrl?: string;
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
  worksheets: FoodCostWorksheet[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

// --- Rekap Bahan Baku & Nota Pesanan (PO) ---

export interface RawMaterialOverrideItem {
  bufferPercent?: number | null;
  satuanPo?: string;
  hargaSatuan?: number | null;
  totalPoManual?: number | null;
  estimasiBufferManual?: number | null;
}

export interface RawMaterialRecapDayConfig {
  id: string; // dateIso (YYYY-MM-DD)
  uid: string;
  monthKey: string;
  dateIso: string;
  hariKe: number;
  headerLine1: string;
  headerLine2: string;
  headerLine3: string;
  headerAlamat: string;
  logoDataUrl?: string;
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
  recapTitle: string;
  sideLabel: string;
  bufferPercent: number;
  bumbuPercent: number;
  rabPorsiKecilRate: number;
  rabPorsiBesarRate: number;
  poJudul: string;
  poDari: string;
  poKepada: string;
  poAlamat: string;
  poSignerLabel1: string;
  poSignerLabel2: string;
  poSignerName: string;
  itemOverrides: Record<string, RawMaterialOverrideItem>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// --- Master Menu (1-4 Minggu / Bulanan) ---

export type MasterMenuCycleMode =
  | '1_minggu'
  | '2_minggu'
  | '3_minggu'
  | '4_minggu'
  | 'bulanan';

export interface MasterMenuRowLabels {
  kelompokHeader: string;
  makananPokok: string;
  laukHewani: string;
  laukNabati: string;
  sayuran: string;
  buah: string;
  susu: string;
}

export interface MasterMenuDayCell {
  id: string;
  dateIso: string;
  dayLabel: string;
  menuNumber: number;
  makananPokok: string;
  laukHewani: string;
  laukNabati: string;
  sayuran: string;
  buah: string;
  susu: string;
}

export interface MasterMenuWeekBlock {
  id: string;
  weekNumber: number;
  weekLabel: string;
  days: MasterMenuDayCell[];
}

export interface MasterMenuPlan {
  id: string;
  uid: string;
  monthKey: string;
  title: string;
  categoryIds: TargetCategoryId[];
  cycleMode: MasterMenuCycleMode;
  headerLine1: string;
  headerLine2: string;
  headerLine3: string;
  headerAlamat: string;
  logoDataUrl?: string;
  logoWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
  rowLabels: MasterMenuRowLabels;
  weeks: MasterMenuWeekBlock[];
  createdAt?: unknown;
  updatedAt?: unknown;
}


