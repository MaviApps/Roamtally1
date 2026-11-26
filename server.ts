import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Model response did not contain valid JSON.');
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'mavi-travel-split' });
});

app.get('/api/travel/fx', async (req: Request, res: Response) => {
  const base = String(req.query.base || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'USD';
  try {
    const fxRes = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!fxRes.ok) {
      throw new Error(`FX upstream responded ${fxRes.status}`);
    }
    const data = (await fxRes.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result === 'success' && data.rates) {
      res.json({ base, rates: data.rates, source: 'live' });
      return;
    }
    throw new Error('Unexpected FX response shape');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FX lookup failed';
    res.status(502).json({ error: message });
  }
});

async function fetchLiveOpenMeteoWeather(destination: string): Promise<string | null> {
  try {
    const cleanPlace = destination.split(',')[0].trim();
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanPlace)}&count=1&language=en&format=json`
    );
    if (!geoRes.ok) return null;
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
    };
    const loc = geoData.results?.[0];
    if (!loc) return null;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`
    );
    if (!wxRes.ok) return null;
    const wx = (await wxRes.json()) as {
      current?: { temperature_2m?: number; wind_speed_10m?: number };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };

    const temp = wx.current?.temperature_2m;
    const wind = wx.current?.wind_speed_10m;
    const high = wx.daily?.temperature_2m_max?.[0];
    const low = wx.daily?.temperature_2m_min?.[0];
    const rain = wx.daily?.precipitation_probability_max?.[0];
    if (typeof temp !== 'number') return null;

    return `Live Open-Meteo (${loc.name}): ${temp.toFixed(1)}°C now (High ${high?.toFixed(0) ?? '--'}°C / Low ${low?.toFixed(0) ?? '--'}°C), Wind ${wind?.toFixed(0) ?? '--'} km/h, Rain chance ${rain ?? 0}%.`;
  } catch {
    return null;
  }
}

app.post('/api/travel/insights', async (req: Request, res: Response) => {
  try {
    const { origin, destination, startDate, endDate, travelers } = req.body as {
      origin?: string;
      destination?: string;
      startDate?: string;
      endDate?: string;
      travelers?: number;
    };

    if (!destination || !origin) {
      res.status(400).json({ error: 'Origin and destination are required.' });
      return;
    }

    const ai = getGeminiClient();
    const liveWeatherPromise = fetchLiveOpenMeteoWeather(destination);

    const prompt = `You are MAVI, a practical travel planning assistant.
Research current travel conditions for a trip from "${origin}" to "${destination}" (${startDate || 'upcoming'} to ${endDate || 'upcoming'}) for ${travelers || 2} travelers.

Use Google Search to check realistic seasonal/current weather, typical flight or rail route considerations between ${origin} and ${destination}, top local tourist spots, and entry/document/insurance requirements.

Respond ONLY with a single valid JSON object (no surrounding markdown prose) matching this exact shape:
{
  "weatherSummary": "2-3 concise sentences on current/seasonal temperatures, rain likelihood, and packing tips (max 380 chars).",
  "flightUpdateSummary": "2-3 concise sentences on main flight/train connections, typical airport/station buffer times, and transit reminders (max 500 chars).",
  "centerLat": 35.0116,
  "centerLng": 135.7681,
  "touristSpots": [
    {
      "name": "Spot Name",
      "category": "Landmark | Museum | Neighborhood | Nature | Food",
      "description": "Concise 1-sentence reason to visit.",
      "estimatedCost": 25,
      "latOffset": 0.012,
      "lngOffset": -0.015
    }
  ],
  "requiredDocs": [
    {
      "docType": "passport | visa | insurance | customs | ticket",
      "title": "Document Name",
      "requirement": "Actionable 1-sentence requirement for traveling from ${origin} to ${destination}.",
      "priority": "mandatory | recommended"
    }
  ]
}
Provide 5 touristSpots with varied latOffset/lngOffset between -0.04 and 0.04, and 4 requiredDocs including travel insurance.`;

    const [response, liveWeather] = await Promise.all([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      liveWeatherPromise,
    ]);

    const parsed = extractJsonObject(response.text ?? '{}');
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = chunks
      .map((chunk) => {
        const web = (chunk as { web?: { uri?: string; title?: string } }).web;
        return web?.uri ? { title: web.title || web.uri, uri: web.uri } : null;
      })
      .filter((item): item is { title: string; uri: string } => item !== null)
      .slice(0, 5);

    const aiWeather = String(parsed.weatherSummary || 'Mild conditions expected; pack layered clothing.');
    const combinedWeather = liveWeather ? `${liveWeather} ${aiWeather}` : aiWeather;

    res.json({
      weatherSummary: combinedWeather.slice(0, 780),
      flightUpdateSummary: String(parsed.flightUpdateSummary || 'Arrive 2 hours early for check-in and transit transfers.'),
      centerLat: typeof parsed.centerLat === 'number' ? parsed.centerLat : 40.7128,
      centerLng: typeof parsed.centerLng === 'number' ? parsed.centerLng : -74.006,
      touristSpots: Array.isArray(parsed.touristSpots) ? parsed.touristSpots.slice(0, 8) : [],
      requiredDocs: Array.isArray(parsed.requiredDocs) ? parsed.requiredDocs.slice(0, 8) : [],
      sources,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate travel insights.';
    console.error('Gemini /api/travel/insights error:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/travel/itinerary-suggest', async (req: Request, res: Response) => {
  try {
    const { origin, destination, startDate, endDate, currency, budget } = req.body as {
      origin?: string;
      destination?: string;
      startDate?: string;
      endDate?: string;
      currency?: string;
      budget?: number;
    };

    if (!destination) {
      res.status(400).json({ error: 'Destination is required.' });
      return;
    }

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Generate 4 practical itinerary items for a trip from ${origin || 'Home'} to ${destination} (${startDate || 'Day 1'} to ${endDate || 'Day 4'}) with total budget ${budget || 1500} ${currency || 'USD'}. Include 1 outbound flight or train, 1 lodging stay, 1 signature tourist activity, and 1 group dinner.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING, description: 'One of: flight, train, lodging, activity, dining, transport' },
              dateTime: { type: Type.STRING, description: 'ISO-like readable date and time e.g. 2026-12-02 09:30' },
              location: { type: Type.STRING },
              notes: { type: Type.STRING },
              reminderMinutesBefore: { type: Type.NUMBER },
              cost: { type: Type.NUMBER },
            },
            required: ['title', 'category', 'dateTime', 'location', 'notes', 'reminderMinutesBefore', 'cost'],
          },
        },
      },
    });

    const items = JSON.parse((response.text ?? '[]').trim()) as Array<Record<string, unknown>>;
    res.json({ items: Array.isArray(items) ? items.slice(0, 6) : [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate itinerary plan.';
    console.error('Gemini /api/travel/itinerary-suggest error:', message);
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MAVI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
