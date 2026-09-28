// lib/warmup.js
//
// Domain warmup: how many emails we're allowed to send today. Linear ramp
// — starts at `daily_start` on day 1 of `start_date` and adds
// `daily_increment` per elapsed day, capped at `daily_max`. Used as the
// single enforcement point in pages/api/email/send.js so both the
// campaign blaster and the automation engine share the same daily budget.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://oagsgovnxgiszofgytre.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI'
);

export async function getWarmupConfig() {
  const { data, error } = await sb.from('email_warmup_config').select('*').eq('id', 'default').single();
  if (error || !data) {
    // No config row yet — fail open with a conservative default rather
    // than blocking all sending.
    return { id: 'default', start_date: new Date().toISOString().slice(0, 10), daily_start: 20, daily_increment: 10, daily_max: 300, active: true };
  }
  return data;
}

export async function saveWarmupConfig(patch) {
  const { data, error } = await sb.from('email_warmup_config')
    .upsert({ id: 'default', ...patch, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

// Today's limit under the ramp. If warmup is turned off, treat it as
// "already fully ramped" (i.e. daily_max, no growing cap).
export function computeLimitForDate(config, dateISO) {
  if (!config.active) return config.daily_max;
  const start = new Date(config.start_date + 'T00:00:00Z');
  const today = new Date(dateISO + 'T00:00:00Z');
  const daysSinceStart = Math.max(0, Math.floor((today - start) / 86400000));
  const raw = config.daily_start + config.daily_increment * daysSinceStart;
  return Math.max(0, Math.min(raw, config.daily_max));
}

function todayISO() {
  // IST day boundary, so "today" matches what the person sees.
  const ist = new Date(Date.now() + 330 * 60000);
  return ist.toISOString().slice(0, 10);
}

// How many emails (any source) have actually gone out today.
export async function getSentTodayCount() {
  const today = todayISO();
  const { count, error } = await sb.from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${today}T23:59:59.999Z`);
  if (error) throw error;
  return count || 0;
}

// Single call giving everything the UI / send path needs: today's limit,
// how many have gone out, and how many are left in the budget.
export async function getTodayWarmupStatus() {
  const [config, sent] = await Promise.all([getWarmupConfig(), getSentTodayCount()]);
  const limit = computeLimitForDate(config, todayISO());
  const remaining = Math.max(0, limit - sent);
  return { config, date: todayISO(), limit, sent, remaining };
}
