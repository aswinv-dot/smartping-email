import { getConfig, saveConfig } from "../../../lib/linktree-store";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const config = await getConfig();
    return res.status(200).json(config);
  }

  if (req.method === "PUT") {
    try {
      await saveConfig(req.body);
      return res.status(200).json({ saved: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Save failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
