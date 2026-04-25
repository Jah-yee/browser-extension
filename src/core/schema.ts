// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Centralized event schema — single source of truth for browser events.
// Every event type has an explicit interface with only the fields it uses.
// The daemon's insert_browser_activity_json() extracts these exact fields.

// ══════════════════════════════════════════════════════════════════════════
// Base fields present on all events
// ══════════════════════════════════════════════════════════════════════════

interface BaseEvent {
  type: string;
  domain: string;
  category?: string;
}

// ══════════════════════════════════════════════════════════════════════════
// Tab & Window events (from background EventCollector)
// ══════════════════════════════════════════════════════════════════════════

export interface TabSwitchEvent extends BaseEvent {
  type: "tab_switch";
  url?: string;
  title?: string;
  tab_id?: number;
  tab_count?: number;
}

export interface TabOpenEvent extends BaseEvent {
  type: "tab_open";
  url?: string;
  title?: string;
  tab_id?: number;
  tab_count?: number;
}

export interface TabCloseEvent extends BaseEvent {
  type: "tab_close";
  tab_count?: number;
}

export interface PageLoadEvent extends BaseEvent {
  type: "page_load";
  url?: string;
  title?: string;
  tab_id?: number;
  tab_count?: number;
}

export interface WindowFocusEvent extends BaseEvent {
  type: "window_focus";
}

export interface WindowBlurEvent extends BaseEvent {
  type: "window_blur";
}

