// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Search-related pure functions extracted for testability.

/** Word-level Jaccard similarity between two strings (0-1). */
export function wordSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Known search engine domains. */
const SEARCH_ENGINES = [
  "google.", "bing.com", "duckduckgo.com", "search.yahoo.com",
  "ecosia.org", "kagi.com", "perplexity.ai", "you.com",
];

/** Check if a domain is a known search engine. */
export function isSearchEngine(domain: string): boolean {
  const d = domain.toLowerCase();
  return SEARCH_ENGINES.some((se) => d.includes(se));
}

/** Extract the search query from a URL (if on a search engine). */
export function extractSearchQuery(url: string, domain: string): string | null {
  if (!isSearchEngine(domain)) return null;
  try {
    const params = new URL(url).searchParams;
    return params.get("q") ?? params.get("p") ?? null;
  } catch {
    return null;
  }
}

/** Detect if a query is a refinement of a previous query. */
export function isSearchRefinement(current: string, previous: string): boolean {
  if (!previous || !current) return false;
  return (
    current.includes(previous) ||
    previous.includes(current) ||
    wordSimilarity(current, previous) > 0.4
  );
}
