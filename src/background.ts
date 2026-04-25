// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Background service worker — entry point for the browser extension.
// Mirrors the lifecycle in extensions/vscode/src/extension.ts:
// 1. Load config
// 2. Start EventCollector
// 3. Start BrainMonitor
// 4. Flush events on a timer

import { loadConfig } from "./core/config";
import { EventCollector } from "./core/events";
import { BrainMonitor } from "./core/brain";
import { sendBatch, checkConnection, getDaemonStatus } from "./core/daemon-client";
import type { BrowserConfig } from "./core/types";

let collector: EventCollector | undefined;
let brainMonitor: BrainMonitor | undefined;
let flushAlarm = false;

async function initialize(): Promise<void> {
  const config = await loadConfig();
  if (!config.enabled) return;

  // Start event collector
  collector = new EventCollector(config);
  collector.start();

  // Start brain monitor
  brainMonitor = new BrainMonitor(config);
  brainMonitor.start();

  // Use chrome.alarms for reliable periodic flush (survives service worker suspension)
  if (!flushAlarm) {
    chrome.alarms.create("neuroskill-flush", {
      periodInMinutes: config.batchIntervalMs / 60000,
    });
    flushAlarm = true;
  }

  // Also flush on a setInterval for faster batching when service worker is alive
  setInterval(() => flush(config), config.batchIntervalMs);

  // Initial connection check
  await checkConnection(config);
}

async function flush(config: BrowserConfig): Promise<void> {
  if (!collector) return;
  const events = collector.drain();
  if (events.length === 0) return;
  await sendBatch(config, events);
}

// ── Service worker lifecycle ─────────────────────────────────────────

// Initialize on install and on startup
chrome.runtime.onInstalled.addListener(() => {
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  initialize();
});

// Handle alarm-based flush (reliable even after service worker suspension)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "neuroskill-flush") {
    const config = await loadConfig();
    await flush(config);
  }
});

// Handle messages from popup / options page
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get_status") {
    const status = getDaemonStatus();
    const brain = brainMonitor?.state ?? null;
    sendResponse({ ...status, brain });
    return;
  }

  if (message.type === "reconnect") {
    loadConfig().then(async (config) => {
      const ok = await checkConnection(config);
      sendResponse({ connected: ok });
    });
    return true; // keep channel open for async response
  }

  if (message.type === "config_updated") {
    // Reinitialize with new config
    if (brainMonitor) brainMonitor.stop();
    initialize();
    sendResponse({ ok: true });
    return;
  }

  // Forward content script events (already handled in EventCollector.listenContentMessages)
});

// Initialize immediately (service worker may start without install/startup events)
initialize();
