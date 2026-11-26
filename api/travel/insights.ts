import { GoogleGenAI } from '@google/genai';

interface VercelReq {
  method?: string;
  body?: Record<string, unknown>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({ apiKey });
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

async function fetchLiveOpenMeteoWeather(destination: string): Promise<string | null> {
  try {
    const cleanPlace = destination.split(',')[0].trim().slice(0, 80);
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanPlace)}&count=1&language=en&format=json`
    );
    if (!geoRes.ok) return null;
    const geoData = (await geoRes.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string }>;
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

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = (req.body || {}) as {
      origin?: unknown;
      destination?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      travelers?: unknown;
    };

    const origin = typeof body.origin === 'string' ? body.origin.trim().slice(0, 100) : '';
    const destination = typeof body.destination === 'string' ? body.destination.trim().slice(0, 100) : '';
    const startDate = typeof body.startDate === 'string' ? body.startDate.trim().slice(0, 32) : 'upcoming';
    const endDate = typeof body.endDate === 'string' ? body.endDate.trim().slice(0, 32) : 'upcoming';
    const travelers = Math.max(1, Math.min(20, Number(body.travelers) || 1));

    if (!destination || !origin) {
      res.status(400).json({ error: 'Origin and destination are required.' });
      return;
    }

    const ai = getGeminiClient();
    const liveWeatherPromise = fetchLiveOpenMeteoWeather(destination);

    const prompt = `You are RoamTally (powered by MaVi), a practical travel planning assistant.
Research current travel conditions for a trip from "${origin}" to "${destination}" (${startDate} to ${endDate}) for ${travelers} travelers.

Use Google Search to check realistic seasonal/current weather, typical flight or rail route considerations between ${origin} and ${destination}, top local tourist spots, and entry/document/insurance requirements.

Respond ONLY with a single valid JSON object matching this exact shape:
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
        model: 'gemini-2.5-flash',
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

    res.status(200).json({
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
    res.status(500).json({ error: message });
  }
}
