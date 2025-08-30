// server.js - Minimal Gemini proxy for /identify
import express from 'express';
import cors from 'cors';
import { Buffer } from 'buffer';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // حجم تصویر تا 50MB

const PORT = process.env.PORT || 3000;

// کلیدهای Gemini از Environment
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('❌ No GEMINI_API_KEY_x found in environment.');
  process.exit(1);
}

console.log(`🚀 Starting /identify server with ${API_KEYS.length} key(s)`);

let rrIndex = 0;
function nextKey() {
  const k = API_KEYS[rrIndex];
  rrIndex = (rrIndex + 1) % API_KEYS.length;
  return k;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, keys: API_KEYS.length, ts: Date.now() });
});

// Route اصلی /identify
app.post('/identify', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const apiKey = nextKey();
    const response = await fetch(
      `${GEMINI_BASE}/v1beta/models/gemini-pro-vision:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Describe this image in detail:' },
                { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', message: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