export interface TabSnapshotEvent extends BaseEvent {
  type: "tab_snapshot";
  tab_count: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Navigation events
// ══════════════════════════════════════════════════════════════════════════

export type NavType = "link" | "typed" | "reload" | "back_forward" | "bookmark" | "other";

export interface NavigationEvent extends BaseEvent {
  type: "navigation";
  url?: string;
  tab_id?: number;
}

export interface NavigationCommittedEvent extends BaseEvent {
  type: "navigation_committed";
  url?: string;
  tab_id?: number;
  nav_type: NavType;
}

export interface NavigationTypeEvent extends BaseEvent {
  type: "navigation_type";
  nav_type: NavType;
  referrer_domain?: string;
}

export interface LinkNavigateEvent extends BaseEvent {
  type: "link_navigate";
  referrer_domain: string;
}

// ══════════════════════════════════════════════════════════════════════════
// Scroll & Reading events (from content script)
// ══════════════════════════════════════════════════════════════════════════

export type ScrollDirection = "up" | "down" | "mixed";

export interface ScrollEvent extends BaseEvent {
  type: "scroll";
  scroll_depth: number;
  scroll_speed: number;
  scroll_direction: ScrollDirection;
  scroll_reversals: number;
}

export interface ReadingTimeEvent extends BaseEvent {
  type: "reading_time";
  reading_time_secs: number;
  active_time_secs: number;
  idle_time_secs: number;
  scroll_depth: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Mouse & Click events
// ══════════════════════════════════════════════════════════════════════════

export type ClickTarget = "link" | "button" | "form" | "media" | "image" | "other";

export interface MouseActivityEvent extends BaseEvent {
  type: "mouse_activity";
  mouse_distance: number;
  mouse_idle_secs: number;
  clicks_per_min: number;
}

export interface ClickEvent extends BaseEvent {
  type: "click";
  click_target: ClickTarget;
  click_x: number;
  click_y: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Input & Form events
// ══════════════════════════════════════════════════════════════════════════

export interface TypingDetectedEvent extends BaseEvent {
  type: "typing_detected";
  typing_detected: true;
}

export interface FormSubmitEvent extends BaseEvent {
  type: "form_submit";
  form_count: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Clipboard events
// ══════════════════════════════════════════════════════════════════════════

export interface ClipboardCopyEvent extends BaseEvent {
  type: "clipboard_copy";
}

export interface ClipboardPasteEvent extends BaseEvent {
  type: "clipboard_paste";
  paste_length: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Media & Video events
// ══════════════════════════════════════════════════════════════════════════

export interface MediaStateEvent extends BaseEvent {
  type: "media_state";
  media_playing: boolean;
  has_video: boolean;
  has_audio: boolean;
  video_duration_secs?: number;
  video_watched_secs?: number;
  video_playback_rate?: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Page Content events
// ══════════════════════════════════════════════════════════════════════════

export type ContentType =
  | "video" | "image" | "text" | "paper" | "social"
  | "code" | "chat" | "email" | "shopping" | "news";

export interface PageProfileEvent extends BaseEvent {
  type: "page_profile";
  content_type: ContentType;
  has_video: boolean;
  has_audio: boolean;
  image_count: number;
  word_count: number;
  form_count: number;
}

export interface VisibleContextEvent extends BaseEvent {
  type: "visible_context";
  page_title: string;
  heading: string;
  visible_text: string;
  content_type: ContentType;
}

// ══════════════════════════════════════════════════════════════════════════
// Search events
// ══════════════════════════════════════════════════════════════════════════

export interface SearchQueryEvent extends BaseEvent {
  type: "search_query";
  search_query: string;
}

export interface SearchPatternEvent extends BaseEvent {
  type: "search_pattern";
  search_query: string;
  search_refinement: boolean;
  search_result_clicks: number;
}

// ══════════════════════════════════════════════════════════════════════════
// LLM / AI Chat events
// ══════════════════════════════════════════════════════════════════════════

export type LlmProvider =
  | "chatgpt" | "claude" | "gemini" | "perplexity" | "copilot"
  | "poe" | "you" | "phind" | "huggingface" | "pi" | "character" | "cohere";

export interface LlmInteractionEvent extends BaseEvent {
  type: "llm_interaction";
  llm_provider: LlmProvider;
  llm_turn_count: number;
  llm_input_detected: boolean;
  llm_response_streaming: boolean;
  content_type: "chat";
}

// ══════════════════════════════════════════════════════════════════════════
// Email events
// ══════════════════════════════════════════════════════════════════════════

export type EmailMode = "inbox" | "reading" | "composing" | "searching";

export interface EmailActivityEvent extends BaseEvent {
  type: "email_activity";
  email_mode: EmailMode;
  email_count: number;
  content_type: "email";
}

// ══════════════════════════════════════════════════════════════════════════
// Bookmarks & Downloads
// ══════════════════════════════════════════════════════════════════════════

export interface BookmarkCreatedEvent extends BaseEvent {
  type: "bookmark_created";
  url?: string;
  title?: string;
}

export interface DownloadStartedEvent extends BaseEvent {
  type: "download_started";
  url?: string;
  download_type: string;
}

// ══════════════════════════════════════════════════════════════════════════
// Browser State events
// ══════════════════════════════════════════════════════════════════════════

export interface DevtoolsToggleEvent extends BaseEvent {
  type: "devtools_toggle";
  devtools_open: boolean;
}

export interface RevisitEvent extends BaseEvent {
  type: "revisit";
  revisit_count: number;
  domain_visit_count: number;
}

export interface EnvContextEvent extends BaseEvent {
  type: "env_context";
  title: string; // OS platform
}

// ══════════════════════════════════════════════════════════════════════════
// Discriminated Union — THE type used everywhere
// ══════════════════════════════════════════════════════════════════════════

export type BrowserEvent =
  | TabSwitchEvent | TabOpenEvent | TabCloseEvent | PageLoadEvent
  | WindowFocusEvent | WindowBlurEvent | TabSnapshotEvent
  | NavigationEvent | NavigationCommittedEvent | NavigationTypeEvent | LinkNavigateEvent
  | ScrollEvent | ReadingTimeEvent
  | MouseActivityEvent | ClickEvent
  | TypingDetectedEvent | FormSubmitEvent
  | ClipboardCopyEvent | ClipboardPasteEvent
  | MediaStateEvent
  | PageProfileEvent | VisibleContextEvent
  | SearchQueryEvent | SearchPatternEvent
  | LlmInteractionEvent
  | EmailActivityEvent
  | BookmarkCreatedEvent | DownloadStartedEvent
  | DevtoolsToggleEvent | RevisitEvent | EnvContextEvent;

// ══════════════════════════════════════════════════════════════════════════
// All event type string literals
// ══════════════════════════════════════════════════════════════════════════

export const EVENT_TYPES = [
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
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ══════════════════════════════════════════════════════════════════════════
// Database column names — must match Rust DDL exactly
// ══════════════════════════════════════════════════════════════════════════

export const DB_COLUMNS = [
  "event_type", "url", "domain", "title", "tab_id", "browser_name",
  "scroll_depth", "scroll_speed", "scroll_direction", "scroll_reversals",
  "reading_time_secs", "active_time_secs", "idle_time_secs",
  "typing_detected", "media_playing",
  "search_query", "tab_count", "devtools_open",
  "category", "content_type", "referrer_domain", "nav_type",
  "click_target", "click_count", "mouse_distance", "mouse_idle_secs",
  "has_video", "has_audio", "image_count", "word_count", "form_count",
  "video_watched_secs", "video_playback_rate",
  "copy_length", "paste_length",
  "llm_provider", "llm_turn_count",
  "email_mode", "email_count",
  "revisit_count", "domain_visit_count",
  "visible_text", "heading", "page_title",
  "download_type",
  "at", "eeg_focus", "eeg_mood",
] as const;

export type DbColumn = (typeof DB_COLUMNS)[number];

/** Message from content script to background service worker. */
export interface ContentMessage {
  type: "content_event";
  payload: BrowserEvent;
}
