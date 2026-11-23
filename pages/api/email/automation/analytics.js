import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Per-step breakdown of automation performance: for every step in the
// current sequence, how many emails went out on that step, and of those
// how many were delivered / opened / clicked / failed. Purely a read of
// email_sends (source='automation'), grouped by automation_step.
//
//  - sent      = every automation email handed to Infobip for that step
//  - delivered = rows with delivered_at (stamped by webhook-infobip.js)
//  - failed    = rows the webhook marked failed (REJECTED / UNDELIVERABLE)
//  - opened / clicked = rows with opened_at / clicked_at
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data: sequence, error: seqErr } = await sb
      .from('email_automation_sequence')
      .select('step_number, delay_days, email_drafts(subject)')
      .order('step_number', { ascending: true });
    if (seqErr) throw seqErr;

    // Paginate with a stable order so no row is skipped or repeated between pages.
    let sends = [];
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await sb
        .from('email_sends')
        .select('automation_step, status, delivered_at, opened_at, clicked_at')
        .eq('source', 'automation')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      sends = sends.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    const blank = () => ({ sent: 0, failed: 0, delivered: 0, opened: 0, clicked: 0 });
    const byStep = new Map();
    for (const s of sends) {
      const step = s.automation_step;
      if (!step) continue;
      if (!byStep.has(step)) byStep.set(step, blank());
      const bucket = byStep.get(step);
      bucket.sent++;
      if (s.status === 'failed') bucket.failed++;
      if (s.delivered_at) bucket.delivered++;
      if (s.opened_at) bucket.opened++;
      if (s.clicked_at) bucket.clicked++;
    }

    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    const shape = (step_number, subject, delay_days, b) => ({
      step_number, subject, delay_days,
      sent: b.sent, failed: b.failed, delivered: b.delivered, opened: b.opened, clicked: b.clicked,
      delivered_rate: pct(b.delivered, b.sent),
      open_rate: pct(b.opened, b.sent),
      click_rate: pct(b.clicked, b.sent),
    });

    const steps = (sequence || []).map(seq => {
      const b = byStep.get(seq.step_number) || blank();
      byStep.delete(seq.step_number);
      return shape(seq.step_number, seq.email_drafts?.subject || `Step ${seq.step_number}`, seq.delay_days, b);
    });

    // Step numbers left over belonged to a sequence step that's since been
    // edited/removed — still show them so the numbers aren't silently dropped.
    for (const [stepNum, b] of byStep.entries()) {
      steps.push(shape(stepNum, `Step ${stepNum} (no longer in sequence)`, null, b));
    }
    steps.sort((a, b) => a.step_number - b.step_number);

    const totals = steps.reduce((acc, s) => ({
      sent: acc.sent + s.sent,
      failed: acc.failed + s.failed,
      delivered: acc.delivered + s.delivered,
      opened: acc.opened + s.opened,
      clicked: acc.clicked + s.clicked,
    }), blank());

    return res.status(200).json({
      success: true,
      steps,
      totals: {
        ...totals,
        delivered_rate: pct(totals.delivered, totals.sent),
        open_rate: pct(totals.opened, totals.sent),
        click_rate: pct(totals.clicked, totals.sent),
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
