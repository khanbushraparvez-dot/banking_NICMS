export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const webhook = process.env.MIS_EXCEL_WEBHOOK_URL;
  if (!webhook) return res.status(503).json({ error: "MIS_EXCEL_WEBHOOK_URL is not configured" });
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row: req.body?.row || null })
    });
    const text = await response.text();
    if (!response.ok) return res.status(502).json({ error: `Excel connector returned ${response.status}`, detail: text.slice(0,500) });
    return res.status(200).json({ ok: true });
  } catch (error) { return res.status(500).json({ error: error.message || "Excel sync failed" }); }
}
