// Linktree content store — backed by Vercel Blob storage.
//
// Why Blob and not a plain file: this app runs on Vercel, where the
// filesystem is read-only at runtime, so a serverless function can't just
// write a file and have it persist. Blob storage is Vercel's own file
// store — turn it on once in your project's Storage tab and it auto-adds
// the BLOB_READ_WRITE_TOKEN env var, no manual token to create.
//
// Until Blob storage is connected (or before the first save), getConfig()
// falls back to DEFAULT_CONFIG below so the page and CMS still work.

import { put, list } from "@vercel/blob";

const BLOB_PATH = "linktree-config.json";

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
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return DEFAULT_CONFIG;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return DEFAULT_CONFIG;
    return await res.json();
  } catch (e) {
    // Blob store not connected yet, or a transient error — fall back so
    // the page/CMS still render instead of hard-failing.
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(data) {
  await put(BLOB_PATH, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
