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
