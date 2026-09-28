import { createClient } from '@supabase/supabase-js';
import { sendInfobipEmail } from '../../../../lib/infobip';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Same public Metabase card contacts.js/contacts.html already sync from —
// per request, the pool is auto-populated from this directly rather than
// hand-picked. Filtered here to rows where webinar_attended = 'Yes'.
const METABASE_EMAIL_URL = 'https://metabase.terratern.com/api/public/card/d14792bd-69e5-4d64-b693-1f70153724d0/query/json';

function resolveTokens(html, contact) {
  return String(html || '')
    .replace(/\{\{name\}\}/g, contact.fullname || '')
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{mobile\}\}/g, contact.mobile || '');
}

// Hard ceiling per invocation, so a large pool can't try to push
// thousands of sends through one synchronous serverless call and hit its
// timeout. Purely a request-shape safety net. If more than this many are
// due, the rest stay due and are picked up on the next tick (next day,
// or a manual Run Now).
const MAX_PER_TICK = 300;

// Pulls today's webinar-attended leads straight from Metabase and adds
// any NEW ones (by email) to the pool. Existing pool rows — whatever
// their status (active mid-sequence, completed, removed) — are left
// untouched via on_conflict do-nothing, so someone who attended a
// webinar last week and already got step 1 never gets re-added/reset
// just because they still show up in today's query. This is what makes
// "yesterday 500 attended -> got email 1; today the query returns 900 ->
// only the 400 new ones get email 1" work automatically, every day,
// with no manual selection.
async function syncPoolFromMetabase() {
  const res = await fetch(METABASE_EMAIL_URL, { headers: { 'Accept-Encoding': 'identity' } });
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Metabase returned an unexpected response');

  const attended = rows.filter(r => String(r.webinar_attended || '').trim().toLowerCase() === 'yes');
  const candidates = attended
    .map(r => ({ email: String(r.email || '').toLowerCase().trim(), fullname: r.fullname || r.name || '', mobile: r.mobile || '' }))
    .filter(c => c.email);

  // Dedup within this batch (Metabase can repeat a lead across rows).
  const byEmail = new Map(candidates.map(c => [c.email, c]));
  const unique = [...byEmail.values()];

  let added = 0;
  if (unique.length) {
    const { data: existing } = await sb.from('email_automation_pool').select('email');
    const existingSet = new Set((existing || []).map(e => e.email.toLowerCase()));
    const toInsert = unique.filter(c => !existingSet.has(c.email));
    if (toInsert.length) {
      const { error } = await sb.from('email_automation_pool').upsert(toInsert, { onConflict: 'email', ignoreDuplicates: true });
      if (error) throw error;
      added = toInsert.length;
    }
  }

  return { matched: unique.length, added };
}

// Two separate daily moments, driven by `phase` in the POST body (see
// cron/index.js for the schedule):
//  - phase 'sync' — 1PM IST. Pulls Metabase, adds newly-matched contacts
//    to the pool. Always runs regardless of engine status, so the pool
//    count on the page stays live either way. Does NOT send anything.
//  - phase 'send' — 8PM IST (within the requested 5pm-6am sending
//    window). Only runs if the engine is 'running': works out who's due
//    their next sequence step (never sent -> due for step 1 immediately;
//    sent step N -> due for step N+1 once `delay_days` of step N has
//    passed since last_sent_at) and sends, up to MAX_PER_TICK.
//  - phase 'both' (default, e.g. the "Run Now" button) — runs sync then
//    send back to back, for manual testing.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const phase = req.body?.phase || 'both';
    let sync = null;

    if (phase === 'sync' || phase === 'both') {
      sync = await syncPoolFromMetabase();
      await sb.from('email_automation_state').update({
        last_sync_at: new Date().toISOString(), last_sync_matched: sync.matched, last_sync_added: sync.added,
      }).eq('id', 'default');
    }

    if (phase === 'sync') {
      return res.status(200).json({ success: true, phase, sync });
    }

    const { data: state } = await sb.from('email_automation_state').select('*').eq('id', 'default').single();
    if (!state || state.status !== 'running') {
      return res.status(200).json({ success: true, skipped: true, reason: `engine is ${state?.status || 'not configured'}`, phase, sync });
    }

    const { data: sequence, error: seqErr } = await sb.from('email_automation_sequence')
      .select('*, email_drafts(id,subject,body,from_name)').order('step_number', { ascending: true });
    if (seqErr) throw seqErr;
    if (!sequence?.length) return res.status(200).json({ success: true, skipped: true, reason: 'no sequence configured', phase, sync });

    const { data: pool, error: poolErr } = await sb.from('email_automation_pool').select('*').eq('status', 'active');
    if (poolErr) throw poolErr;

    const { data: unsubs } = await sb.from('email_unsubscribes').select('email');
    const unsubSet = new Set((unsubs || []).map(u => u.email.toLowerCase()));

    const now = Date.now();
    const due = [];
    const toComplete = [];
    const toRemove = []; // unsubscribed mid-sequence — distinct from finishing the sequence
    for (const contact of pool) {
      if (unsubSet.has(contact.email.toLowerCase())) { toRemove.push(contact.id); continue; }

      const nextStepNum = contact.current_step + 1;
      const step = sequence.find(s => s.step_number === nextStepNum);
      if (!step) { toComplete.push(contact.id); continue; } // sequence exhausted

      if (contact.current_step === 0) { due.push({ contact, step }); continue; } // never sent — due immediately

      const prevStep = sequence.find(s => s.step_number === contact.current_step);
      const delayMs = (prevStep?.delay_days || 1) * 86400000;
      const dueAt = new Date(contact.last_sent_at).getTime() + delayMs;
      if (now >= dueAt) due.push({ contact, step });
    }

    await Promise.all([
      toComplete.length ? sb.from('email_automation_pool').update({ status: 'completed', updated_at: new Date().toISOString() }).in('id', toComplete) : null,
      toRemove.length ? sb.from('email_automation_pool').update({ status: 'removed', updated_at: new Date().toISOString() }).in('id', toRemove) : null,
    ]);

    // Oldest-waiting-first so nobody gets starved by contacts that just joined.
    due.sort((a, b) => new Date(a.contact.last_sent_at || a.contact.added_at) - new Date(b.contact.last_sent_at || b.contact.added_at));

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://terratern-email-infobip.vercel.app';
    const notifyUrl = `${baseUrl}/api/email/webhook-infobip`;

    let sent = 0, failed = 0;
    let remaining = MAX_PER_TICK;
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
    await Promise.all(poolUpdates.map(u => {
      const { id, ...patch } = u;
      return sb.from('email_automation_pool').update(patch).eq('id', id);
    }));
    if (sendLogs.some(l => l.status === 'sent')) {
      await Promise.all(sendLogs.filter(l => l.status === 'sent').map(l =>
        sb.rpc('bump_email_contact_stats', { p_email: l.email, p_sent: 1 }).then(() => {}).catch(() => {})
      ));
    }

    await sb.from('email_automation_state').update({ last_run_at: new Date().toISOString() }).eq('id', 'default');

    return res.status(200).json({
      success: true, phase, sync, due: due.length, sent, failed, completed: toComplete.length, removed: toRemove.length,
      capped: remaining <= 0 && due.length > sent,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
