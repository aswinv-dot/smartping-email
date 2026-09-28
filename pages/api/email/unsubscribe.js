import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://oagsgovnxgiszofgytre.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI');

const LOGO = 'https://terratern.com/images/logo.svg';

function page({ title, heading, body, actions = '' }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${title}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f4fb;margin:0;padding:20px}
    .box{background:#fff;border:1.5px solid #dde6f5;border-radius:12px;padding:40px;text-align:center;max-width:440px;width:100%}
    .logo{height:32px;margin-bottom:20px}
    h2{color:#00215C;margin:0 0 8px}
    p{color:#5a7ab5;font-size:14px;line-height:1.6;margin:0 0 20px}
    .actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    a.btn{display:inline-block;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700}
    .btn-primary{background:#255CC1;color:#fff}
    .btn-secondary{background:#f0f4fb;color:#00215C;border:1.5px solid #dde6f5}
  </style></head>
  <body><div class="box">
    <img class="logo" src="${LOGO}" alt="TerraTern"/>
    <h2>${heading}</h2>
    <p>${body}</p>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div></body></html>`;
}

export default async function handler(req, res) {
  const { email, confirm, action } = req.query;
  res.setHeader('Content-Type', 'text/html');

  if (!email) {
    return res.end(page({
      title: 'Unsubscribe',
      heading: 'Missing email',
      body: 'No email address was provided in this link.',
    }));
  }

  const encEmail = encodeURIComponent(email);

  if (action === 'resubscribe') {
    try {
      await sb.from('email_unsubscribes').delete().eq('email', email);
    } catch (e) {
      console.error('resubscribe delete failed:', e.message);
    }
    try {
      await sb.rpc('mark_email_resubscribed', { p_email: email });
    } catch (e) {
      console.error('mark_email_resubscribed rpc failed:', e.message);
    }
    return res.end(page({
      title: 'Resubscribed',
      heading: '✅ Resubscribed',
      body: "You're back on the list — you'll receive TerraTern updates about working abroad again.",
    }));
  }

  if (confirm === 'no') {
    return res.end(page({
      title: 'Still subscribed',
      heading: "You're still subscribed",
      body: 'No changes were made. You will keep receiving TerraTern emails.',
    }));
  }

  if (confirm === 'yes') {
    try {
      await sb.from('email_unsubscribes').upsert([{ email, unsubscribed_at: new Date().toISOString() }]);
    } catch (e) {
      console.error('unsubscribe upsert failed:', e.message);
    }
    try {
      await sb.rpc('mark_email_unsubscribed', { p_email: email });
    } catch (e) {
      console.error('mark_email_unsubscribed rpc failed:', e.message);
    }
    return res.end(page({
      title: 'Unsubscribed',
      heading: '✅ Unsubscribed',
      body: "You've been successfully unsubscribed from TerraTern emails. You won't receive any further emails from us.",
      actions: `<a class="btn btn-primary" href="/api/email/unsubscribe?email=${encEmail}&action=resubscribe">Resubscribe</a>`,
    }));
  }

  return res.end(page({
    title: 'Unsubscribe?',
    heading: 'Unsubscribe from TerraTern emails?',
    body: "If you don't want to receive updates about working abroad, you can unsubscribe below.",
    actions: `
      <a class="btn btn-primary" href="/api/email/unsubscribe?email=${encEmail}&confirm=yes">Yes, unsubscribe</a>
      <a class="btn btn-secondary" href="/api/email/unsubscribe?email=${encEmail}&confirm=no">No, keep me subscribed</a>
    `,
  }));
}
