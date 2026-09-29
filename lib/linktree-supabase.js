// Linktree content store — backed by the same Supabase project already
// used elsewhere in this CRM (lib/whatsapp-supabase.js, capi-dashboard.html).
// One row in `linktree_config` (id=1) holds the whole config as jsonb.
//
// Table needs creating once — run this in the Supabase SQL editor:
//
//   create table if not exists linktree_config (
//     id int primary key,
//     data jsonb not null,
//     updated_at timestamptz default now()
//   );
//   alter table linktree_config disable row level security;
//
// (RLS is disabled here to match how the other tables in this project —
// campaign_schedule, sent_log, etc. — are already reachable with just the
// anon key from these same admin pages.)

const SUPABASE_URL = "https://oagsgovnxgiszofgytre.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ3Nnb3ZueGdpc3pvZmd5dHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzA1MjgsImV4cCI6MjA5NjEwNjUyOH0.V3eNIE3PXAcMuS3Gv0tBb3kqjVRAI25tSj8ED5W7vmI";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

export const DEFAULT_CONFIG = {
  tagline: "One Stop Solution to Global Talent Mobility",

  stats: [
    { number: "2M+", label: "Trusted Users" },
    { number: "99.7%", label: "Visa Success Rate" },
  ],

  links: [
    {
      icon: "📅",
      title: "Book 1:1 Counselling",
      subtitle: "With our Certified Immigration Advisor",
      url: "https://terratern.com/webinar/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=Webinar_Page",
      badge: { text: "Limited Slots", style: "urgent" },
    },
    {
      icon: "🤖",
      title: "AI Eligibility Checker",
      subtitle: "Get the best options tailored for you",
      url: "https://terratern.com/ai-chat-eligibility-tool/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=AI_Eligibility",
    },
    {
      icon: "👨‍⚕️",
      title: "Nursing in Germany",
      subtitle: "100% Job Guaranteed for GNM/B.Sc Nursing graduates",
      url: "https://terratern.com/immigration-consultation-nursing-germany-1/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=GHC_Healthcare",
      badge: { text: "High in Demand", style: "normal" },
    },
    {
      icon: "🎓",
      title: "Ausbildung in Germany",
      subtitle: "100% Job Guaranteed for Diploma Holders and Engineers",
      url: "https://terratern.com/immigration-consultation-ausbildung-germany-1/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=Ausbildung/",
      badge: { text: "Best Seller", style: "normal" },
    },
    {
      icon: "🇩🇪",
      title: "Germany Opportunity Card",
      subtitle: "No offer letter required",
      url: "https://terratern.com/immigration-consultation-germany-1/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=GOC",
    },
    {
      icon: "🇦🇺",
      title: "Australia PR",
      subtitle: "No blocked account needed",
      url: "https://terratern.com/immigration-consultation-australia-1/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=AustPR",
    },
    {
      icon: "🇨🇦",
      title: "Canada PR",
      subtitle: "Easy pathway to the US",
      url: "https://terratern.com/immigration-consultation-canada-1/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=CanadaPR",
    },
    {
      icon: "📚",
      title: "Learn IELTS / German",
      subtitle: "India's Top Certified Language Trainers · 6000+ candidates cleared exams · 15k+ mock tests · 92% success rate",
      url: "https://terratern-learn-links.vercel.app/",
    },
    {
      icon: "⭐",
      title: "Success Stories",
      subtitle: "See professionals who received their visa faster",
      url: "https://terratern.com/success-stories/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=SuccessStories",
    },
    {
      icon: "💬",
      title: "Testimonials",
      subtitle: "Hear from our satisfied clients",
      url: "https://terratern.com/customer-reviews/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=Testimonials",
    },
    {
      icon: "💰",
      title: "Salaries Abroad",
      subtitle: "Compare international salary packages",
      url: "https://terratern.com/salaries/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=SalariesPage",
    },
  ],

  footer: {
    phone: "📞 8062358632",
    address: "📍 19th Main Rd, 1st Sector, HSR Layout, Bengaluru 560102",
    mapUrl: "https://maps.app.goo.gl/QRhtoT3noPWvvZCB7?g_st=ipc",
    privacyUrl: "https://terratern.com/privacy-policy/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=PrivacyPolicy",
    termsUrl: "https://terratern.com/terms-and-condition/?utm_source=Social_Media&utm_medium=Link_in_bio&utm_adset=TNC",
    copyright: "© 2026 TerraTern. All rights reserved.",
  },
};

export async function getConfig() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/linktree_config?id=eq.1&select=data`,
      { headers: HEADERS, cache: "no-store" }
    );
    if (!res.ok) return DEFAULT_CONFIG;
    const rows = await res.json();
    if (!rows || !rows[0] || !rows[0].data) return DEFAULT_CONFIG;
    return rows[0].data;
  } catch (e) {
    // Table not created yet, or a transient error — fall back so the page
    // and CMS still render instead of hard-failing.
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/linktree_config`, {
    method: "POST",
    headers: {
      ...HEADERS,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ id: 1, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase save failed (${res.status}): ${text}`);
  }
}
