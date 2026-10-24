export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const serviceUrl = String(process.env.OCR_SERVICE_URL || "").replace(/\/$/, "");
  const token = process.env.OCR_SERVICE_TOKEN || "";
  if (!serviceUrl || !token) return res.status(503).json({ ok: false, error: "Open-source OCR service is not configured. Set OCR_SERVICE_URL and OCR_SERVICE_TOKEN in Vercel." });
  try {
    const upstream = await fetch(`${serviceUrl}/extract`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(req.body) });
    const body = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(body);
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Could not reach the PaddleOCR service. Check its URL and whether the free Space has finished waking up." });
  }
}
