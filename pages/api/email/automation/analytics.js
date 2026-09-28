import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Per-step breakdown of automation performance: for every step in the
// current sequence, how many sends went out on that step, and of those
// how many were delivered / opened / clicked / failed. Purely a read of
// email_sends (source='automation'), grouped by automation_step — every
// number here is already being logged by automation/run.js and stamped
// by webhook-infobip.js, nothing new to track.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data: sequence, error: seqErr } = await sb
      .from('email_automation_sequence')
      .select('step_number, delay_days, email_drafts(subject)')
      .order('step_number', { ascending: true });
    if (seqErr) throw seqErr;

    // Pull all automation sends. Paginate defensively in case a single
    // fetch would otherwise be capped by PostgREST's default row limit.
    let sends = [];
    let from = 0;
    const PAGE = 1000;
    for (;;) {
      const { data, error } = await sb
        .from('email_sends')
        .select('automation_step, status, delivered_at, opened_at, clicked_at')
        .eq('source', 'automation')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      sends = sends.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    const byStep = new Map();
    for (const s of sends) {
      const step = s.automation_step;
      if (!step) continue;
      if (!byStep.has(step)) byStep.set(step, { sent: 0, failed: 0, delivered: 0, opened: 0, clicked: 0 });
      const bucket = byStep.get(step);
      if (s.status === 'failed') bucket.failed++;
      else bucket.sent++;
      if (s.delivered_at) bucket.delivered++;
      if (s.opened_at) bucket.opened++;
      if (s.clicked_at) bucket.clicked++;
    }

    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    const steps = (sequence || []).map(seq => {
      const b = byStep.get(seq.step_number) || { sent: 0, failed: 0, delivered: 0, opened: 0, clicked: 0 };
      byStep.delete(seq.step_number);
      return {
        step_number: seq.step_number,
        subject: seq.email_drafts?.subject || `Step ${seq.step_number}`,
        delay_days: seq.delay_days,
        sent: b.sent,
        failed: b.failed,
        delivered: b.delivered,
        opened: b.opened,
        clicked: b.clicked,
        delivered_rate: pct(b.delivered, b.sent),
        open_rate: pct(b.opened, b.sent),
        click_rate: pct(b.clicked, b.sent),
      };
    });

    // Any step numbers left in byStep belonged to sends from a sequence
    // step that's since been edited/removed — still show them so the
    // numbers aren't silently dropped.
    for (const [stepNum, b] of byStep.entries()) {
      steps.push({
        step_number: stepNum,
        subject: `Step ${stepNum} (no longer in sequence)`,
        delay_days: null,
        sent: b.sent,
        failed: b.failed,
        delivered: b.delivered,
        opened: b.opened,
        clicked: b.clicked,
        delivered_rate: pct(b.delivered, b.sent),
        open_rate: pct(b.opened, b.sent),
        click_rate: pct(b.clicked, b.sent),
      });
    }
    steps.sort((a, b) => a.step_number - b.step_number);

    const totals = steps.reduce((acc, s) => ({
      sent: acc.sent + s.sent,
      failed: acc.failed + s.failed,
      delivered: acc.delivered + s.delivered,
      opened: acc.opened + s.opened,
      clicked: acc.clicked + s.clicked,
    }), { sent: 0, failed: 0, delivered: 0, opened: 0, clicked: 0 });

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
