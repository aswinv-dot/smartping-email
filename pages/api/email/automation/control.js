import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// POST { action: 'start' | 'pause' | 'stop' }
// start:  requires at least one sequence step and one active pool contact.
// pause:  engine stops sending but keeps everyone's step/progress as-is.
// stop:   same as pause, but also clears started_at (a later 'start' looks like a fresh run).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { action } = req.body;
    if (!['start', 'pause', 'stop'].includes(action)) {
      return res.status(400).json({ error: "action must be 'start', 'pause', or 'stop'" });
    }

    if (action === 'start') {
      const [{ count: stepCount }, { count: poolCount }] = await Promise.all([
        sb.from('email_automation_sequence').select('id', { count: 'exact', head: true }),
        sb.from('email_automation_pool').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);
      if (!stepCount) return res.status(400).json({ error: 'Add at least one step to the sequence before starting' });
      if (!poolCount) return res.status(400).json({ error: 'Add contacts to the pool before starting' });
    }

    const patch = { status: action === 'start' ? 'running' : action === 'pause' ? 'paused' : 'stopped', updated_at: new Date().toISOString() };
    if (action === 'start') patch.started_at = new Date().toISOString();
    if (action === 'stop') patch.started_at = null;

    const { data, error } = await sb.from('email_automation_state')
      .upsert({ id: 'default', ...patch }).select().single();
    if (error) throw error;

    return res.status(200).json({ success: true, state: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
