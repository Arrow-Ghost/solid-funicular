/**
 * geminiVision.js - Gemini Multimodal Vision API Client
 * Interfaces with Google Gemini 3.6 Flash / 3.7 Flash for object detection,
 * living/non-living classification, 2D bounding boxes, and voice target identification.
 */

const DEFAULT_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) ||
  (typeof process !== 'undefined' && process.env && process.env.VITE_GEMINI_API_KEY) ||
  '';
const DEFAULT_MODEL = 'gemini-3.6-flash';

export class GeminiVisionClient {
  constructor(apiKey = null, model = DEFAULT_MODEL) {
    const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
    const storedModel = typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_model') : null;
    this.apiKey = apiKey || storedKey || DEFAULT_API_KEY;
    this.model = model || storedModel || DEFAULT_MODEL;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.isRequestInProgress = false;
  }

  setApiKey(key) {
    this.apiKey = key.trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gemini_api_key', this.apiKey);
    }
  }

  getApiKey() {
    return this.apiKey;
  }

  setModel(model) {
    this.model = model;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gemini_model', this.model);
    }
  }

  getModel() {
    return this.model;
  }

  /**
   * Helper to clean base64 data URL string into raw base64 and mime type.
   */
  parseBase64(dataUrl) {
    if (!dataUrl) return { mimeType: 'image/jpeg', data: '' };
    const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    return { mimeType: 'image/jpeg', data: dataUrl };
  }

  /**
   * Perform comprehensive scene object detection.
   * Classifies objects into "living" (humans, animals, pets, plants, insects)
   * and "non_living" (furniture, electronics, cups, tools, books, etc.)
   * with normalized bounding boxes [ymin, xmin, ymax, xmax] (0 to 1000).
   */
  async detectObjects(imageDataUrl) {
    if (this.isRequestInProgress) {
      console.warn('Gemini request already running, skipping frame');
      return null;
    }

    if (!this.apiKey) {
      throw new Error('Gemini API key not found. Please provide it in .env (VITE_GEMINI_API_KEY) or enter it in Settings (gear icon).');
    }

    const { mimeType, data } = this.parseBase64(imageDataUrl);
    if (!data) throw new Error('Invalid image frame provided');

    this.isRequestInProgress = true;
    const startTime = performance.now();

    const systemPrompt = `You are an advanced AI vision system performing real-time object detection on a live camera stream.
Analyze the image and identify all notable objects in the scene.
Categorize each object strictly into:
- "living": Humans, people, pets, dogs, cats, animals, birds, indoor/outdoor plants, flowers, trees, insects.
- "non_living": Inanimate objects such as laptops, phones, monitors, desks, chairs, mugs, bottles, pens, books, walls, windows, headphones, lamps, etc.

For each detected object, provide:
1. "name": A concise, clear label (e.g. "Person", "Coffee Mug", "Houseplant", "Laptop", "Smartphone").
2. "category": Strictly "living" or "non_living".
3. "confidence": Confidence percentage (number between 60 and 99).
4. "box_2d": Normalized 2D bounding box array [ymin, xmin, ymax, xmax] where coordinates are integers from 0 to 1000.
   - ymin: top edge (0 = top of image, 1000 = bottom)
   - xmin: left edge (0 = left, 1000 = right)
   - ymax: bottom edge
   - xmax: right edge
5. "location": Relative location description (e.g., "center foreground", "top left", "bottom right on desk").
6. "description": A short 1-sentence visual description.

Return ONLY a valid JSON object matching this schema:
{
  "scene_summary": "Short 1-sentence description of the overall scene",
  "objects": [
    {
      "name": "string",
      "category": "living" | "non_living",
      "confidence": number,
      "box_2d": [ymin, xmin, ymax, xmax],
      "location": "string",
      "description": "string"
    }
  ]
}`;

    try {
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API Error (${res.status}): ${errText}`);
      }

      const jsonResponse = await res.json();
      const rawText = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = this.safeParseJson(rawText);
      const latencyMs = Math.round(performance.now() - startTime);

      return {
        scene_summary: parsed.scene_summary || 'Camera feed scanned',
        objects: Array.isArray(parsed.objects) ? parsed.objects : [],
        latencyMs: latencyMs,
        timestamp: Date.now()
      };
    } finally {
      this.isRequestInProgress = false;
    }
  }

  /**
   * Targeted Object Search based on a user voice command.
   * Example query: "Find the water bottle", "Where is the plant?", "Identify the person".
   */
  async identifyTargetObject(imageDataUrl, userVoiceQuery) {
    if (!this.apiKey) {
      throw new Error('Gemini API key not found. Please provide it in .env (VITE_GEMINI_API_KEY) or enter it in Settings (gear icon).');
    }

    const { mimeType, data } = this.parseBase64(imageDataUrl);
    if (!data) throw new Error('Invalid image frame provided');

    const startTime = performance.now();

    const prompt = `The user is speaking to you via voice command: "${userVoiceQuery}".
Analyze the provided camera feed frame and answer the user's inquiry directly.
Tasks:
1. Locate the specific object, person, plant, or item the user is asking about.
2. Determine if it is present in the frame ("found": true/false).
3. If found, provide its precise normalized bounding box [ymin, xmin, ymax, xmax] (0 to 1000 scale) and categorize it as "living" or "non_living".
4. Formulate a natural, conversational, concise "spoken_response" suitable for Text-To-Speech (1-2 sentences).
   - E.g. "I found your water bottle on the right side of the desk next to your notebook."
   - E.g. "I see a houseplant sitting on the left windowsill in the background."
   - If not found: "I couldn't spot a [target] in your current camera view. Try panning the camera slightly."

Return strictly a JSON object:
{
  "found": boolean,
  "name": "string (name of identified item)",
  "category": "living" | "non_living",
  "confidence": number (0-100),
  "box_2d": [ymin, xmin, ymax, xmax],
  "location": "string (e.g. center left, foreground right)",
  "spoken_response": "string (natural spoken answer to speak out loud)"
}`;

    try {
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API Error (${res.status}): ${errText}`);
      }

      const jsonResponse = await res.json();
      const rawText = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = this.safeParseJson(rawText);
      const latencyMs = Math.round(performance.now() - startTime);

      return {
        ...parsed,
        query: userVoiceQuery,
        latencyMs: latencyMs,
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('Target identification failed:', err);
      throw err;
    }
  }

  /**
   * Robust JSON parser that handles codeblocks and partial JSON.
   */
  safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      // Remove markdown codeblock formatting if present
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (err2) {
        console.error('Failed to parse Gemini response as JSON:', text);
        return { objects: [], scene_summary: 'Unable to parse detection results' };
      }
    }
  }
}
