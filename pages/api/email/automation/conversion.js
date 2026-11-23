import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

// Metabase card 2: first payment per lead (status 3, amount <> 0, installment 1)
const PAYMENTS_URL = 'https://metabase.terratern.com/api/public/card/b139af14-a821-472d-8e20-32397def7818/query/json';
const IST_MS = 330 * 60000;

const dayNum = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
};
const istDay = (iso) => (iso ? dayNum(new Date(new Date(iso).getTime() + IST_MS).toISOString()) : null);
const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
const median = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : Math.round(((b[m - 1] + b[m]) / 2) * 10) / 10;
};

async function readPool() {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from('email_automation_pool')
      .select('id,email,fullname,lead_id,status,added_at,initial_status,initial_stage')
      .order('id', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// Read-only: joins the pool to card 2 by lead_id. Nothing is written.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const [pool, pr] = await Promise.all([
      readPool(),
      fetch(PAYMENTS_URL, { headers: { 'Accept-Encoding': 'identity' } }),
    ]);
    if (!pr.ok) throw new Error(`Payments card HTTP ${pr.status}`);
    const payRows = await pr.json();
    const pay = new Map();
    for (const r of payRows || []) if (r.lead_id != null) pay.set(String(r.lead_id), r);

    const counts = { original: pool.length, removed: 0, completed: 0, active_not_converted: 0, converted: 0, paid_before_entry: 0, no_lead_id: 0 };
    const tat = [], toPay = [], byStatus = new Map();
    let revenue = 0;
    const converted = [];

    for (const p of pool) {
      if (p.status === 'removed') counts.removed++;
      if (!p.lead_id) counts.no_lead_id++;
      const st = p.initial_status || '(unknown)';
      if (!byStatus.has(st)) byStatus.set(st, { status: st, total: 0, converted: 0 });
      byStatus.get(st).total++;

      const pm = p.lead_id ? pay.get(String(p.lead_id)) : null;
      let isConv = false;
      if (pm) {
        const added = istDay(p.added_at), paid = dayNum(pm.first_payment_date);
        if (paid != null && added != null && paid >= added) {
          isConv = true;
          counts.converted++;
          byStatus.get(st).converted++;
          const created = dayNum(pm.lead_created_date);
          const t = created != null ? paid - created : null;
          if (t != null && t >= 0) tat.push(t);
          toPay.push(paid - added);
          revenue += Number(pm.first_payment_amount) || 0;
          converted.push({ email: p.email, fullname: p.fullname, initial_status: p.initial_status, lead_created_date: pm.lead_created_date, first_payment_date: pm.first_payment_date, days_to_pay: t });
        } else counts.paid_before_entry++;
      }
      if (!isConv) {
        if (p.status === 'completed') counts.completed++;
        else if (p.status === 'active') counts.active_not_converted++;
      }
    }

    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    return res.status(200).json({
      success: true,
      counts,
      conversion_rate: pct(counts.converted, counts.original),
      avg_tat_days: avg(tat), median_tat_days: median(tat),
      avg_days_entry_to_pay: avg(toPay),
      revenue_ex_gst: Math.round(revenue),
      by_initial_status: [...byStatus.values()].map(s => ({ ...s, rate: pct(s.converted, s.total) })).sort((a, b) => b.total - a.total),
      converted: converted.sort((a, b) => String(b.first_payment_date).localeCompare(String(a.first_payment_date))).slice(0, 200),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
