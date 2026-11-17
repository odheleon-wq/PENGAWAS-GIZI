import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/api/detect-temperature', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY belum dikonfigurasi pada server. Pastikan API key tersedia di Settings > Secrets.',
        });
      }

      const { imageDataUrl, roomName } = req.body as {
        imageDataUrl?: string;
        roomName?: string;
      };

      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return res.status(400).json({ error: 'Foto suhu tidak ditemukan dalam permintaan.' });
      }

      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        return res.status(400).json({ error: 'Format gambar harus berupa Data URL base64 yang valid.' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const promptText = [
        `Anda adalah pembaca alat ukur termometer & higrometer digital/analog untuk formulir Monitoring Suhu & Kelembapan Ruangan SPPG (${roomName || 'Ruangan'}).`,
        'Periksa gambar secara cermat dan baca angka nominal yang tampil pada layar/jarum termometer atau higrometer.',
        'Aturan pembacaan:',
        '1. temperatureCelsius: angka suhu dalam derajat Celsius (°C), bisa positif, desimal, atau negatif (contoh: -18.5, 4.2, 24.6). Jika tidak terlihat atau bukan termometer, isi null.',
        '2. humidityPercent: angka kelembapan relatif (% RH), contoh 55 atau 62.5. Jika layar alat hanya menampilkan suhu tanpa kelembapan, isi null.',
        '3. timeDetected: jika layar alat menampilkan jam (misal 08:15), tulis format "HH.mm", jika tidak ada tulis "".',
        '4. rawReading: teks singkat apa yang terbaca di layar (misal "24.5°C / 58%").',
        '5. statusNote: keterangan singkat dalam bahasa Indonesia jika gambar buram, terpotong, atau bukan termometer.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              temperatureCelsius: {
                type: Type.NUMBER,
                nullable: true,
                description: 'Nominal suhu terbaca dalam Celsius (°C), atau null jika tidak terbaca.',
              },
              humidityPercent: {
                type: Type.NUMBER,
                nullable: true,
                description: 'Nominal kelembapan relatif (% RH), atau null jika tidak terbaca.',
              },
              timeDetected: {
                type: Type.STRING,
                description: 'Jam terbaca jika tampil di alat format HH.mm, atau string kosong.',
              },
              rawReading: {
                type: Type.STRING,
                description: 'Ringkasan angka mentah yang terlihat pada layar alat.',
              },
              statusNote: {
                type: Type.STRING,
                description: 'Catatan kejelasan pembacaan dalam bahasa Indonesia.',
              },
            },
            required: ['rawReading', 'statusNote'],
          },
        },
      });

      const jsonText = (response.text ?? '{}').trim();
      const result = JSON.parse(jsonText) as {
        temperatureCelsius?: number | null;
        humidityPercent?: number | null;
        timeDetected?: string;
        rawReading?: string;
        statusNote?: string;
      };

      return res.json({
        temperatureCelsius:
          typeof result.temperatureCelsius === 'number' && Number.isFinite(result.temperatureCelsius)
            ? Math.round(result.temperatureCelsius * 10) / 10
            : null,
        humidityPercent:
          typeof result.humidityPercent === 'number' && Number.isFinite(result.humidityPercent)
            ? Math.round(result.humidityPercent * 10) / 10
            : null,
        timeDetected: typeof result.timeDetected === 'string' ? result.timeDetected : '',
        rawReading: typeof result.rawReading === 'string' ? result.rawReading : '',
        statusNote: typeof result.statusNote === 'string' ? result.statusNote : '',
      });
    } catch (error) {
      console.error('Temperature detection error:', error);
      const message =
        error instanceof Error ? error.message : 'Gagal mendeteksi suhu dari foto.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/fetch-tkpi-csv', async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Link spreadsheet TKPI 2020 tidak ditemukan.' });
      }

      const trimmed = url.trim();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        return res.status(400).json({ error: 'Format URL spreadsheet tidak valid.' });
      }

      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ error: 'URL harus menggunakan protokol http atau https.' });
      }

      const host = parsedUrl.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.')
      ) {
        return res.status(400).json({ error: 'Host tidak diizinkan.' });
      }

      // Normalize Google Sheets URLs into direct CSV export links
      let targetUrl = trimmed;
      const gsheetMatch = trimmed.match(
        /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
      );
      if (gsheetMatch) {
        const sheetId = gsheetMatch[1];
        const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
        const gid = gidMatch ? gidMatch[1] : '0';
        if (!trimmed.includes('format=csv') && !trimmed.includes('output=csv') && !trimmed.includes('tqx=out:csv')) {
          targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SPPG-Portal/1.0)',
            Accept: 'text/csv,text/plain,*/*',
          },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return res.status(422).json({
            error: `Gagal mengambil spreadsheet (HTTP ${response.status}). Pastikan akses Google Sheets diset "Siapa saja yang memiliki link dapat melihat" atau Publikasikan ke Web (CSV).`,
          });
        }

        const csvText = await response.text();
        if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
          return res.status(422).json({
            error:
              'Link mengembalikan halaman HTML login/izin Google Sheets, bukan file CSV. Pastikan sharing diset "Anyone with the link can view" atau gunakan File → Bagikan → Publikasikan ke web (format CSV).',
          });
        }

        return res.json({
          csvText,
          resolvedUrl: targetUrl,
        });
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (error) {
      console.error('Fetch TKPI CSV error:', error);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Gagal menyinkronkan link spreadsheet TKPI 2020.',
      });
    }
  });

  app.post('/api/push-admin-sheet', async (req, res) => {
    try {
      const { webhookUrl, payload } = req.body as {
        webhookUrl?: string;
        payload?: unknown;
      };

      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return res.status(400).json({ error: 'URL Google Apps Script Web App belum diisi.' });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(webhookUrl.trim());
      } catch {
        return res.status(400).json({ error: 'Format URL Apps Script Web App tidak valid.' });
      }

      if (parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'URL Apps Script harus menggunakan protokol https://' });
      }

      const host = parsedUrl.hostname.toLowerCase();
      const isGoogleScriptHost =
        host === 'script.google.com' ||
        host.endsWith('.script.google.com') ||
        host === 'script.googleusercontent.com' ||
        host.endsWith('.googleusercontent.com');

      if (!isGoogleScriptHost) {
        return res.status(400).json({
          error:
            'Demi keamanan, URL webhook harus berasal dari domain resmi Google Apps Script (script.google.com).',
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(parsedUrl.toString(), {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SPPG-Admin-Sync/1.0',
          },
          body: JSON.stringify(payload ?? {}),
        });
        clearTimeout(timeout);

        const responseText = await response.text();
        if (!response.ok) {
          return res.status(422).json({
            error: `Google Apps Script mengembalikan HTTP ${response.status}: ${responseText.slice(0, 200)}`,
          });
        }

        return res.json({
          ok: true,
          responsePreview: responseText.slice(0, 300),
        });
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (error) {
      console.error('Push admin sheet error:', error);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Gagal mengirim database pengguna ke Google Sheets.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
