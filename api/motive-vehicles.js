// Vercel Serverless Function — Motive API proxy
// File location in your repo: api/motive-vehicles.js

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const apiKey = process.env.MOTIVE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "MOTIVE_API_KEY not set in Vercel." });
  }

  // DEBUG: confirm what key Vercel is actually using
  const keyPreview = `${apiKey.slice(0, 6)}...${apiKey.slice(-4)} (length: ${apiKey.length})`;

  const attempts = [
    { label: "query_param",  url: `https://api.gomotive.com/v1/vehicles?per_page=100&status=active&api_key=${apiKey}`, headers: {} },
    { label: "token_format", url: "https://api.gomotive.com/v1/vehicles?per_page=100&status=active", headers: { Authorization: `Token token=${apiKey}` } },
    { label: "bearer",       url: "https://api.gomotive.com/v1/vehicles?per_page=100&status=active", headers: { Authorization: `Bearer ${apiKey}` } },
  ];

  const results = [];

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, { headers: attempt.headers });
    const text = await response.text();
    results.push({ method: attempt.label, status: response.status, body: text.slice(0, 200) });
    if (response.ok) {
      const data = JSON.parse(text);
      const vehicles = (data.vehicles || []).map((v) => ({
        id:     v.vehicle?.id,
        number: v.vehicle?.number || String(v.vehicle?.id),
        make:   v.vehicle?.make,
        model:  v.vehicle?.model,
        year:   v.vehicle?.year,
      }));
      return res.status(200).json({ vehicles, auth_method: attempt.label });
    }
  }

  return res.status(401).json({ error: "All auth methods failed", key_preview: keyPreview, results });
}
