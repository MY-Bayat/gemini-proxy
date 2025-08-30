// server.js - Hardened Gemini Proxy for SisuNic on Render
import express from 'express';
import cors from 'cors';

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.5-flash';

// --- Middleware ---
// Enable CORS for all routes to allow frontend access
app.use(cors());
// Increase JSON payload limit for large base64 images
app.use(express.json({ limit: '10mb' }));

// --- API Key Management ---
// Load all available Gemini API keys from environment variables.
// Render.com uses the "Environment" tab to set these.
const API_KEYS = Object.keys(process.env)
  .filter(key => key.startsWith('GEMINI_API_KEY_'))
  .map(key => process.env[key])
  .filter(Boolean); // Filter out any undefined/empty keys

if (API_KEYS.length === 0) {
  console.error('FATAL ERROR: No GEMINI_API_KEY_x variables found in the environment.');
  console.error('Please set at least one GEMINI_API_KEY_1 in your deployment environment.');
  process.exit(1); // Exit if no keys are configured
}

console.log(`✅ SisuNic Proxy Server starting...`);
console.log(`🔑 Found ${API_KEYS.length} Gemini API key(s).`);

// Simple round-robin to distribute requests across keys
let keyIndex = 0;
function getNextApiKey() {
  const key = API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % API_KEYS.length;
  return key;
}

// --- Routes ---

// Health check endpoint to verify the server is running
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    activeKeys: API_KEYS.length,
  });
});

// Main endpoint for component identification
app.post('/identify', async (req, res) => {
  console.log('Received request for /identify');
  try {
    const { imageBase64, prompt } = req.body;

    if (!imageBase64 || !prompt) {
      console.warn('⚠️ Bad Request: Missing imageBase64 or prompt.');
      return res.status(400).json({ error: 'Request body must contain "imageBase64" and "prompt".' });
    }

    const apiKey = getNextApiKey();
    const geminiUrl = `${GEMINI_BASE_URL}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // This is the specific JSON structure required by the Gemini REST API
    const requestPayload = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    };

    console.log(`Sending request to Gemini API with key ending in ...${apiKey.slice(-4)}`);

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    // Handle non-successful responses from the Gemini API
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`❌ Gemini API Error (Status: ${geminiResponse.status}): ${errorText}`);
      // Forward the error from Gemini to the client for better debugging
      return res.status(geminiResponse.status).json({
        error: `Gemini API request failed with status ${geminiResponse.status}`,
        details: errorText,
      });
    }

    const data = await geminiResponse.json();

    // The Gemini API wraps the JSON output within a text field in the response.
    // We need to extract and parse it.
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (jsonText) {
      try {
        const parsedJson = JSON.parse(jsonText);
        console.log('✅ Successfully identified component. Sending JSON response to client.');
        res.status(200).json(parsedJson);
      } catch (e) {
        console.error('❌ Gemini returned a string that is not valid JSON:', jsonText);
        res.status(500).json({ error: 'AI returned an invalid JSON format.' });
      }
    } else {
      // This can happen if the response was blocked for safety reasons or had an unexpected structure.
      console.warn('⚠️ Gemini response was blocked or did not contain expected text part.', JSON.stringify(data, null, 2));
      res.status(400).json({
        error: 'AI response was empty or blocked.',
        details: data,
      });
    }

  } catch (error) {
    console.error('💥 An unexpected server error occurred:', error);
    res.status(500).json({
      error: 'An internal server error occurred.',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
  console.log(`🔗 Health check available at http://localhost:${PORT}/health`);
});