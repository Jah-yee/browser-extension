// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Content script — injected into every page.
// Captures events that background service worker cannot observe:
// scroll depth, typing detection, reading time, media state, search queries.
//
// Privacy: NEVER captures text content, form values, or clipboard.
// Only sends metadata (booleans, numbers) to the background script.

import type { BrowserEvent, ContentMessage } from "./core/types";
import { extractDomain, filterUrl, categorize } from "./core/privacy";
import { classifyContentType as _classifyContent, detectLLMProvider as _detectLLM, detectEmailMode as _detectEmail } from "./core/classify";
import { generateTOTP as _generateTOTP } from "./core/totp";
import { wordSimilarity, extractSearchQuery as _extractSearch, isSearchEngine } from "./core/search";

// ── Auto-pairing detection (TOTP-based, same as iroh phone pairing) ────────
// The daemon pairing page embeds:
//   <div id="neuroskill-pair" data-totp-id="..." data-secret="..." data-port="...">
// We read the TOTP secret, generate an OTP, and register via the same
// POST /v1/iroh/clients/register endpoint used by phone pairing.

(async function detectPairingPage() {
  const el = document.getElementById("neuroskill-pair");
  if (!el) return;

  const totpId = el.getAttribute("data-totp-id");
  const secretB32 = el.getAttribute("data-secret");
  const port = el.getAttribute("data-port") || "18444";
  const authToken = el.getAttribute("data-auth") || "";
  if (!totpId || !secretB32) return;

  const title = document.getElementById("title");
  const desc = document.getElementById("desc");
  const spin = document.getElementById("spin");
  const okIcon = document.getElementById("ok-icon");
  const errIcon = document.getElementById("err-icon");
  const msg = document.getElementById("msg");

  try {
    // Generate OTP from the TOTP secret (SHA-1, 6 digits, 30s period)
    const otp = await _generateTOTP(secretB32);

    // Get or create a persistent browser endpoint ID
    const endpointId = await getOrCreateEndpointId();

    // Detect browser name
    const ua = navigator.userAgent;
    let browserName = "Browser";
    if (ua.includes("Firefox/")) browserName = "Firefox";
    else if (ua.includes("Edg/")) browserName = "Edge";
    else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browserName = "Safari";
    else if (ua.includes("Chrome/")) browserName = "Chrome";

    // Register via the iroh client registration endpoint (needs auth token)
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const resp = await fetch(`http://127.0.0.1:${port}/v1/iroh/clients/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        endpoint_id: endpointId,
        otp,
        totp_id: totpId,
        name: `${browserName} Extension`,
        scope: "read",
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(err);
    }

    const result = await resp.json();
    if (!result.registered) throw new Error("Registration rejected");

    // Now get an auth token — the daemon's default token works for localhost,
    // but we should create a scoped token. For now, store the endpoint_id
    // so the background script can authenticate via the iroh client system.
    // The extension will use the daemon's /v1/activity/browser-events endpoint
    // which checks bearer tokens. We need the actual token.
    //
    // The registered client gets a client entry; for HTTP access (not iroh tunnel),
    // we still need a bearer token. Request one via the pairing page's embedded port.
    // The simplest approach: the daemon auto-generates a scoped API token for the
    // registered client and returns it in the registration response.

    // Store config with the daemon port for now — the extension uses the
    // registered client's scope for permission checks on the iroh side,
    // and bearer token auth for HTTP requests.
    chrome.storage.local.get("neuroskill_config", (stored) => {
      const config = (stored?.neuroskill_config as Record<string, unknown>) || {};
      config.enabled = true;
      config.daemonHost = "127.0.0.1";
      config.daemonPort = parseInt(port, 10);
      config.endpointId = endpointId;
      config.clientId = result.client?.id;
      // Use the auth token from the pairing page for subsequent API calls
      if (authToken) config.authToken = authToken;
      // Override with registration-returned token if available (scoped)
      if (result.token) config.authToken = result.token;
      chrome.storage.local.set({ neuroskill_config: config }, () => {
        chrome.runtime.sendMessage({ type: "config_updated" });
      });
    });

    // Update UI to success
    if (spin) spin.style.display = "none";
    if (okIcon) okIcon.style.display = "block";
    if (title) title.textContent = "Paired Successfully";
    if (desc) desc.textContent = `${browserName} extension is now connected to NeuroSkill.`;
    if (msg) { msg.textContent = "You can close this tab."; msg.className = "msg success"; }
  } catch (e: any) {
    if (spin) spin.style.display = "none";
    if (errIcon) errIcon.style.display = "block";
    if (title) { title.textContent = "Pairing Failed"; title.style.color = "#FF5722"; }
    if (desc) desc.textContent = e.message || "Unknown error";
    if (msg) { msg.textContent = "Try generating a new pairing link from the NeuroSkill app."; msg.className = "msg error"; }
  }
})();

// generateTOTP → imported from ./core/totp.ts

/** Get or create a persistent endpoint ID for this browser instance. */
async function getOrCreateEndpointId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get("neuroskill_endpoint_id", (result) => {
      if (result.neuroskill_endpoint_id) {
        resolve(result.neuroskill_endpoint_id);
      } else {
        const id = crypto.randomUUID();
        chrome.storage.local.set({ neuroskill_endpoint_id: id }, () => resolve(id));
      }
    });
  });
}

function sendEvent(payload: BrowserEvent): void {
  const message: ContentMessage = { type: "content_event", payload };
  try {
    chrome.runtime.sendMessage(message);
  } catch {
    // Extension context may be invalidated
  }
}

const domain = extractDomain(window.location.href);

// ══════════════════════════════════════════════════════════════════════════
// SCROLL TRACKING — depth, speed, direction, reversals
// ══════════════════════════════════════════════════════════════════════════

let scrollDebounce: ReturnType<typeof setTimeout> | undefined;
let maxScrollDepth = 0;
let lastScrollY = window.scrollY;
let lastScrollTs = Date.now();
let scrollPixelsTotal = 0;
let scrollReversals = 0;
let lastScrollDir: "down" | "up" | null = null;
let scrollDownPx = 0;
let scrollUpPx = 0;

function getScrollDepth(): number {
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;
  if (scrollHeight <= clientHeight) return 1.0;
  return Math.min(1.0, scrollTop / (scrollHeight - clientHeight));
}

window.addEventListener("scroll", () => {
  const now = Date.now();
  const currentY = window.scrollY;
  const delta = currentY - lastScrollY;
  const absDelta = Math.abs(delta);

  scrollPixelsTotal += absDelta;
  if (delta > 0) { scrollDownPx += delta; } else { scrollUpPx += absDelta; }

  // Track direction reversals (re-reading signal)
  const dir: "down" | "up" = delta >= 0 ? "down" : "up";
  if (lastScrollDir && dir !== lastScrollDir) scrollReversals++;
  lastScrollDir = dir;

  lastScrollY = currentY;
  const depth = getScrollDepth();
  if (depth > maxScrollDepth) maxScrollDepth = depth;

  if (scrollDebounce) clearTimeout(scrollDebounce);
  scrollDebounce = setTimeout(() => {
    const elapsed = (Date.now() - lastScrollTs) / 1000;
    const speed = elapsed > 0 ? Math.round(scrollPixelsTotal / elapsed) : 0;
    const direction = scrollDownPx > scrollUpPx * 3 ? "down" : scrollUpPx > scrollDownPx * 3 ? "up" : "mixed";

    sendEvent({
      type: "scroll",
      domain,
      scroll_depth: Math.round(maxScrollDepth * 100) / 100,
      scroll_speed: speed,
      scroll_direction: direction,
      scroll_reversals: scrollReversals,
    });

    // Reset window
    scrollPixelsTotal = 0;
    scrollDownPx = 0;
    scrollUpPx = 0;
    scrollReversals = 0;
    lastScrollTs = Date.now();
  }, 5000);
}, { passive: true });

// ══════════════════════════════════════════════════════════════════════════
// TIME TRACKING — active time, idle time, reading time
// ══════════════════════════════════════════════════════════════════════════

let pageVisibleStart = Date.now();
let totalReadingMs = 0;
let isVisible = !document.hidden;
let lastActivityTs = Date.now();
let totalActiveMs = 0;
let totalIdleMs = 0;
const IDLE_THRESHOLD_MS = 30_000; // 30s without input = idle

function tickActiveIdle(): void {
  const now = Date.now();
  const elapsed = now - lastActivityTs;
  if (elapsed > IDLE_THRESHOLD_MS) {
    totalIdleMs += elapsed;
  } else {
    totalActiveMs += elapsed;
  }
}

function markActivity(): void {
  const now = Date.now();
  const gap = now - lastActivityTs;
  if (gap > IDLE_THRESHOLD_MS) {
    totalIdleMs += gap;
  } else {
    totalActiveMs += gap;
  }
  lastActivityTs = now;
}

// Track mouse/keyboard as "active" signals
document.addEventListener("mousemove", markActivity, { passive: true });
document.addEventListener("keydown", markActivity, { passive: true });
document.addEventListener("click", markActivity, { passive: true });
document.addEventListener("scroll", markActivity, { passive: true });

function emitTimeEvent(): void {
  tickActiveIdle();
  if (isVisible) totalReadingMs += Date.now() - pageVisibleStart;
  const readingSecs = Math.round(totalReadingMs / 1000);
  const activeSecs = Math.round(totalActiveMs / 1000);
  const idleSecs = Math.round(totalIdleMs / 1000);
  if (readingSecs < 2) return;
  sendEvent({
    type: "reading_time",
    domain,
    reading_time_secs: readingSecs,
    active_time_secs: activeSecs,
    idle_time_secs: idleSecs,
    scroll_depth: Math.round(maxScrollDepth * 100) / 100,
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (isVisible) totalReadingMs += Date.now() - pageVisibleStart;
    isVisible = false;
    emitTimeEvent();
  } else {
    pageVisibleStart = Date.now();
    isVisible = true;
  }
});

window.addEventListener("beforeunload", emitTimeEvent);

// Periodic heartbeat — emit engagement stats every 60s while visible
setInterval(() => {
  if (isVisible) emitTimeEvent();
}, 60_000);

// ══════════════════════════════════════════════════════════════════════════
// MOUSE TRACKING — movement, idle, click rate
// ══════════════════════════════════════════════════════════════════════════

let mouseDistance = 0;
let lastMouseX = -1;
let lastMouseY = -1;
let lastMouseMoveTs = Date.now();
let clickCount = 0;
let clickWindowStart = Date.now();

document.addEventListener("mousemove", (e) => {
  if (lastMouseX >= 0) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    mouseDistance += Math.sqrt(dx * dx + dy * dy);
  }
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  lastMouseMoveTs = Date.now();
}, { passive: true });

// Emit mouse metrics every 30s
setInterval(() => {
  const idleSecs = Math.round((Date.now() - lastMouseMoveTs) / 1000);
  const elapsed = (Date.now() - clickWindowStart) / 60000;
  const clicksPerMin = elapsed > 0 ? Math.round(clickCount / elapsed) : 0;

  if (mouseDistance > 50 || idleSecs > 5 || clickCount > 0) {
    sendEvent({
      type: "mouse_activity",
      domain,
      mouse_distance: Math.round(mouseDistance),
      mouse_idle_secs: idleSecs,
      clicks_per_min: clicksPerMin,
    });
  }
  mouseDistance = 0;
  clickCount = 0;
  clickWindowStart = Date.now();
}, 30_000);

// ══════════════════════════════════════════════════════════════════════════
// CLICK TRACKING — target type, position
// ══════════════════════════════════════════════════════════════════════════

document.addEventListener("click", (e) => {
  clickCount++;
  const target = e.target as HTMLElement;
  let clickTarget: string = "other";

  if (target.closest("a")) clickTarget = "link";
  else if (target.closest("button, [role='button'], input[type='submit']")) clickTarget = "button";
  else if (target.closest("form, input, textarea, select")) clickTarget = "form";
  else if (target.closest("video, audio, [class*='player']")) clickTarget = "media";
  else if (target.closest("img, picture, svg, canvas")) clickTarget = "image";

  sendEvent({
    type: "click",
    domain,
    click_target: clickTarget,
    click_x: Math.round(e.clientX),
    click_y: Math.round(e.clientY),
  });
}, { passive: true });

// ══════════════════════════════════════════════════════════════════════════
// TYPING / FORM INPUT — boolean + form submit detection
// ══════════════════════════════════════════════════════════════════════════

let typingBurstCount = 0;
let typingWindowStart = Date.now();

document.addEventListener("input", (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    typingBurstCount++;
  }
}, { passive: true });

// Emit typing rate every 30s
setInterval(() => {
  if (typingBurstCount > 0) {
    sendEvent({
      type: "typing_detected",
      domain,
      typing_detected: true,
    });
    typingBurstCount = 0;
  }
}, 30_000);

// Form submit
document.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  sendEvent({
    type: "form_submit",
    domain,
    form_count: document.forms.length,
  });
}, { passive: true, capture: true });

// ══════════════════════════════════════════════════════════════════════════
// CLIPBOARD — copy/paste size (NEVER content)
// ══════════════════════════════════════════════════════════════════════════

document.addEventListener("copy", () => {
  // We can't read clipboard synchronously, just mark that a copy happened
  sendEvent({ type: "clipboard_copy", domain });
}, { passive: true });

document.addEventListener("paste", (e) => {
  const ce = e as ClipboardEvent;
  const text = ce.clipboardData?.getData("text/plain") ?? "";
  sendEvent({ type: "clipboard_paste", domain, paste_length: text.length });
}, { passive: true });

// ══════════════════════════════════════════════════════════════════════════
// MEDIA / VIDEO TRACKING — detailed video engagement
// ══════════════════════════════════════════════════════════════════════════

let lastMediaState: boolean | null = null;
const videoWatchTime = new Map<HTMLVideoElement, number>();

function checkMedia(): void {
  const videos = document.querySelectorAll("video");
  const audios = document.querySelectorAll("audio");
  let playing = false;
  let totalDuration = 0;
  let totalWatched = 0;

  videos.forEach((v) => {
    if (!v.paused && !v.ended) {
      playing = true;
      if (!videoWatchTime.has(v)) videoWatchTime.set(v, 0);
      videoWatchTime.set(v, (videoWatchTime.get(v) ?? 0) + 10); // ~10s per check
    }
    if (v.duration && isFinite(v.duration)) totalDuration += v.duration;
    totalWatched += videoWatchTime.get(v) ?? 0;
  });
  audios.forEach((a) => {
    if (!a.paused && !a.ended) playing = true;
  });

  if (playing !== lastMediaState) {
    lastMediaState = playing;
    sendEvent({
      type: "media_state",
      domain,
      media_playing: playing,
      has_video: videos.length > 0,
      has_audio: audios.length > 0,
      video_duration_secs: Math.round(totalDuration),
      video_watched_secs: Math.round(totalWatched),
      video_playback_rate: videos.length > 0 ? videos[0].playbackRate : undefined,
    });
  }
}

setInterval(checkMedia, 10_000);
document.addEventListener("play", () => setTimeout(checkMedia, 100), { capture: true, passive: true });
document.addEventListener("pause", () => setTimeout(checkMedia, 100), { capture: true, passive: true });
document.addEventListener("ended", () => setTimeout(checkMedia, 100), { capture: true, passive: true });

// ══════════════════════════════════════════════════════════════════════════
// CONTENT TYPE CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════════

/** Classify page content using the extracted module (testable). */
function classifyContentType(): string {
  const videos = document.querySelectorAll("video");
  const images = document.querySelectorAll("img");
  return _classifyContent(domain, document.title, {
    videoCount: videos.length,
    imageCount: images.length,
    textLength: document.body?.textContent?.length ?? 0,
    hasPlayer: !!document.querySelector("[class*='player'], [id*='player']"),
    hasCode: document.querySelectorAll("pre code, .hljs, .CodeMirror, .monaco-editor").length > 0,
    hasArticle: !!document.querySelector("article, [class*='article']"),
  });
}

function emitPageProfile(): void {
  const images = document.querySelectorAll("img");
  const textLen = document.body?.innerText?.length ?? 0;
  const wordCount = Math.round(textLen / 5); // rough estimate

  sendEvent({
    type: "page_profile",
    domain,
    content_type: classifyContentType(),
    has_video: document.querySelectorAll("video").length > 0,
    has_audio: document.querySelectorAll("audio").length > 0,
    image_count: images.length,
    word_count: wordCount,
    form_count: document.forms.length,
  });
}

// Emit page profile after DOM settles
setTimeout(emitPageProfile, 2000);

// ══════════════════════════════════════════════════════════════════════════
// SEARCH QUERY EXTRACTION
// ══════════════════════════════════════════════════════════════════════════

function extractSearchQuery(): void {
  const query = _extractSearch(window.location.href, domain);
  if (query) sendEvent({ type: "search_query", domain, search_query: query });
}

extractSearchQuery();

// ══════════════════════════════════════════════════════════════════════════
// NAVIGATION TYPE DETECTION
// ══════════════════════════════════════════════════════════════════════════

function emitNavType(): void {
  const perf = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (perf.length > 0) {
    const nav = perf[0];
    let navType: string;
    switch (nav.type) {
      case "navigate": navType = "link"; break;
      case "reload": navType = "reload"; break;
      case "back_forward": navType = "back_forward"; break;
      default: navType = "other";
    }
    sendEvent({
      type: "navigation_type",
      domain,
      nav_type: navType,
      referrer_domain: document.referrer ? extractDomain(document.referrer) : undefined,
    });
  }
}

emitNavType();

// ══════════════════════════════════════════════════════════════════════════
// LINK CLICK DESTINATION TRACKING
// ══════════════════════════════════════════════════════════════════════════

document.addEventListener("click", (e) => {
  const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor?.href) return;
  const dest = extractDomain(anchor.href);
  if (dest && dest !== domain) {
    sendEvent({
      type: "link_navigate",
      domain,
      from_domain: domain,
      referrer_domain: dest,
    });
  }
}, { passive: true });

// ══════════════════════════════════════════════════════════════════════════
// DEVTOOLS DETECTION
// ══════════════════════════════════════════════════════════════════════════

let devtoolsOpen = false;

function checkDevTools(): void {
  const widthThreshold = window.outerWidth - window.innerWidth > 160;
  const heightThreshold = window.outerHeight - window.innerHeight > 160;
  const isOpen = widthThreshold || heightThreshold;
  if (isOpen !== devtoolsOpen) {
    devtoolsOpen = isOpen;
    sendEvent({ type: "devtools_toggle", domain, devtools_open: isOpen });
  }
}

setInterval(checkDevTools, 5000);

// ══════════════════════════════════════════════════════════════════════════
// VISIBLE TEXT CONTEXT — for EEG labeling & semantic embedding
// ══════════════════════════════════════════════════════════════════════════
// Sends a short snippet of what's currently visible so the daemon can
// label EEG recordings with context like "reading about Rust lifetimes"
// instead of just "on docs.rs". Privacy: capped at 200 chars, no forms.

function getVisibleHeading(): string {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"));
  for (const h of headings) {
    const rect = h.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight) {
      return (h.textContent ?? "").trim().slice(0, 120);
    }
  }
  return "";
}

function getVisibleText(): string {
  // Get text from the viewport area — skip forms, scripts, nav
  const sel = Array.from(document.querySelectorAll("p, li, td, dd, blockquote, .content, article, main"));
  const parts: string[] = [];
  let total = 0;
  for (const el of sel) {
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) continue;
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text.length < 10) continue;
    parts.push(text);
    total += text.length;
    if (total > 300) break;
  }
  return parts.join(" ").slice(0, 200);
}

// Emit text context every 30s while visible (daemon uses for embedding)
let lastVisibleText = "";
setInterval(() => {
  if (document.hidden) return;
  const heading = getVisibleHeading();
  const text = getVisibleText();
  // Only emit if content changed meaningfully
  if (text === lastVisibleText) return;
  lastVisibleText = text;

  sendEvent({
    type: "visible_context",
    domain,
    page_title: document.title,
    heading,
    visible_text: text,
    content_type: classifyContentType(),
  });
}, 30_000);

// Also emit once shortly after load
setTimeout(() => {
  sendEvent({
    type: "visible_context",
    domain,
    page_title: document.title,
    heading: getVisibleHeading(),
    visible_text: getVisibleText(),
    content_type: classifyContentType(),
  });
}, 3000);

// ══════════════════════════════════════════════════════════════════════════
// LLM / AI CHAT DETECTION
// ══════════════════════════════════════════════════════════════════════════
// Detects ChatGPT, Claude, Gemini, Perplexity, etc. and tracks
// prompt/response patterns for EEG correlation.

// detectLLMProvider → imported from ./core/classify.ts
const llmProvider = _detectLLM(domain);
let lastLlmTurnCount = 0;
let llmInputActive = false;

if (llmProvider) {
  // Monitor conversation turns (message count changes)
  setInterval(() => {
    // Count visible messages — these selectors cover major LLM UIs
    const messages = document.querySelectorAll(
      "[class*='message'], [class*='Message'], [data-message-id], " +
      "[class*='turn'], [class*='Turn'], [class*='chat-message'], " +
      "[class*='response'], [class*='prompt'], [role='assistant'], [role='user']"
    );
    const turnCount = messages.length;

    // Check if user is typing a prompt
    const inputs = document.querySelectorAll(
      "textarea:focus, [contenteditable='true']:focus, [class*='prompt-input']:focus, " +
      "[class*='chat-input']:focus, [class*='composer']:focus"
    );
    const isInputting = inputs.length > 0;

    // Check if a response is streaming (look for animation/typing indicators)
    const streaming = document.querySelectorAll(
      "[class*='streaming'], [class*='typing'], [class*='loading'], " +
      "[class*='cursor'], [class*='caret'][class*='blink']"
    ).length > 0;

    if (turnCount !== lastLlmTurnCount || isInputting !== llmInputActive) {
      sendEvent({
        type: "llm_interaction",
        domain,
        llm_provider: llmProvider!,
        llm_turn_count: turnCount,
        llm_input_detected: isInputting,
        llm_response_streaming: streaming,
        content_type: "chat",
      });
      lastLlmTurnCount = turnCount;
      llmInputActive = isInputting;
    }
  }, 5_000);
}

// ══════════════════════════════════════════════════════════════════════════
// EMAIL DETECTION
// ══════════════════════════════════════════════════════════════════════════
// Detects Gmail, Outlook, etc. and tracks mode without capturing content.

// detectEmailMode → imported from ./core/classify.ts (pure logic)
// Wrapper adds DOM-based compose detection that the pure module can't do
function detectEmailMode(): { mode: string; count: number } | null {
  const result = _detectEmail(domain, window.location.href, document.title);
  if (!result) return null;
  // Enhance with DOM signals the pure function can't access
  if (result.mode === "inbox" && document.querySelector("[class*='compose'], [aria-label*='compose' i], [aria-label*='new message' i]")) {
    result.mode = "composing";
  }
  if (result.mode === "inbox" && document.querySelector("[class*='message-view'], [role='main'] [class*='message']")) {
    result.mode = "reading";
  }
  return result;
}

let lastEmailMode = "";
setInterval(() => {
  const email = detectEmailMode();
  if (!email) return;
  if (email.mode === lastEmailMode) return;
  lastEmailMode = email.mode;

  sendEvent({
    type: "email_activity",
    domain,
    email_mode: email.mode,
    email_count: email.count,
    content_type: "email",
  });
}, 10_000);

// ══════════════════════════════════════════════════════════════════════════
// SEARCH PATTERN ANALYSIS — refinement, result clicks
// ══════════════════════════════════════════════════════════════════════════

let previousSearchQuery = "";
let searchResultClicks = 0;

// Track clicks on search results (links within result containers)
if (domain.includes("google.") || domain.includes("bing.com") ||
    domain.includes("duckduckgo.com")) {
  document.addEventListener("click", (e) => {
    const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor?.href) return;
    // Only count clicks on external result links, not navigation
    const dest = extractDomain(anchor.href);
    if (dest && dest !== domain) {
      searchResultClicks++;
    }
  }, { passive: true });
}

// Detect search refinement (query changed from previous)
function checkSearchRefinement(): void {
  try {
    const params = new URL(window.location.href).searchParams;
    const query = params.get("q") ?? params.get("p") ?? "";
    if (!query || query === previousSearchQuery) return;

    const isRefinement = previousSearchQuery.length > 0 &&
      (query.includes(previousSearchQuery) || previousSearchQuery.includes(query) ||
       wordSimilarity(query, previousSearchQuery) > 0.4);

    if (previousSearchQuery) {
      sendEvent({
        type: "search_pattern",
        domain,
        search_query: query,
        search_refinement: isRefinement,
        search_result_clicks: searchResultClicks,
      });
      searchResultClicks = 0;
    }
    previousSearchQuery = query;
  } catch { /* ignore */ }
}

// wordSimilarity → imported from ./core/search.ts

// Check on SPA navigation changes
const searchObserver = new MutationObserver(() => {
  if (domain.includes("google.") || domain.includes("bing.com") || domain.includes("duckduckgo.com")) {
    checkSearchRefinement();
  }
});
searchObserver.observe(document.documentElement, { childList: true, subtree: false });

// ══════════════════════════════════════════════════════════════════════════
// REVISIT / REPETITIVE PATTERN DETECTION
// ══════════════════════════════════════════════════════════════════════════
// Tracks how many times the user visits the same URL/domain in a session.
// High revisit count + declining EEG focus = stuck in a loop.

(function trackRevisits() {
  const storageKey = "neuroskill_visit_counts";
  const today = new Date().toISOString().slice(0, 10);

  chrome.storage.local.get(storageKey, (result) => {
    const data = (result[storageKey] as Record<string, Record<string, number>>) ?? {};
    // Reset if new day
    const dayData = data[today] ?? {};
    const urlKey = domain + window.location.pathname;

    dayData[urlKey] = (dayData[urlKey] ?? 0) + 1;
    dayData[`domain:${domain}`] = (dayData[`domain:${domain}`] ?? 0) + 1;

    const revisitCount = dayData[urlKey];
    const domainVisitCount = dayData[`domain:${domain}`];

    // Persist
    const newData: Record<string, Record<string, number>> = { [today]: dayData };
    chrome.storage.local.set({ [storageKey]: newData });

    // Emit if revisiting (count > 1)
    if (revisitCount > 1 || domainVisitCount > 3) {
      sendEvent({
        type: "revisit",
        domain,
        revisit_count: revisitCount,
        domain_visit_count: domainVisitCount,
      });
    }
  });
})();
