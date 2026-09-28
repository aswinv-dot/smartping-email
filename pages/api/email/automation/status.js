import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// One-shot GET for the automation page: engine state, sequence, pool
// counts, all in one call.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const [{ data: state }, { data: sequence }, { data: pool }, { count: sentTodayAuto }] = await Promise.all([
      sb.from('email_automation_state').select('*').eq('id', 'default').single(),
      sb.from('email_automation_sequence').select('*, email_drafts(id,subject,from_name)').order('step_number', { ascending: true }),
      sb.from('email_automation_pool').select('id,status,current_step'),
      sb.from('email_sends').select('id', { count: 'exact', head: true }).eq('source', 'automation').eq('status', 'sent')
        .gte('created_at', `${new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)}T00:00:00Z`),
    ]);

    const counts = { active: 0, completed: 0, removed: 0 };
    const byStep = {};
    (pool || []).forEach(r => {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r.status === 'active') byStep[r.current_step] = (byStep[r.current_step] || 0) + 1;
    });

    return res.status(200).json({
      state: state || { status: 'stopped' },
      sequence: sequence || [],
      pool_counts: counts,
      pool_by_step: byStep,
      sent_today_by_automation: sentTodayAuto || 0,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
