const fetch      = require('node-fetch');
const cron       = require('node-cron');
const http       = require('http');
// ── CONFIG ────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL || "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY      = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";
const PORT               = process.env.PORT || 3001;

// ── EMAIL ─────────────────────────────────────────────────────
// Actual sending happens on Vercel (Infobip) via /api/email/send below;
// this worker only drives batching/pacing/pause-stop. Must point at the
// live smartping-email deployment, not a stale/old project.
const EMAIL_BASE_URL = process.env.EMAIL_BASE_URL || 'https://smartping-email.vercel.app';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ── SUPABASE (generic REST helpers, used by the email campaign queue) ──
const sbHeaders = { 'Content-Type':'application/json', 'apikey':SUPABASE_KEY, 'Authorization':`Bearer ${SUPABASE_KEY}` };

async function sbGet(path, params='') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  for (let i=0; i<3; i++) {
    try {
      const res = await fetch(url, { headers: sbHeaders });
      const text = await res.text();
      return text ? JSON.parse(text) : [];
    } catch(e) {
      if (i===2) throw e;
      const wait = 1000*(i+1);
      log(`sbGet retry ${i+1}/2 for ${path} — ${e.message} — waiting ${wait}ms`);
      await new Promise(r=>setTimeout(r, wait));
    }
  }
}

async function sbPatch(path, data, params='') {
  const url = `${SUPABASE_URL}/rest/v1/${path}${params}`;
  for (let i=0; i<3; i++) {
    try {
      const res = await fetch(url, {
        method:'PATCH', headers:{...sbHeaders,'Prefer':'return=minimal'}, body:JSON.stringify(data)
      });
      return res.ok;
    } catch(e) {
      if (i===2) throw e;
      await new Promise(r=>setTimeout(r,1000*(i+1)));
    }
  }
}

// ── EMAIL CAMPAIGN QUEUE PROCESSOR ─────────────────────────────
// Picks up campaigns queued by /api/email/campaign-queue and sends them
// directly from here (Railway) in batches of `batch_size` (default 10) on
// each tick, so a single click on Send is not bound by any serverless
// timeout and doesn't depend on a round-trip to Vercel for the actual send.
let emailQueueBusy = false;

async function processEmailCampaigns() {
  if (emailQueueBusy) return; // avoid overlapping runs
  emailQueueBusy = true;
  try {
    const campaigns = await sbGet('email_campaigns', `?status=in.(queued,sending)&order=created_at.asc&limit=5`);
    if (!campaigns || !campaigns.length) return;

    log(`Email poller: ${campaigns.length} active campaign(s) found — ${campaigns.map(c => `${c.id.slice(0,8)}(${c.cursor}/${c.total})`).join(', ')}`);
    for (const c of campaigns) {
      try {
        await processOneEmailCampaignBatch(c);
      } catch (e) {
        log(`Email campaign ${c.id} batch error: ${e.message}`);
        // Don't leave the campaign stuck silently — surface the error on the row
        // so it's visible in Supabase too, and so a hung/failed batch doesn't
        // just sit at cursor 0 forever with no trace.
        await sbPatch('email_campaigns', { error: e.message }, `?id=eq.${c.id}`).catch(()=>{});
      }
    }
  } catch (e) {
    log(`processEmailCampaigns error: ${e.message}`);
  } finally {
    emailQueueBusy = false;
  }
}

// CONFIRMED via live test on 2026-09-23: every single send attempted
// directly from Railway failed with "Connection timeout" — Railway's
// network genuinely cannot reach node21.urmailtechno.com. Back to routing
// the actual SMTP send through Vercel's /api/email/send (which CAN reach
// it — that's how Test sends have always worked); Railway's job here is
// just to drive batching/pacing/pause-stop, not to hold the SMTP
// connection itself.
async function processOneEmailCampaignBatch(campaign) {
  const { id, draft_id, contacts, cursor, batch_size } = campaign;
  const total = contacts.length;
  if (cursor >= total) {
    await sbPatch('email_campaigns', { status: 'done', updated_at: new Date().toISOString() }, `?id=eq.${id}`);
    log(`Email campaign ${id} done — sent=${campaign.sent} failed=${campaign.failed}`);
    return;
  }

  if (campaign.status === 'queued') {
    await sbPatch('email_campaigns', { status: 'sending' }, `?id=eq.${id}`);
  }

  const batch = contacts.slice(cursor, cursor + (batch_size || 50));

  let result;
  try {
    const resp = await fetch(`${EMAIL_BASE_URL}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id, batch }),
    });
    result = await resp.json();
    if (!resp.ok || result.error) throw new Error(result.error || `HTTP ${resp.status}`);
  } catch (e) {
    await sbPatch('email_campaigns', { error: `batch send failed: ${e.message}` }, `?id=eq.${id}`).catch(()=>{});
    throw e; // let the outer catch in processEmailCampaigns log it too
  }

  const { sent = 0, failed = 0, skipped = 0, already_sent: already = 0 } = result;
  const newCursor = cursor + batch.length;
  await sbPatch('email_campaigns', {
    cursor: newCursor,
    sent: (campaign.sent || 0) + sent,
    failed: (campaign.failed || 0) + failed,
    skipped: (campaign.skipped || 0) + skipped,
    already_sent: (campaign.already_sent || 0) + already,
    status: newCursor >= total ? 'done' : 'sending',
    updated_at: new Date().toISOString(),
  }, `?id=eq.${id}`);

  log(`Email campaign ${id}: batch ${cursor}-${newCursor}/${total} — sent=${sent} failed=${failed} skipped=${skipped} already=${already}`);
}

// Poll every 4s for queued/sending email campaigns.
setInterval(() => { processEmailCampaigns().catch(e => log(`Email poller error: ${e.message}`)); }, 4000);

// ── HTTP SERVER ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type','application/json');
  res.setHeader('Access-Control-Allow-Origin','*');
  if (req.method==='GET'&&req.url==='/health') {
    res.writeHead(200);
    res.end(JSON.stringify({status:'ok',service:'terratern-email-cron',time:new Date().toISOString()}));
    return;
  }
  res.writeHead(404);
  res.end(JSON.stringify({error:'Not found'}));
});
server.listen(PORT, () => log(`HTTP server listening on port ${PORT}`));

// ── SCHEDULE ──────────────────────────────────────────────────
log('TerraTern Email Cron Service started');

// ── EMAIL AUTOMATION ENGINE (continuous drip) ───────────────────
// Two separate daily moments — all the actual logic lives in
// /api/email/automation/run on Vercel; this is just the alarm clock:
//  - 8:00 PM IST (14:30 UTC): sync the pool from Metabase
//    (webinar_attended='Yes'). No sending happens here.
//  - 9:00 PM IST (15:30 UTC): send to whoever's due their next sequence
//    step.
async function runEmailAutomationPhase(phase) {
  log(`Email automation: firing ${phase} tick...`);
  try {
    const res = await fetch(`${EMAIL_BASE_URL}/api/email/automation/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase }),
    });
    const data = await res.json();
    log(`Email automation ${phase} tick: ${JSON.stringify(data)}`);
  } catch (e) {
    log(`Email automation ${phase} tick failed: ${e.message}`);
  }
}
cron.schedule('30 14 * * *', () => runEmailAutomationPhase('sync'), { timezone: 'UTC' });
cron.schedule('30 15 * * *', () => runEmailAutomationPhase('send'), { timezone: 'UTC' });

log('Service running — email campaign queue polling every 4s, automation ticks at 8:00PM/9:00PM IST');
