import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Reads a whole table in pages of 1000 (Supabase's per-request cap). Callers
// pass a query with a stable order so no row is skipped or repeated.
async function readAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// GET    -> list pool (optionally ?status=active|completed|removed), plus counts.
//           Each row also carries last_email_state: the result of the most
//           recent automation email to that address (Failed / Clicked /
//           Opened / Delivered / Sent), read from email_sends.
// POST   -> add contacts: { emails: ['a@b.com', ...] } or { stage: 'MQL' } to pull
//           from email_contacts by lead_stage (stage 'all' pulls everyone with an email)
// DELETE -> ?email=x removes one; ?all=true clears the whole pool
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { status } = req.query;
      const data = await readAll(() => {
        let q = sb.from('email_automation_pool').select('*')
          .order('added_at', { ascending: true }).order('id', { ascending: true });
        if (status) q = q.eq('status', status);
        return q;
      });

      // Latest automation send per email.
      const sends = await readAll(() => sb.from('email_sends')
        .select('email,status,sent_at,delivered_at,opened_at,clicked_at')
        .eq('source', 'automation').order('id', { ascending: true }));
      const latest = new Map();
      for (const s of sends) {
        const key = String(s.email || '').toLowerCase();
        const prev = latest.get(key);
        if (!prev || String(s.sent_at || '') > String(prev.sent_at || '')) latest.set(key, s);
      }
      const stateOf = (s) => {
        if (!s) return null;
        if (s.status === 'failed') return 'Failed';
        if (s.clicked_at) return 'Clicked';
        if (s.opened_at) return 'Opened';
        if (s.delivered_at) return 'Delivered';
        return 'Sent';
      };

      const counts = { active: 0, completed: 0, removed: 0 };
      data.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
      const pool = data.map(r => ({ ...r, last_email_state: stateOf(latest.get(String(r.email || '').toLowerCase())) }));
      return res.status(200).json({ pool, counts, total: data.length });
    }

    if (req.method === 'POST') {
      const { emails, stage } = req.body;
      let rows = [];

      if (Array.isArray(emails) && emails.length) {
        rows = emails.filter(Boolean).map(e => ({ email: String(e).toLowerCase().trim() }));
      } else if (stage) {
        let query = sb.from('email_contacts').select('fullname,email,mobile').not('email', 'is', null).neq('email', '');
        if (stage !== 'all') query = query.eq('lead_stage', stage);
        const { data, error } = await query;
        if (error) throw error;
        rows = (data || []).map(c => ({ email: (c.email || '').toLowerCase().trim(), fullname: c.fullname || '', mobile: c.mobile || '' }));
      } else {
        return res.status(400).json({ error: 'emails[] or stage required' });
      }

      rows = rows.filter(r => r.email);
      if (!rows.length) return res.status(200).json({ success: true, added: 0 });

      // on_conflict(email) do nothing — re-adding someone already in the
      // pool (active, completed, or removed) shouldn't reset their progress.
      const { error } = await sb.from('email_automation_pool')
        .upsert(rows, { onConflict: 'email', ignoreDuplicates: true });
      if (error) throw error;

      return res.status(200).json({ success: true, added: rows.length });
    }

    if (req.method === 'DELETE') {
      const { email, all } = req.query;
      if (all === 'true') {
        const { error } = await sb.from('email_automation_pool').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return res.status(200).json({ success: true, cleared: true });
      }
      if (!email) return res.status(400).json({ error: 'email or all=true required' });
      const { error } = await sb.from('email_automation_pool')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('email', String(email).toLowerCase());
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
