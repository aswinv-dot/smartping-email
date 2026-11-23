import { createClient } from '@supabase/supabase-js';
import { sendInfobipEmail } from '../../../lib/infobip';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

const FOOTER_ADDRESS = 'TerraTern · HQ-Bangalore (India), Ground Floor, HustleHub 1703, 17th Cross Road, HSR Layout Sector 4, Bangalore, Karnataka 560102';

// Plain-text twin of the HTML body, so the email goes out as multipart.
function htmlToText(html) {
  return String(html || '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
      const t = label.replace(/<[^>]+>/g, '').trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n----\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveTokens(html, contact) {
  return html
    .replace(/\{\{name\}\}/g, (contact.fullname || '').trim() || 'there')
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{mobile\}\}/g, contact.mobile || '');
}

// Same job as before: fetch draft + contacts, dedupe/skip, send, log,
// bump the per-contact scoreboard. Only the actual "send" call has
// changed — Infobip instead of SMTP/Nodemailer. Open/click tracking is
// no longer done via our own /api/email/track pixel+redirect; Infobip
// injects its own tracking pixel/link-rewriting (see lib/infobip.js) and
// reports back via /api/email/webhook-infobip, which is what actually
// stamps opened_at/clicked_at now.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { draft_id, stage, test_emails, batch } = req.body;
    if (!draft_id) return res.status(400).json({ error: 'draft_id required' });

    const { data: draft, error: dErr } = await sb.from('email_drafts').select('*').eq('id', draft_id).single();
    if (dErr || !draft) throw new Error('Draft not found');

    const isTest = !!(test_emails?.length);
    let contacts;
    if (isTest) {
      contacts = test_emails.map(email => ({ email, fullname: 'Test User', mobile: '9876543210' }));
    } else if (batch?.length) {
      contacts = batch;
    } else {
      let query = sb.from('email_contacts').select('fullname,email,mobile').not('email', 'is', null).neq('email', '');
      if (stage && stage !== 'all') query = query.eq('lead_stage', stage);
      const { data, error: cErr } = await query;
      if (cErr) throw cErr;
      contacts = data;
    }
    if (!contacts?.length) return res.status(200).json({ success: true, sent: 0, failed: 0, message: 'No contacts found' });

    const { data: unsubs } = await sb.from('email_unsubscribes').select('email');
    const unsubSet = new Set((unsubs || []).map(u => u.email.toLowerCase()));

    let sentSet = new Set();
    if (!isTest) {
      const emails = contacts.map(c => (c.email || '').toLowerCase()).filter(Boolean);
      const { data: prior } = await sb.from('email_sends')
        .select('email')
        .eq('draft_id', draft_id)
        .eq('status', 'sent')
        .in('email', emails);
      sentSet = new Set((prior || []).map(p => p.email.toLowerCase()));
    }

    const from = `${draft.from_name} <${process.env.INFOBIP_SENDER_EMAIL}>`;
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://terratern-email-infobip.vercel.app';
    const notifyUrl = `${baseUrl}/api/email/webhook-infobip`;

    let sent = 0, failed = 0, skipped = 0, already = 0;
    const logs = [];
    for (const c of contacts) {
      const em = (c.email || '').toLowerCase();
      if (unsubSet.has(em)) { skipped++; continue; }
      if (sentSet.has(em)) { already++; continue; }
      try {
        const unsubUrl = `${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(c.email)}`;
        const bodyHtml = resolveTokens(draft.body, c);
        const footerHtml = `<br/><hr/><p style="font-size:11px;color:#999;line-height:1.5">You're receiving this email because you opted in. <a href="${unsubUrl}">Unsubscribe</a><br/>${FOOTER_ADDRESS}</p>`;
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${String(draft.subject || '').replace(/</g, '&lt;')}</title></head><body>${bodyHtml}${footerHtml}</body></html>`;
        const text = `${htmlToText(bodyHtml)}\n\n----\nYou're receiving this email because you opted in. Unsubscribe: ${unsubUrl}\n${FOOTER_ADDRESS}`;

        const { messageId } = await sendInfobipEmail({
          from,
          to: c.email,
          subject: draft.subject,
          html,
          text,
          notifyUrl,
        });

        logs.push({ id: messageId, draft_id, email: c.email, status: 'sent', infobip_message_id: messageId });
        sent++;
      } catch (e) {
        logs.push({ id: `${draft_id}_${c.email}_err_${Date.now()}`, draft_id, email: c.email, status: 'failed', error: e.message });
        failed++;
      }
    }

    if (logs.length) await sb.from('email_sends').insert(logs);

    const sentEmails = logs.filter(l => l.status === 'sent').map(l => l.email);
    if (sentEmails.length) {
      await Promise.all(sentEmails.map(email =>
        sb.rpc('bump_email_contact_stats', { p_email: email, p_sent: 1 }).then(() => {}).catch(() => {})
      ));
    }

    return res.status(200).json({ success: true, sent, failed, skipped, already_sent: already, total: contacts.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
