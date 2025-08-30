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

// Route اصلی اصلاح شده در server.js
app.post('/identify', async (req, res) => {
  try {
    // 1. دریافت پرامپت و تصویر از کلاینت
    const { imageBase64, prompt } = req.body;
    if (!imageBase64 || !prompt) {
      return res.status(400).json({ error: 'No image or prompt provided' });
    }

    const apiKey = nextKey();

    // 2. ساختار صحیح درخواست برای Gemini API
    const geminiRequestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: { // نام صحیح: inlineData
              mimeType: 'image/jpeg', // نام صحیح: mimeType
              data: imageBase64
            }
          }
        ]
      }],
      // 3. درخواست خروجی JSON (بسیار مهم)
      generationConfig: {
        responseMimeType: "application/json",
      }
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequestBody),
    });
    
    // مدیریت بهتر خطاها
    if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();
        console.error(`Gemini API Error (${geminiResponse.status}):`, errorBody);
        // ارسال خطای اصلی از سمت Gemini به کلاینت
        return res.status(geminiResponse.status).send(errorBody);
    }

    const data = await geminiResponse.json();

    // استخراج متن JSON از پاسخ و ارسال آن
    // Gemini پاسخ را به صورت یک رشته JSON داخل یک ساختار دیگر برمیگرداند
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const jsonText = data.candidates[0].content.parts[0].text;
        try {
            // برای اطمینان از اینکه متن واقعاً JSON است، آن را parse می‌کنیم
            const parsedJson = JSON.parse(jsonText);
            // ارسال مستقیم آبجکت JSON نهایی به کلاینت
            res.json(parsedJson);
        } catch (e) {
            console.error("Gemini returned non-JSON text:", jsonText);
            res.status(500).json({ error: 'AI returned invalid JSON format' });
        }
    } else {
        // اگر پاسخ به دلیل ایمنی بلاک شده باشد
        console.error("Gemini response was blocked or had an unexpected structure:", data);
        res.status(400).json(data); // ارسال کل پاسخ خطا به کلاینت برای دیباگ
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error', message: String(err) });
  }
});