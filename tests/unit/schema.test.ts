import { describe, it, expect } from "vitest";
import { EVENT_TYPES, DB_COLUMNS, type BrowserEvent, type EventType } from "../../src/core/schema";

describe("EVENT_TYPES", () => {
  it("has 31 event types", () => {
    expect(EVENT_TYPES.length).toBe(31);
  });

  it("has no duplicates", () => {
    const unique = new Set(EVENT_TYPES);
    expect(unique.size).toBe(EVENT_TYPES.length);
  });

  it("includes all expected types", () => {
    const expected: EventType[] = [
      "tab_switch", "tab_open", "tab_close", "page_load",
      "window_focus", "window_blur", "tab_snapshot",
      "navigation", "navigation_committed", "navigation_type", "link_navigate",
      "scroll", "reading_time",
      "mouse_activity", "click",
      "typing_detected", "form_submit",
      "clipboard_copy", "clipboard_paste",
      "media_state",
      "page_profile", "visible_context",
      "search_query", "search_pattern",
      "llm_interaction",
      "email_activity",
      "bookmark_created", "download_started",
      "devtools_toggle", "revisit", "env_context",
    ];
    for (const t of expected) {
      expect(EVENT_TYPES).toContain(t);
    }
  });
});

describe("DB_COLUMNS", () => {
  it("has no duplicates", () => {
    const unique = new Set(DB_COLUMNS);
    expect(unique.size).toBe(DB_COLUMNS.length);
  });

  it("includes critical indexed columns", () => {
    expect(DB_COLUMNS).toContain("event_type");
    expect(DB_COLUMNS).toContain("domain");
    expect(DB_COLUMNS).toContain("category");
    expect(DB_COLUMNS).toContain("content_type");
    expect(DB_COLUMNS).toContain("at");
    expect(DB_COLUMNS).toContain("eeg_focus");
  });

  it("includes all browser-specific columns", () => {
    const browserCols = [
      "scroll_depth", "scroll_speed", "scroll_direction", "scroll_reversals",
      "reading_time_secs", "active_time_secs", "idle_time_secs",
      "llm_provider", "llm_turn_count",
      "email_mode", "email_count",
      "revisit_count", "domain_visit_count",
      "visible_text", "heading", "page_title",
      "video_playback_rate", "download_type",
    ];
    for (const col of browserCols) {
      expect(DB_COLUMNS).toContain(col);
    }
  });
});

describe("BrowserEvent type safety", () => {
  it("tab_switch event has correct shape", () => {
    const event: BrowserEvent = {
      type: "tab_switch",
      domain: "github.com",
      category: "development",
      url: "https://github.com",
      tab_count: 5,
    };
    expect(event.type).toBe("tab_switch");
  });

  it("scroll event has required fields", () => {
    const event: BrowserEvent = {
      type: "scroll",
      domain: "docs.rs",
      scroll_depth: 0.75,
      scroll_speed: 120,
      scroll_direction: "down",
      scroll_reversals: 2,
    };
    expect(event.scroll_depth).toBe(0.75);
  });

  it("llm_interaction has provider field", () => {
    const event: BrowserEvent = {
      type: "llm_interaction",
      domain: "claude.ai",
      llm_provider: "claude",
      llm_turn_count: 5,
      llm_input_detected: true,
      llm_response_streaming: false,
      content_type: "chat",
    };
    expect(event.llm_provider).toBe("claude");
  });

  it("email_activity has mode field", () => {
    const event: BrowserEvent = {
      type: "email_activity",
      domain: "mail.google.com",
      email_mode: "composing",
      email_count: 3,
      content_type: "email",
    };
    expect(event.email_mode).toBe("composing");
  });
});
