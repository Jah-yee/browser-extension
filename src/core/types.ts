// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Re-exports BrowserEvent from the centralized schema (single source of truth).
// Config and brain state types remain here — they aren't event types.

// ── Event types (from schema.ts) ────────────────────────────────────────────
// Strict union — use for validation, tests, and type-safe event construction.
export type { BrowserEvent as StrictBrowserEvent, ContentMessage as StrictContentMessage, EventType, ContentType, LlmProvider, EmailMode } from "./schema";
export { EVENT_TYPES, DB_COLUMNS } from "./schema";

// Loose payload type — used at runtime by content.ts and events.ts where
// events are built dynamically from DOM signals. The daemon's JSON extractor
// handles any missing fields gracefully.
export interface BrowserEvent {
  type: string;
  domain?: string;
  url?: string;
  title?: string;
  category?: string;
  [key: string]: unknown;
}

export interface ContentMessage {
  type: "content_event";
  payload: BrowserEvent;
}

// ── Privacy ─────────────────────────────────────────────────────────────────
export type PrivacyMode = "domain_only" | "full_url" | "title_and_domain";

// ── Extension config ────────────────────────────────────────────────────────
export interface BrowserConfig {
  enabled: boolean;
  daemonHost: string;
  daemonPort: number; // 0 = autodiscover
  batchIntervalMs: number;
  privacyMode: PrivacyMode;
  trackScrollDepth: boolean;
  trackReadingPatterns: boolean;
  trackSearchQueries: boolean;
  trackFormActivity: boolean;
  trackMediaState: boolean;
  domainBlocklist: string[];
  domainAllowlist: string[];
  incognitoTracking: boolean;
  authToken: string;
}

export const DEFAULT_CONFIG: BrowserConfig = {
  enabled: true,
  daemonHost: "127.0.0.1",
  daemonPort: 0,
  batchIntervalMs: 2000,
  privacyMode: "domain_only",
  trackScrollDepth: true,
  trackReadingPatterns: true,
  trackSearchQueries: false,
  trackFormActivity: true,
  trackMediaState: true,
  domainBlocklist: [],
  domainAllowlist: [],
  incognitoTracking: false,
  authToken: "",
};

// ── Brain state types (used by BrainMonitor + popup) ────────────────────────
export interface FlowState {
  in_flow: boolean;
  score: number;
  duration_secs: number;
  avg_focus: number | null;
  file_switches: number;
  edit_velocity: number;
}

export interface FatigueAlert {
  fatigued: boolean;
  focus_decline_pct: number;
  continuous_work_mins: number;
  suggestion: string;
}

export interface DeepWorkStreak {
  current_streak_days: number;
  today_deep_mins: number;
  today_qualifies: boolean;
}

export interface TaskType {
  task_type: string;
  confidence: number;
}

export interface StruggleState {
  struggling: boolean;
  score: number;
  suggestion: string;
}

export interface BrainState {
  flow: FlowState | null;
  fatigue: FatigueAlert | null;
  streak: DeepWorkStreak | null;
  taskType: TaskType | null;
  struggle: StruggleState | null;
}
