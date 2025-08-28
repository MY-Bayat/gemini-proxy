// server.js
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// اجازه دسترسی از هر دامنه (اپلیکیشن موبایل)
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment');
  process.exit(1);
}

app.post('/identify', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image is required' });
    }

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };

    const prompt = `You are an expert system for identifying electronic, industrial, and medical components...`; // همون پرامپت طولانی تو

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: 'application/json'
        // schema رو اضافه کن اگر خواستی
      }
    });

    const text = response.text();
    const result = JSON.parse(text);

    res.json(result);
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'AI service error' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
});