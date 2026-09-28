import { getTodayWarmupStatus, saveWarmupConfig } from '../../../lib/warmup';

// GET  -> current warmup config + today's limit/sent/remaining
// POST -> save config { start_date, daily_start, daily_increment, daily_max, active }
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const status = await getTodayWarmupStatus();
      return res.status(200).json(status);
    }
    if (req.method === 'POST') {
      const { start_date, daily_start, daily_increment, daily_max, active } = req.body;
      if (daily_start == null || daily_increment == null || daily_max == null || !start_date) {
        return res.status(400).json({ error: 'start_date, daily_start, daily_increment, daily_max required' });
      }
      const config = await saveWarmupConfig({
        start_date,
        daily_start: Number(daily_start),
        daily_increment: Number(daily_increment),
        daily_max: Number(daily_max),
        active: active !== false,
      });
      return res.status(200).json({ success: true, config });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
