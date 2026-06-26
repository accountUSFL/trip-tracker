// Vercel Serverless Function — Motive API proxy
// File location in your repo: api/motive-vehicles.js
// Keeps MOTIVE_API_KEY secret on the server side

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
    res.status(500).json({ error: "MOTIVE_API_KEY not configured in Vercel environment variables." });
    return;
  }

  try {
    // Try new Motive URL first, fall back to legacy KeepTruckin URL
    const url = "https://api.gomotive.com/v1/vehicles?per_page=100&status=active";

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `Motive API error: ${response.status}`, detail: text });
      return;
    }

    const data = await response.json();

    // Return simplified vehicle list: id, number (display name), make, model, year
    const vehicles = (data.vehicles || []).map((v) => ({
      id:     v.vehicle?.id,
      number: v.vehicle?.number || v.vehicle?.id,
      make:   v.vehicle?.make,
      model:  v.vehicle?.model,
      year:   v.vehicle?.year,
    }));

    res.status(200).json({ vehicles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
