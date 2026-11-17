import type { LogoDocumentKey, SppgLogoSettings, SppgUserProfile } from '../types';

export const LOGO_DOCUMENT_META: Array<{
  key: LogoDocumentKey;
  label: string;
  group: string;
}> = [
  { key: 'master_menu', label: 'Master Menu (1–4 Minggu / Bulanan)', group: 'Perencanaan' },
  { key: 'update_pm', label: 'Update PM (Data Spesifik & Rekap)', group: 'Perencanaan' },
  { key: 'foodcost', label: 'Nilai Gizi & Food Cost', group: 'Perencanaan' },
  { key: 'rekap_bahan', label: 'Rekap Bahan Baku', group: 'Pengadaan' },
  { key: 'po_bahan', label: 'PO Bahan Baku (Nota Pesanan)', group: 'Pengadaan' },
  { key: 'rekapan', label: 'Rekapan Menu Harian', group: 'Pelaporan' },
  { key: 'gizi', label: 'Rekapan Nilai Gizi Bulanan', group: 'Pelaporan' },
  { key: 'sampel', label: 'Form Sampel Pertinggal', group: 'Keamanan Pangan' },
  { key: 'suhu', label: 'Monitoring Suhu Ruangan', group: 'Keamanan Pangan' },
  { key: 'freezer', label: 'Suhu Freezer & Chiller', group: 'Keamanan Pangan' },
  { key: 'makanan', label: 'Suhu Makanan & Ompreng', group: 'Keamanan Pangan' },
];

export function buildAllDocsFlagMap(defaultValue = true): Partial<Record<LogoDocumentKey, boolean>> {
  const map: Partial<Record<LogoDocumentKey, boolean>> = {};
  LOGO_DOCUMENT_META.forEach((item) => {
    map[item.key] = defaultValue;
  });
  return map;
}

export function getDefaultLogoSettings(): SppgLogoSettings {
  return {
    leftLogoDataUrl: '',
    leftLogoWidthPx: 56,
    autoLinkLeftLogo: true,
    rightLogoDataUrl: '',
    rightLogoWidthPx: 56,
    autoLinkRightLogo: true,
    applyLeftToDocs: buildAllDocsFlagMap(true),
    applyRightToDocs: buildAllDocsFlagMap(true),
  };
}

export function normalizeLogoSettings(raw?: Partial<SppgLogoSettings> | null): SppgLogoSettings {
  const def = getDefaultLogoSettings();
  if (!raw) return def;
  const clampWidth = (n: unknown, fallback = 56) => {
    const parsed = Number(n);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(20, Math.min(180, Math.round(parsed)));
  };
  return {
    leftLogoDataUrl: typeof raw.leftLogoDataUrl === 'string' ? raw.leftLogoDataUrl.slice(0, 200000) : '',
    leftLogoWidthPx: clampWidth(raw.leftLogoWidthPx, 56),
    autoLinkLeftLogo: raw.autoLinkLeftLogo !== false,
    rightLogoDataUrl: typeof raw.rightLogoDataUrl === 'string' ? raw.rightLogoDataUrl.slice(0, 200000) : '',
    rightLogoWidthPx: clampWidth(raw.rightLogoWidthPx, 56),
    autoLinkRightLogo: raw.autoLinkRightLogo !== false,
    applyLeftToDocs: { ...def.applyLeftToDocs, ...(raw.applyLeftToDocs || {}) },
    applyRightToDocs: { ...def.applyRightToDocs, ...(raw.applyRightToDocs || {}) },
  };
}

export interface LocalLogoOverrideShape {
  logoDataUrl?: string;
  logoLeftDataUrl?: string;
  logoWidthPx?: number;
  logoLeftWidthPx?: number;
  logoRightDataUrl?: string;
  logoRightWidthPx?: number;
  followGlobalLeftLogo?: boolean;
  followGlobalRightLogo?: boolean;
}

export interface ResolvedDocumentLogos {
  leftUrl: string;
  leftWidthPx: number;
  leftWidthMm: number;
  rightUrl: string;
  rightWidthPx: number;
  rightWidthMm: number;
  isUsingGlobalLeft: boolean;
  isUsingGlobalRight: boolean;
}

