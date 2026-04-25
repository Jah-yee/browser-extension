import { describe, it, expect } from "vitest";
import { extractDomain, filterUrl, isDomainAllowed, categorize } from "../../src/core/privacy";
import type { BrowserConfig } from "../../src/core/types";

const baseConfig: BrowserConfig = {
  enabled: true, daemonHost: "127.0.0.1", daemonPort: 0, batchIntervalMs: 2000,
  privacyMode: "domain_only", trackScrollDepth: true, trackReadingPatterns: true,
  trackSearchQueries: false, trackFormActivity: true, trackMediaState: true,
  domainBlocklist: [], domainAllowlist: [], incognitoTracking: false, authToken: "",
};

describe("extractDomain", () => {
  it("extracts domain from valid URL", () => {
    expect(extractDomain("https://github.com/user/repo")).toBe("github.com");
  });
  it("extracts domain with subdomain", () => {
    expect(extractDomain("https://docs.rs/tokio/latest")).toBe("docs.rs");
  });
  it("returns empty for invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("");
  });
  it("returns empty for empty string", () => {
    expect(extractDomain("")).toBe("");
  });
  it("handles localhost", () => {
    expect(extractDomain("http://127.0.0.1:18444/v1/status")).toBe("127.0.0.1");
  });
});

describe("filterUrl", () => {
  it("domain_only strips everything except domain", () => {
    const result = filterUrl("https://github.com/user/repo?tab=code", "domain_only");
    expect(result.domain).toBe("github.com");
    expect(result.url).toBeUndefined();
  });
  it("full_url preserves the full URL", () => {
    const result = filterUrl("https://github.com/user/repo?tab=code", "full_url");
    expect(result.domain).toBe("github.com");
    expect(result.url).toBe("https://github.com/user/repo?tab=code");
  });
  it("title_and_domain keeps protocol + domain + path, strips query", () => {
    const result = filterUrl("https://github.com/user/repo?tab=code", "title_and_domain");
    expect(result.domain).toBe("github.com");
    expect(result.url).toBe("https://github.com/user/repo");
  });
  it("returns empty domain for invalid URL", () => {
    const result = filterUrl("garbage", "full_url");
    expect(result.domain).toBe("");
  });
});

describe("isDomainAllowed", () => {
  it("allows any domain with empty lists", () => {
    expect(isDomainAllowed("github.com", baseConfig)).toBe(true);
  });
  it("blocks domains in blocklist", () => {
    const cfg = { ...baseConfig, domainBlocklist: ["facebook.com"] };
    expect(isDomainAllowed("facebook.com", cfg)).toBe(false);
    expect(isDomainAllowed("github.com", cfg)).toBe(true);
  });
  it("supports wildcard in blocklist", () => {
    const cfg = { ...baseConfig, domainBlocklist: ["*.bank.com"] };
    expect(isDomainAllowed("secure.bank.com", cfg)).toBe(false);
    expect(isDomainAllowed("bank.com", cfg)).toBe(false);
    expect(isDomainAllowed("other.com", cfg)).toBe(true);
  });
  it("restricts to allowlist when set", () => {
    const cfg = { ...baseConfig, domainAllowlist: ["github.com", "docs.rs"] };
    expect(isDomainAllowed("github.com", cfg)).toBe(true);
    expect(isDomainAllowed("docs.rs", cfg)).toBe(true);
    expect(isDomainAllowed("twitter.com", cfg)).toBe(false);
  });
  it("blocklist overrides allowlist", () => {
    const cfg = { ...baseConfig, domainAllowlist: ["github.com"], domainBlocklist: ["github.com"] };
    expect(isDomainAllowed("github.com", cfg)).toBe(false);
  });
  it("rejects empty domain", () => {
    expect(isDomainAllowed("", baseConfig)).toBe(false);
  });
  it("rejects internal browser pages", () => {
    expect(isDomainAllowed("chrome.google.com", baseConfig)).toBe(false);
    expect(isDomainAllowed("addons.mozilla.org", baseConfig)).toBe(false);
  });
});

describe("categorize", () => {
  it("classifies development domains", () => {
    expect(categorize("github.com", "")).toBe("development");
    expect(categorize("gitlab.com", "")).toBe("development");
    expect(categorize("stackoverflow.com", "")).toBe("development");
    expect(categorize("linear.app", "")).toBe("development");
  });
  it("classifies by title keywords", () => {
    expect(categorize("example.com", "Pull Request #123")).toBe("development");
    expect(categorize("example.com", "Issue #456")).toBe("development");
  });
  it("classifies reference domains", () => {
    expect(categorize("wikipedia.org", "")).toBe("reference");
    expect(categorize("docs.python.org", "")).toBe("reference");
    // developer.mozilla.org matches "developer." → development (domain-based priority)
    expect(categorize("mdn.io", "")).toBe("reference");
  });
  it("classifies social media", () => {
    expect(categorize("twitter.com", "")).toBe("social");
    expect(categorize("reddit.com", "")).toBe("social");
    expect(categorize("news.ycombinator.com", "")).toBe("social");
  });
  it("classifies communication", () => {
    expect(categorize("slack.com", "")).toBe("communication");
    expect(categorize("discord.com", "")).toBe("communication");
  });
  it("classifies media", () => {
    expect(categorize("youtube.com", "")).toBe("media");
    expect(categorize("spotify.com", "")).toBe("media");
  });
  it("returns 'other' for unknown domains", () => {
    expect(categorize("random-site.xyz", "")).toBe("other");
  });
});
