import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// ── Receives inbound email replies from Infobip ─────────────────────────
//
// This is a SEPARATE webhook from webhook-infobip.js (which only handles
// delivery/open/click reports on OUTGOING mail). This one fires when
// someone REPLIES to an email we sent — but only once you've configured
// inbound parsing in the Infobip portal:
//
//   1. Infobip portal → Channels and Numbers → Channels → Email →
//      Inbound Email → "Add inbound domain".
//   2. Enter the SAME domain your sends already go out from (whatever
//      INFOBIP_SENDER_EMAIL's domain is) — no need for a separate
//      subdomain, since a reply naturally goes back to the address it
//      came from.
//   3. Infobip gives you an MX record. Add it to that domain's DNS and
//      hit "Verify" once it propagates.
//   4. Choose "HTTP Push" as the inbound action and set the webhook URL
//      to:  https://<your-vercel-domain>/api/email/webhook-infobip-inbound
//
// Infobip's inbound parsing docs don't give one fixed, guaranteed payload
// shape across all accounts/setups, so this handler is deliberately
// defensive: it tries several common field-name variants (Infobip's own
// outbound delivery-report webhook wraps everything in a `results[]`
// array, so inbound is handled the same way here), and ALWAYS stores the
// full raw payload in `raw_payload` regardless of whether parsing finds
// what it's looking for. So even if a field name is slightly different
// than expected, nothing is lost — it just shows up as "(unparsed)" in
// the inbox until the parsing here is tightened against a real payload.
function pickFirst(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return null;
}

function extractOne(item) {
  const from = pickFirst(item.from, item.sender, item.fromAddress, item.from?.address, item.envelope?.from);
  const fromName = pickFirst(item.fromName, item.from?.name, item.senderName);
  const to = pickFirst(item.to, item.recipient, item.toAddress, item.envelope?.to);
  const subject = pickFirst(item.subject, item.Subject);
  const bodyText = pickFirst(item.text, item.plainText, item.bodyText, item.body?.text);
  const bodyHtml = pickFirst(item.html, item.htmlText, item.bodyHtml, item.body?.html);
  const inReplyTo = pickFirst(item.inReplyTo, item.in_reply_to, item.references, item.messageId);
  return {
    from_email: (typeof from === 'string' ? from : from?.address || '').toLowerCase().trim(),
    from_name: fromName || null,
    to_email: typeof to === 'string' ? to : to?.address || null,
    subject: subject || '(no subject)',
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    in_reply_to_message_id: inReplyTo || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    // Infobip's outbound delivery-report webhook wraps events in
    // `results[]`; inbound parsing is expected to follow the same
    // convention, but fall back to treating the whole body as a single
    // message if there's no `results` array.
    const items = Array.isArray(body.results) ? body.results : [body];

    const rows = [];
    for (const item of items) {
      const parsed = extractOne(item);
      if (!parsed.from_email && !parsed.subject) continue; // skip totally empty pings

      // Best-effort link back to the send this is a reply to: match by
      // the sender's email against our most recent email_sends row for
      // that address. Not perfect (doesn't use true message threading,
      // since we don't yet know Infobip's exact header for that), but
      // gives the inbox useful context ("this is a reply to Step 2").
      let matched_send_id = null, matched_draft_id = null, matched_automation_step = null;
      if (parsed.from_email) {
        const { data: lastSend } = await sb
          .from('email_sends')
          .select('id, draft_id, automation_step')
          .eq('email', parsed.from_email)
          .eq('status', 'sent')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastSend) {
          matched_send_id = lastSend.id;
          matched_draft_id = lastSend.draft_id;
          matched_automation_step = lastSend.automation_step;
        }
      }

      rows.push({
        ...parsed,
        matched_send_id,
        matched_draft_id,
        matched_automation_step,
        raw_payload: item,
      });
    }

    if (rows.length) await sb.from('email_replies').insert(rows);

    return res.status(200).json({ success: true, stored: rows.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
