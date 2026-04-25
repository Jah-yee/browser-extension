// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Pure classification functions extracted from content.ts for testability.
// No browser APIs — can be tested with vitest directly.

import type { ContentType, LlmProvider, EmailMode } from "./schema";

/** Classify a page's content type from domain, title, and DOM signals. */
export function classifyContentType(
  domain: string,
  title: string,
  signals: { videoCount: number; imageCount: number; textLength: number; hasPlayer: boolean; hasCode: boolean; hasArticle: boolean },
): ContentType {
  const d = domain.toLowerCase();
  const t = title.toLowerCase();

  if (d.includes("youtube.com") || d.includes("vimeo.com") || d.includes("twitch.tv") ||
      d.includes("netflix.com") || d.includes("dailymotion.com") || signals.hasPlayer) {
    return "video";
  }
  if (d.includes("arxiv.org") || d.includes("scholar.google") || d.includes("semanticscholar.org") ||
      d.includes("researchgate.net") || d.includes("pubmed.") || d.includes("sciencedirect.com") ||
      d.includes("nature.com") || d.includes("ieee.org") ||
      t.includes("paper") || t.includes("abstract") || t.includes("doi:")) {
    return "paper";
  }
  if (d.includes("twitter.com") || d.includes("x.com") || d.includes("reddit.com") ||
      d.includes("facebook.com") || d.includes("instagram.com") || d.includes("tiktok.com") ||
      d.includes("linkedin.com") || d.includes("mastodon.") || d.includes("threads.net") ||
      d.includes("news.ycombinator.com") || d.includes("lobste.rs")) {
    return "social";
  }
  if (d.includes("slack.com") || d.includes("discord.com") || d.includes("teams.microsoft.com") ||
      d.includes("telegram.org") || d.includes("web.whatsapp.com") || d.includes("messenger.com")) {
    return "chat";
  }
  if (d.includes("mail.google.com") || d.includes("outlook.") || d.includes("mail.") ||
      d.includes("proton.me") || d.includes("fastmail.com")) {
    return "email";
  }
  if (d.includes("github.com") || d.includes("gitlab.com") || d.includes("bitbucket.org") ||
      d.includes("codepen.io") || d.includes("codesandbox.io") || d.includes("replit.com") ||
      d.includes("jsfiddle.net") || d.includes("stackblitz.com") || signals.hasCode) {
    return "code";
  }
  if (d.includes("amazon.") || d.includes("ebay.") || d.includes("shopify.") ||
      d.includes("etsy.com") || d.includes("walmart.com")) {
    return "shopping";
  }
  if (d.includes("cnn.com") || d.includes("bbc.") || d.includes("reuters.com") ||
      d.includes("nytimes.com") || d.includes("theguardian.com") || d.includes("washingtonpost.com") ||
      d.includes("apnews.com") || d.includes("techcrunch.com") || d.includes("theverge.com") ||
      d.includes("arstechnica.com") || signals.hasArticle) {
    return "news";
  }
  if (signals.imageCount > 10 && signals.textLength < 2000) {
    return "image";
  }
  return "text";
}

/** Detect LLM provider from domain. Returns null if not an LLM chat site. */
export function detectLLMProvider(domain: string): LlmProvider | null {
  const d = domain.toLowerCase();
  if (d.includes("chat.openai.com") || d.includes("chatgpt.com")) return "chatgpt";
  if (d.includes("claude.ai")) return "claude";
  if (d.includes("gemini.google.com")) return "gemini";
  if (d.includes("perplexity.ai")) return "perplexity";
  if (d.includes("copilot.microsoft.com")) return "copilot";
  if (d.includes("poe.com")) return "poe";
  if (d.includes("you.com")) return "you";
  if (d.includes("phind.com")) return "phind";
  if (d.includes("huggingface.co/chat")) return "huggingface";
  if (d.includes("pi.ai")) return "pi";
  if (d.includes("character.ai")) return "character";
  if (d.includes("coral.cohere.com") || d.includes("cohere.com/chat")) return "cohere";
  return null;
}

/** Detect email client mode from domain, URL, and title. */
export function detectEmailMode(
  domain: string,
  url: string,
  title: string,
): { mode: EmailMode; count: number } | null {
  const d = domain.toLowerCase();
  const isEmail = d.includes("mail.google.com") || d.includes("outlook.") ||
    d.includes("mail.") || d.includes("proton.me") || d.includes("fastmail.com") ||
    d.includes("zoho.com/mail") || d.includes("hey.com");
  if (!isEmail) return null;

  const u = url.toLowerCase();
  const t = title.toLowerCase();

  let mode: EmailMode = "inbox";
  if (u.includes("compose") || u.includes("#drafts")) {
    mode = "composing";
  } else if (u.includes("/search") || u.includes("?q=")) {
    mode = "searching";
  } else if (u.includes("/message/") || u.includes("#inbox/")) {
    mode = "reading";
  }

  let count = 0;
  const countMatch = t.match(/\((\d+)\)/);
  if (countMatch) count = parseInt(countMatch[1], 10);

  return { mode, count };
}
