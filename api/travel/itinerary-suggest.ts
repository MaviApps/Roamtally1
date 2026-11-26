import { GoogleGenAI, Type } from '@google/genai';

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
      currency?: unknown;
      budget?: unknown;
    };

    const origin = typeof body.origin === 'string' ? body.origin.trim().slice(0, 100) : 'Home';
    const destination = typeof body.destination === 'string' ? body.destination.trim().slice(0, 100) : '';
    const startDate = typeof body.startDate === 'string' ? body.startDate.trim().slice(0, 32) : 'Day 1';
    const endDate = typeof body.endDate === 'string' ? body.endDate.trim().slice(0, 32) : 'Day 4';
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase().slice(0, 8) : 'USD';
    const budget = Math.max(0, Math.min(10000000, Number(body.budget) || 1500));

    if (!destination) {
      res.status(400).json({ error: 'Destination is required.' });
      return;
    }

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate 4 practical itinerary items for a trip from ${origin} to ${destination} (${startDate} to ${endDate}) with total budget ${budget} ${currency}. Include 1 outbound flight or train, 1 lodging stay, 1 signature tourist activity, and 1 dining meal.`,
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
    res.status(200).json({ items: Array.isArray(items) ? items.slice(0, 6) : [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate itinerary plan.';
    res.status(500).json({ error: message });
  }
}
