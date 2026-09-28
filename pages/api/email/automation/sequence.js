import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// GET  -> ordered list of steps, drafts joined in
// POST -> replace the whole sequence: { steps: [{ draft_id, delay_days }, ...] }
//         (order in the array = step order). Replacing is atomic: delete + insert.
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await sb.from('email_automation_sequence')
        .select('*, email_drafts(id,subject,from_name)')
        .order('step_number', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ steps: data });
    }

    if (req.method === 'POST') {
      const { steps } = req.body;
      if (!Array.isArray(steps) || !steps.length) return res.status(400).json({ error: 'steps[] required' });
      for (const s of steps) {
        if (!s.draft_id) return res.status(400).json({ error: 'every step needs a draft_id' });
      }

      const { error: delErr } = await sb.from('email_automation_sequence').delete().neq('step_number', -1);
      if (delErr) throw delErr;

      const rows = steps.map((s, i) => ({
        step_number: i + 1,
        draft_id: s.draft_id,
        delay_days: Math.max(1, Number(s.delay_days) || 1),
      }));
      const { error: insErr } = await sb.from('email_automation_sequence').insert(rows);
      if (insErr) throw insErr;

      return res.status(200).json({ success: true, steps: rows.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
