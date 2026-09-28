import { createClient } from '@supabase/supabase-js';
import { sendInfobipEmail } from '../../../../lib/infobip';
import { getTodayWarmupStatus } from '../../../../lib/warmup';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

function resolveTokens(html, contact) {
  return String(html || '')
    .replace(/\{\{name\}\}/g, contact.fullname || '')
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{mobile\}\}/g, contact.mobile || '');
}

// One tick of the automation engine. Called once a day by the Railway
// cron (see cron/index.js) and also by the "Run Now" button on the
// automation page for manual testing. Idempotent within a UTC day-ish —
// running it twice in the same day just finds nothing newly due the
// second time, since last_sent_at/current_step already moved on.
//
// For every active pool contact, works out whether they're due their
// next sequence step (never sent -> due for step 1 immediately; sent
// step N -> due for step N+1 once `delay_days` of step N has passed
// since last_sent_at). Due contacts are sorted oldest-waiting-first and
// sent up to whatever's left of today's warmup budget; anyone who
// doesn't fit stays due and is picked up on the next run once the
// budget resets.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data: state } = await sb.from('email_automation_state').select('*').eq('id', 'default').single();
    if (!state || state.status !== 'running') {
      return res.status(200).json({ success: true, skipped: true, reason: `engine is ${state?.status || 'not configured'}` });
    }

    const { data: sequence, error: seqErr } = await sb.from('email_automation_sequence')
      .select('*, email_drafts(id,subject,body,from_name)').order('step_number', { ascending: true });
    if (seqErr) throw seqErr;
    if (!sequence?.length) return res.status(200).json({ success: true, skipped: true, reason: 'no sequence configured' });

    const warmup = await getTodayWarmupStatus();
    if (warmup.remaining <= 0) {
      return res.status(200).json({ success: true, skipped: true, reason: 'daily warmup cap reached', warmup });
    }

    const { data: pool, error: poolErr } = await sb.from('email_automation_pool').select('*').eq('status', 'active');
    if (poolErr) throw poolErr;

    const { data: unsubs } = await sb.from('email_unsubscribes').select('email');
    const unsubSet = new Set((unsubs || []).map(u => u.email.toLowerCase()));

    const now = Date.now();
    const due = [];
    const toComplete = [];
    for (const contact of pool) {
      if (unsubSet.has(contact.email.toLowerCase())) { toComplete.push(contact.id); continue; }

      const nextStepNum = contact.current_step + 1;
      const step = sequence.find(s => s.step_number === nextStepNum);
      if (!step) { toComplete.push(contact.id); continue; } // sequence exhausted

      if (contact.current_step === 0) { due.push({ contact, step }); continue; } // never sent — due immediately

      const prevStep = sequence.find(s => s.step_number === contact.current_step);
      const delayMs = (prevStep?.delay_days || 1) * 86400000;
      const dueAt = new Date(contact.last_sent_at).getTime() + delayMs;
      if (now >= dueAt) due.push({ contact, step });
    }

    if (toComplete.length) {
      await sb.from('email_automation_pool').update({ status: 'completed', updated_at: new Date().toISOString() }).in('id', toComplete);
    }

    // Oldest-waiting-first so nobody gets starved by contacts that just joined.
    due.sort((a, b) => new Date(a.contact.last_sent_at || a.contact.added_at) - new Date(b.contact.last_sent_at || b.contact.added_at));

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://terratern-email-infobip.vercel.app';
    const notifyUrl = `${baseUrl}/api/email/webhook-infobip`;

    let sent = 0, failed = 0, remaining = warmup.remaining;
    const sendLogs = [];
    const poolUpdates = [];

    for (const { contact, step } of due) {
      if (remaining <= 0) break;
      const draft = step.email_drafts;
      if (!draft) { failed++; continue; }

      try {
        let html = resolveTokens(draft.body, contact);
        html += `<br/><hr/><p style="font-size:11px;color:#999">You're receiving this email because you opted in. <a href="${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(contact.email)}">Unsubscribe</a></p>`;
        const from = `${draft.from_name} <${process.env.INFOBIP_SENDER_EMAIL}>`;

        const { messageId } = await sendInfobipEmail({ from, to: contact.email, subject: draft.subject, html, notifyUrl });

        sendLogs.push({ id: messageId, draft_id: draft.id, email: contact.email, status: 'sent', infobip_message_id: messageId, source: 'automation', automation_step: step.step_number });
        poolUpdates.push({ id: contact.id, current_step: step.step_number, last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        sent++; remaining--;
      } catch (e) {
        sendLogs.push({ id: `auto_${contact.email}_err_${Date.now()}`, draft_id: draft.id, email: contact.email, status: 'failed', error: e.message, source: 'automation', automation_step: step.step_number });
        failed++;
      }
    }

    if (sendLogs.length) await sb.from('email_sends').insert(sendLogs);
    for (const u of poolUpdates) {
      const { id, ...patch } = u;
      await sb.from('email_automation_pool').update(patch).eq('id', id);
    }
    if (sendLogs.some(l => l.status === 'sent')) {
      await Promise.all(sendLogs.filter(l => l.status === 'sent').map(l =>
        sb.rpc('bump_email_contact_stats', { p_email: l.email, p_sent: 1 }).then(() => {}).catch(() => {})
      ));
    }

    await sb.from('email_automation_state').update({ last_run_at: new Date().toISOString() }).eq('id', 'default');

    return res.status(200).json({
      success: true, due: due.length, sent, failed, completed: toComplete.length,
      warmup_remaining_after: remaining, capped: remaining <= 0 && due.length > sent,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
