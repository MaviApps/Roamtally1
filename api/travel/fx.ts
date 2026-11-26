interface VercelReq {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBase = Array.isArray(req.query?.base) ? req.query?.base[0] : req.query?.base;
  const base = String(rawBase || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'USD';

  try {
    const fxRes = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!fxRes.ok) {
      throw new Error(`FX upstream responded ${fxRes.status}`);
    }
    const data = (await fxRes.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result === 'success' && data.rates) {
      res.status(200).json({ base, rates: data.rates, source: 'live' });
      return;
    }
    throw new Error('Unexpected FX response shape');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FX lookup failed';
    res.status(502).json({ error: message });
  }
}
