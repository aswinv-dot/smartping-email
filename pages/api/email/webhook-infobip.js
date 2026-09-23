import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Receives Infobip Email delivery reports (set as `notifyUrl` on each send
// in pages/api/email/send.js). Infobip POSTs a JSON body shaped like:
//   { results: [ { messageId, to, status: { groupName: 'DELIVERED'|'SEEN'|'CLICKED'|'REJECTED'|'UNDELIVERABLE', ... }, ... } ] }
// groupName values used here follow Infobip's standard delivery-report
// status groups; SEEN = opened, CLICKED = link click (only present when
// trackClicks/trackOpens were enabled on send — see lib/infobip.js).
//
// This replaces the old self-hosted tracking pixel/redirect
// (pages/api/email/track.js) as the source of opened_at/clicked_at.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const results = req.body?.results || [];
    for (const r of results) {
      const messageId = r.messageId;
      const group = r.status?.groupName;
      if (!messageId || !group) continue;

      if (group === 'DELIVERED') {
        const { data } = await sb.from('email_sends')
          .update({ delivered_at: new Date().toISOString() })
          .eq('infobip_message_id', messageId).is('delivered_at', null)
          .select('email');
        if (data?.length) {
          await sb.rpc('bump_email_contact_stats', { p_email: data[0].email, p_delivered: 1 }).catch(() => {});
        }
      } else if (group === 'SEEN') {
        const { data } = await sb.from('email_sends')
          .update({ opened_at: new Date().toISOString() })
          .eq('infobip_message_id', messageId).is('opened_at', null)
          .select('email');
        if (data?.length) {
          await sb.rpc('bump_email_contact_stats', { p_email: data[0].email, p_opened: 1 }).catch(() => {});
        }
      } else if (group === 'CLICKED') {
        const { data } = await sb.from('email_sends')
          .update({ clicked_at: new Date().toISOString() })
          .eq('infobip_message_id', messageId).is('clicked_at', null)
          .select('email');
        if (data?.length) {
          await sb.rpc('bump_email_contact_stats', { p_email: data[0].email, p_clicked: 1 }).catch(() => {});
        }
      } else if (group === 'REJECTED' || group === 'UNDELIVERABLE') {
        await sb.from('email_sends')
          .update({ status: 'failed', error: r.status?.description || group })
          .eq('infobip_message_id', messageId);
      }
    }
    return res.status(200).json({ success: true, processed: results.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
