// server.js - Transparent Gemini proxy (round-robin key rotation)
// Requires Node >= 18 (global fetch available)
import express from 'express';
import cors from 'cors';
import { Buffer } from 'buffer';

const app = express();
app.use(cors()); // در محیط production بهتر originها را محدود کن

const PORT = process.env.PORT || 3000;

// جمع‌آوری کلیدها از محیط
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('❌ No GEMINI_API_KEY_x found in environment. Set at least one key.');
  process.exit(1);
}

console.log(`🚀 Starting proxy with ${API_KEYS.length} API key(s)`);

let rrIndex = 0;
function nextKey() {
  const k = API_KEYS[rrIndex];
  rrIndex = (rrIndex + 1) % API_KEYS.length;
  return k;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Health endpoint (use this path as Render health check)
app.get('/health', (req, res) => {
  res.json({ ok: true, keys: API_KEYS.length, ts: Date.now() });
});

/**
 * Proxy route: فوروارد دقیق هر درخواستی که به /v1/* یا /v1beta/* میاد
 * - نگه‌داشتن body (برای JSON یا multipart/form-data یا binary)
 * - حذف پارامتر query 'key' و حذف هدرهای Authorization / x-goog-api-key از کلاینت
 * - افزودن هدر x-goog-api-key از لیست سرور (round-robin)
 */
const rawBodyParser = express.raw({ type: '*/*', limit: '50mb' });

async function handleProxy(req, res) {
  // build target URL (بدون key query param از کلاینت)
  const urlObj = new URL(req.originalUrl, GEMINI_BASE);
  urlObj.searchParams.delete('key');

  const targetUrl = urlObj.toString();
  const apiKey = nextKey();

  // prepare headers: copy original but remove/override حسّاس‌ها
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    const lk = k.toLowerCase();
    if (['host', 'content-length', 'authorization', 'x-goog-api-key', 'cookie', 'connection'].includes(lk)) continue;
    headers[k] = v;
  }
  headers['x-goog-api-key'] = apiKey; // کلید سرور

  // body: در raw mode، req.body یک Buffer است
  const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
  const bodyToSend = hasBody ? req.body : undefined;

  try {
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyToSend,
      // signal: optional AbortSignal for timeouts if you want
    });

    // پاس کردن status و content-type و body (بافر)
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const contentType = resp.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    res.status(resp.status).send(buffer);
  } catch (err) {
    console.error('Proxy request failed:', err?.message || err);
    res.status(502).json({ ok: false, error: 'PROXY_REQUEST_FAILED', message: String(err?.message || err) });
  }
}

// mount proxy routes with raw parser so multipart/json/binary همه پاس میشن
app.all('/v1/*', rawBodyParser, handleProxy);
app.all('/v1beta/*', rawBodyParser, handleProxy);

// Optional convenience route: اگر خواستی یک اندپوینت مختصر برای اپ بسازی (example)
// app.post('/identify', express.json({ limit: '50mb' }), async (req, res) => { /* می‌تونی این را فعال کنی */ });

app.listen(PORT, () => {
  console.log(`✅ Gemini proxy running on http://localhost:${PORT}`);
  console.log(`🔄 Key rotation with ${API_KEYS.length} key(s)`);
  console.log(`🩺 Health check: GET /health`);
});
