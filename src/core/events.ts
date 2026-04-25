// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// EventCollector for browser activity. Mirrors the pattern from
// extensions/vscode/src/events.ts — collects events into a queue,
// debounces where needed, and exposes drain() for the flush timer.

import { filterUrl, isDomainAllowed, categorize } from "./privacy";
import type { BrowserConfig, BrowserEvent, ContentMessage } from "./types";

/** Manages browser event listeners and produces BrowserEvent objects. */
export class EventCollector {
  private queue: BrowserEvent[] = [];
  private lastTabSwitchTs = 0;

  constructor(private config: BrowserConfig) {}

  /** Start listening to browser events (called from background service worker). */
  start(): void {
    this.listenTabs();
    this.listenNavigation();
    this.listenWindows();
    this.listenBookmarks();
    this.listenDownloads();
    this.listenHistory();
    this.listenContentMessages();
    this.startTabSnapshot();
    this.emitEnvContext();
  }

  /** Drain all queued events. */
  drain(): BrowserEvent[] {
    const events = this.queue;
    this.queue = [];
    return events;
  }

  // ── Tab events ────────���──────────────────────────────────────────────

  private listenTabs(): void {
    // Tab activated (user switched tabs)
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        this.pushTabEvent("tab_switch", tab, activeInfo.windowId);
      } catch { /* tab may have been closed */ }
    });

    // Tab created
    chrome.tabs.onCreated.addListener((tab) => {
      this.pushTabEvent("tab_open", tab, tab.windowId);
    });

    // Tab closed
    chrome.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
      // Count remaining tabs
      try {
        const tabs = await chrome.tabs.query({ windowId: removeInfo.windowId });
        this.push({
          type: "tab_close",
          window_id: removeInfo.windowId,
          tab_count: tabs.length,
        });
      } catch {
        this.push({ type: "tab_close", window_id: removeInfo.windowId });
      }
    });

    // Tab updated (page load complete, title change)
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.url) {
        this.pushTabEvent("page_load", tab, tab.windowId);
      }
    });
  }

  // ── Navigation events ────────────────────────────────────────────────

  private listenNavigation(): void {
    // SPA navigation (pushState/replaceState)
    chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
      if (details.frameId !== 0) return; // top frame only
      const filtered = filterUrl(details.url, this.config.privacyMode);
      if (!isDomainAllowed(filtered.domain, this.config)) return;
      this.push({
        type: "navigation",
        url: filtered.url,
        domain: filtered.domain,
        tab_id: details.tabId,
        category: categorize(filtered.domain, ""),
      });
    });
  }

  // ── Window events ───────��────────────────────────────────────────────

  private listenWindows(): void {
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.push({ type: "window_blur" });
      } else {
        this.push({ type: "window_focus", window_id: windowId });
      }
    });
  }

  // ── Bookmark events ─────────���─────────────────────────────────���──────

  private listenBookmarks(): void {
    try {
      chrome.bookmarks.onCreated.addListener((_id, bookmark) => {
        if (!bookmark.url) return;
        const filtered = filterUrl(bookmark.url, this.config.privacyMode);
        if (!isDomainAllowed(filtered.domain, this.config)) return;
        this.push({
          type: "bookmark_created",
          url: filtered.url,
          domain: filtered.domain,
          title: bookmark.title,
          category: categorize(filtered.domain, bookmark.title ?? ""),
        });
      });
    } catch {
      // bookmarks API may not be available in all contexts
    }
  }

  // ── Download events ──────────���───────────────────────────────────��───

  private listenDownloads(): void {
    try {
      chrome.downloads.onCreated.addListener((item) => {
        const url = item.finalUrl || item.url;
        if (!url) return;
        const filtered = filterUrl(url, this.config.privacyMode);
        if (!isDomainAllowed(filtered.domain, this.config)) return;
        // Extract file extension
        const filename = item.filename || url.split("/").pop() || "";
        const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "";
        this.push({
          type: "download_started",
          url: filtered.url,
          domain: filtered.domain,
          category: categorize(filtered.domain, ""),
          download_type: ext,
        });
      });
    } catch {
      // downloads API may not be available
    }
  }

  // ── History events ───────────────────────────────────────────────────

  private listenHistory(): void {
    try {
      // Track back/forward navigation via webNavigation
      chrome.webNavigation.onCommitted.addListener((details) => {
        if (details.frameId !== 0) return; // top frame only
        const filtered = filterUrl(details.url, this.config.privacyMode);
        if (!isDomainAllowed(filtered.domain, this.config)) return;

        let navType: string;
        switch (details.transitionType) {
          case "typed": navType = "typed"; break;
          case "auto_bookmark": navType = "bookmark"; break;
          case "link": navType = "link"; break;
          case "reload": navType = "reload"; break;
          default: navType = details.transitionType;
        }

        const isBackForward = details.transitionQualifiers?.includes("forward_back") ?? false;
        if (isBackForward) navType = "back_forward";

        this.push({
          type: "navigation_committed",
          url: filtered.url,
          domain: filtered.domain,
          tab_id: details.tabId,
          nav_type: navType,
          category: categorize(filtered.domain, ""),
        });
      });
    } catch {
      // webNavigation.onCommitted may not be available
    }
  }

  // ── Periodic tab snapshot ───────────────────────────────────────────

  private startTabSnapshot(): void {
    // Every 30s, capture a snapshot of all tabs for context analysis
    setInterval(async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const activeTabs = tabs.filter((t) => t.active);
        const pinnedCount = tabs.filter((t) => t.pinned).length;
        const audibleCount = tabs.filter((t) => t.audible).length;
        const domains = new Set(
          tabs
            .map((t) => t.url ? filterUrl(t.url, this.config.privacyMode).domain : "")
            .filter(Boolean),
        );

        this.push({
          type: "tab_snapshot",
          tab_count: tabs.length,
          category: `pinned:${pinnedCount},audible:${audibleCount},domains:${domains.size}`,
        });
      } catch { /* ignore */ }
    }, 30_000);
  }

  // ── Content script messages ──────────────────────────────────────────

  private listenContentMessages(): void {
    chrome.runtime.onMessage.addListener(
      (message: ContentMessage, _sender, _sendResponse) => {
        if (message.type !== "content_event") return;
        const event = message.payload;
        // Respect per-category toggles
        if (event.type === "scroll" && !this.config.trackScrollDepth) return;
        if (event.type === "reading_time" && !this.config.trackReadingPatterns) return;
        if (event.type === "typing_detected" && !this.config.trackFormActivity) return;
        if (event.type === "media_state" && !this.config.trackMediaState) return;
        if (event.type === "search_query" && !this.config.trackSearchQueries) return;
        this.push(event);
      },
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async pushTabEvent(
    type: string,
    tab: chrome.tabs.Tab,
    windowId?: number,
  ): Promise<void> {
    // Skip incognito tabs unless explicitly enabled
    if (tab.incognito && !this.config.incognitoTracking) return;
    // Skip internal browser pages
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:") ||
        tab.url.startsWith("chrome-extension://") || tab.url.startsWith("moz-extension://")) return;

    const filtered = filterUrl(tab.url, this.config.privacyMode);
    if (!isDomainAllowed(filtered.domain, this.config)) return;

    // Debounce rapid tab switches (< 200ms)
    if (type === "tab_switch") {
      const now = Date.now();
      if (now - this.lastTabSwitchTs < 200) return;
      this.lastTabSwitchTs = now;
    }

    // Get tab count
    let tabCount: number | undefined;
    try {
      const tabs = await chrome.tabs.query({});
      tabCount = tabs.length;
    } catch { /* ignore */ }

    const title =
      this.config.privacyMode !== "domain_only" ? tab.title : undefined;

    this.push({
      type,
      url: filtered.url,
      domain: filtered.domain,
      title,
      tab_id: tab.id,
      window_id: windowId,
      tab_count: tabCount,
      category: categorize(filtered.domain, tab.title ?? ""),
    });
  }

  private push(event: BrowserEvent): void {
    this.queue.push(event);
  }

  private emitEnvContext(): void {
    const ua = navigator.userAgent;
    let browserName = "unknown";
    if (ua.includes("Firefox/")) browserName = "Firefox";
    else if (ua.includes("Edg/")) browserName = "Edge";
    else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browserName = "Safari";
    else if (ua.includes("Chrome/")) browserName = "Chrome";

    this.push({
      type: "env_context",
      category: browserName,
      title: navigator.platform,
    });
  }
}