export function pxToPdfMm(px?: number): number {
  const safe = Number(px);
  if (!Number.isFinite(safe) || safe <= 0) return 15;
  return Math.max(7, Math.min(36, Math.round((safe / 56) * 15 * 10) / 10));
}

export function resolveDocumentLogos(
  profile: SppgUserProfile | null | undefined,
  docKey: LogoDocumentKey,
  local?: LocalLogoOverrideShape | null
): ResolvedDocumentLogos {
  const settings = normalizeLogoSettings(profile?.logoSettings);

  const localLeftUrl = local?.logoLeftDataUrl ?? local?.logoDataUrl ?? '';
  const localLeftWidth = local?.logoLeftWidthPx ?? local?.logoWidthPx;
  const followGlobalLeft = local?.followGlobalLeftLogo !== false;
  const docAllowsGlobalLeft = settings.applyLeftToDocs?.[docKey] !== false;

  let leftUrl = '';
  let leftWidthPx = settings.leftLogoWidthPx || 56;
  let isUsingGlobalLeft = false;

  if (followGlobalLeft && settings.autoLinkLeftLogo && docAllowsGlobalLeft && settings.leftLogoDataUrl) {
    leftUrl = settings.leftLogoDataUrl;
    leftWidthPx = settings.leftLogoWidthPx || 56;
    isUsingGlobalLeft = true;
  } else if (localLeftUrl) {
    leftUrl = localLeftUrl;
    leftWidthPx = localLeftWidth && localLeftWidth > 0 ? localLeftWidth : settings.leftLogoWidthPx || 56;
  } else if (docAllowsGlobalLeft && settings.leftLogoDataUrl) {
    leftUrl = settings.leftLogoDataUrl;
    leftWidthPx = settings.leftLogoWidthPx || 56;
    isUsingGlobalLeft = true;
  }

  const localRightUrl = local?.logoRightDataUrl ?? '';
  const localRightWidth = local?.logoRightWidthPx;
  const followGlobalRight = local?.followGlobalRightLogo !== false;
  const docAllowsGlobalRight = settings.applyRightToDocs?.[docKey] !== false;

  let rightUrl = '';
  let rightWidthPx = settings.rightLogoWidthPx || 56;
  let isUsingGlobalRight = false;

  if (followGlobalRight && settings.autoLinkRightLogo && docAllowsGlobalRight && settings.rightLogoDataUrl) {
    rightUrl = settings.rightLogoDataUrl;
    rightWidthPx = settings.rightLogoWidthPx || 56;
    isUsingGlobalRight = true;
  } else if (localRightUrl) {
    rightUrl = localRightUrl;
    rightWidthPx =
      localRightWidth && localRightWidth > 0 ? localRightWidth : settings.rightLogoWidthPx || 56;
  } else if (docAllowsGlobalRight && settings.rightLogoDataUrl) {
    rightUrl = settings.rightLogoDataUrl;
    rightWidthPx = settings.rightLogoWidthPx || 56;
    isUsingGlobalRight = true;
  }

  return {
    leftUrl,
    leftWidthPx,
    leftWidthMm: pxToPdfMm(leftWidthPx),
    rightUrl,
    rightWidthPx,
    rightWidthMm: pxToPdfMm(rightWidthPx),
    isUsingGlobalLeft,
    isUsingGlobalRight,
  };
}

export async function compressLogoDataUrl(file: File, maxDim = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar logo.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Format gambar tidak valid.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const cw = Math.max(1, Math.round(img.width * scale));
        const ch = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        let out = canvas.toDataURL('image/png');
        if (out.length > 180000) {
          // Fallback to JPEG on white background if PNG exceeds 180KB Firestore limit
          const jpgCanvas = document.createElement('canvas');
          jpgCanvas.width = cw;
          jpgCanvas.height = ch;
          const jctx = jpgCanvas.getContext('2d');
          if (jctx) {
            jctx.fillStyle = '#FFFFFF';
            jctx.fillRect(0, 0, cw, ch);
            jctx.drawImage(img, 0, 0, cw, ch);
            out = jpgCanvas.toDataURL('image/jpeg', 0.86);
          }
        }
        resolve(out.slice(0, 195000));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
