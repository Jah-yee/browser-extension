import { describe, it, expect } from "vitest";
import { wordSimilarity, isSearchEngine, extractSearchQuery, isSearchRefinement } from "../../src/core/search";

describe("wordSimilarity", () => {
  it("identical strings → 1.0", () => {
    expect(wordSimilarity("rust async await", "rust async await")).toBe(1.0);
  });
  it("no overlap → 0.0", () => {
    expect(wordSimilarity("rust programming", "python machine learning")).toBe(0.0);
  });
  it("partial overlap → between 0 and 1", () => {
    const sim = wordSimilarity("rust async error handling", "rust error handling tokio");
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(1.0);
  });
  it("case insensitive", () => {
    expect(wordSimilarity("Rust Async", "rust async")).toBe(1.0);
  });
  it("both empty → 1.0", () => {
    expect(wordSimilarity("", "")).toBe(1.0);
  });
  it("one empty → 0.0", () => {
    expect(wordSimilarity("hello", "")).toBe(0.0);
    expect(wordSimilarity("", "hello")).toBe(0.0);
  });
});

describe("isSearchEngine", () => {
  it("recognizes Google", () => {
    expect(isSearchEngine("www.google.com")).toBe(true);
    expect(isSearchEngine("google.co.uk")).toBe(true);
  });
  it("recognizes Bing", () => {
    expect(isSearchEngine("www.bing.com")).toBe(true);
  });
  it("recognizes DuckDuckGo", () => {
    expect(isSearchEngine("duckduckgo.com")).toBe(true);
  });
  it("recognizes Kagi", () => {
    expect(isSearchEngine("kagi.com")).toBe(true);
  });
  it("recognizes Perplexity", () => {
    expect(isSearchEngine("perplexity.ai")).toBe(true);
  });
  it("rejects non-search engines", () => {
    expect(isSearchEngine("github.com")).toBe(false);
    expect(isSearchEngine("stackoverflow.com")).toBe(false);
  });
});

describe("extractSearchQuery", () => {
  it("extracts q param from Google", () => {
    expect(extractSearchQuery("https://www.google.com/search?q=rust+async", "google.com")).toBe("rust async");
  });
  it("extracts q param from Bing", () => {
    expect(extractSearchQuery("https://www.bing.com/search?q=hello+world", "bing.com")).toBe("hello world");
  });
  it("returns null for non-search engine", () => {
    expect(extractSearchQuery("https://github.com/search?q=test", "github.com")).toBeNull();
  });
  it("returns null for missing q param", () => {
    expect(extractSearchQuery("https://google.com/", "google.com")).toBeNull();
  });
  it("handles invalid URL", () => {
    expect(extractSearchQuery("not-a-url", "google.com")).toBeNull();
  });
});

describe("isSearchRefinement", () => {
  it("detects query extension", () => {
    expect(isSearchRefinement("rust async error", "rust async")).toBe(true);
  });
  it("detects query reduction", () => {
    expect(isSearchRefinement("rust async", "rust async error handling")).toBe(true);
  });
  it("detects similar queries by word overlap", () => {
    // 3 shared words out of 4 unique → Jaccard > 0.4
    expect(isSearchRefinement("rust async error handling", "rust async error tokio")).toBe(true);
  });
  it("rejects completely different queries", () => {
    expect(isSearchRefinement("python machine learning", "rust async programming")).toBe(false);
  });
  it("returns false for empty previous", () => {
    expect(isSearchRefinement("hello", "")).toBe(false);
  });
  it("returns false for empty current", () => {
    expect(isSearchRefinement("", "hello")).toBe(false);
  });
});
