// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com

import type { BrowserConfig, PrivacyMode } from "./types";

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Apply privacy filtering to a URL based on the configured mode. */
export function filterUrl(
  url: string,
  mode: PrivacyMode,
): { url?: string; domain: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { domain: "" };
  }
  const domain = parsed.hostname;

  switch (mode) {
    case "domain_only":
      return { domain };
    case "full_url":
      return { url: parsed.href, domain };
    case "title_and_domain":
      return { url: `${parsed.protocol}//${domain}${parsed.pathname}`, domain };
  }
}

/** Check if a domain is allowed by the user's allowlist/blocklist. */
export function isDomainAllowed(domain: string, config: BrowserConfig): boolean {
  if (!domain) return false;
  // Internal pages are never tracked
  if (
    domain === "chrome.google.com" ||
    domain === "addons.mozilla.org" ||
    domain.startsWith("chrome://") ||
    domain.startsWith("about:")
  ) {
    return false;
  }
  // Blocklist takes priority
  if (config.domainBlocklist.some((d) => matchDomain(domain, d))) return false;
  // If allowlist is non-empty, domain must match
  if (
    config.domainAllowlist.length > 0 &&
    !config.domainAllowlist.some((d) => matchDomain(domain, d))
  ) {
    return false;
  }
  return true;
}

/** Match a domain against a pattern (supports *.example.com wildcards). */
function matchDomain(domain: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return domain === pattern.slice(2) || domain.endsWith(suffix);
  }
  return domain === pattern;
}

/** Auto-categorize a domain for brain analytics. */
export function categorize(domain: string, title: string): string {
  const d = domain.toLowerCase();
  const t = title.toLowerCase();

  // Development
  if (
    d.includes("github.com") || d.includes("gitlab.com") ||
    d.includes("bitbucket.org") || d.includes("stackoverflow.com") ||
    d.includes("stackexchange.com") || d.includes("developer.") ||
    d.includes("docs.rs") || d.includes("crates.io") ||
    d.includes("npmjs.com") || d.includes("pypi.org") ||
    d.includes("pkg.go.dev") || d.includes("rubygems.org") ||
    d.includes("jsfiddle.net") || d.includes("codepen.io") ||
    d.includes("codesandbox.io") || d.includes("replit.com") ||
    d.includes("vercel.com") || d.includes("netlify.com") ||
    d.includes("heroku.com") || d.includes("railway.app") ||
    d.includes("linear.app") || d.includes("jira.") ||
    t.includes("pull request") || t.includes("merge request") ||
    t.includes("issue #")
  ) {
    return "development";
  }

  // Reference / Documentation
  if (
    d.includes("wikipedia.org") || d.includes("mdn.") ||
    d.includes("w3schools.com") || d.includes("devdocs.io") ||
    d.includes("docs.") || d.includes("documentation") ||
    d.includes("learn.microsoft.com") || d.includes("rust-lang.org") ||
    d.includes("typescriptlang.org") || d.includes("python.org") ||
    d.includes("arxiv.org") || d.includes("scholar.google") ||
    d.includes("medium.com") || d.includes("dev.to") ||
    d.includes("hashnode.") || d.includes("blog.")
  ) {
    return "reference";
  }

  // Communication
  if (
    d.includes("slack.com") || d.includes("discord.com") ||
    d.includes("teams.microsoft.com") || d.includes("zoom.us") ||
    d.includes("meet.google.com") || d.includes("mail.google.com") ||
    d.includes("outlook.") || d.includes("notion.so") ||
    d.includes("figma.com") || d.includes("miro.com")
  ) {
    return "communication";
  }

  // Media
  if (
    d.includes("youtube.com") || d.includes("spotify.com") ||
    d.includes("soundcloud.com") || d.includes("netflix.com") ||
    d.includes("twitch.tv") || d.includes("podcasts.") ||
    d.includes("music.")
  ) {
    return "media";
  }

  // Social
  if (
    d.includes("twitter.com") || d.includes("x.com") ||
    d.includes("reddit.com") || d.includes("facebook.com") ||
    d.includes("instagram.com") || d.includes("linkedin.com") ||
    d.includes("news.ycombinator.com") || d.includes("lobste.rs") ||
    d.includes("mastodon.")
  ) {
    return "social";
  }

  return "other";
}
