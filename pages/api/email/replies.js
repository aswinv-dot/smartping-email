import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// GET  ?unread=true  -> only unread
// PATCH { id, is_read } -> mark one reply read/unread
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let q = sb.from('email_replies').select('*').order('received_at', { ascending: false }).limit(500);
      if (req.query.unread === 'true') q = q.eq('is_read', false);
      const { data, error } = await q;
      if (error) throw error;
      const unreadCount = (data || []).filter(r => !r.is_read).length;
      return res.status(200).json({ success: true, replies: data || [], total: data?.length || 0, unread_count: unreadCount });
    }

    if (req.method === 'PATCH') {
      const { id, is_read } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await sb.from('email_replies').update({ is_read: !!is_read }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
