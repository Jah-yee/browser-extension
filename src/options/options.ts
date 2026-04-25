// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com

import { loadConfig, saveConfig } from "../core/config";
import { checkConnection } from "../core/daemon-client";
import type { BrowserConfig, PrivacyMode } from "../core/types";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $input = (id: string) => document.getElementById(id) as HTMLInputElement;
const $select = (id: string) => document.getElementById(id) as HTMLSelectElement;
const $textarea = (id: string) => document.getElementById(id) as HTMLTextAreaElement;

async function populateForm(): Promise<void> {
  const config = await loadConfig();

  $input("auth-token").value = config.authToken;
  $input("daemon-host").value = config.daemonHost;
  $input("daemon-port").value = String(config.daemonPort);
  $select("privacy-mode").value = config.privacyMode;
  $input("incognito-tracking").checked = config.incognitoTracking;
  $input("track-scroll").checked = config.trackScrollDepth;
  $input("track-reading").checked = config.trackReadingPatterns;
  $input("track-form").checked = config.trackFormActivity;
  $input("track-media").checked = config.trackMediaState;
  $input("track-search").checked = config.trackSearchQueries;
  $textarea("blocklist").value = config.domainBlocklist.join("\n");
  $textarea("allowlist").value = config.domainAllowlist.join("\n");
  $input("batch-interval").value = String(config.batchIntervalMs);
  $input("enabled").checked = config.enabled;
}

function readForm(): BrowserConfig {
  const parseDomainList = (text: string): string[] =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  return {
    authToken: $input("auth-token").value.trim(),
    daemonHost: $input("daemon-host").value.trim() || "127.0.0.1",
    daemonPort: parseInt($input("daemon-port").value, 10) || 0,
    privacyMode: $select("privacy-mode").value as PrivacyMode,
    incognitoTracking: $input("incognito-tracking").checked,
    trackScrollDepth: $input("track-scroll").checked,
    trackReadingPatterns: $input("track-reading").checked,
    trackFormActivity: $input("track-form").checked,
    trackMediaState: $input("track-media").checked,
    trackSearchQueries: $input("track-search").checked,
    domainBlocklist: parseDomainList($textarea("blocklist").value),
    domainAllowlist: parseDomainList($textarea("allowlist").value),
    batchIntervalMs: parseInt($input("batch-interval").value, 10) || 2000,
    enabled: $input("enabled").checked,
  };
}

// Paste button — read from clipboard
$("paste-btn")!.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    $input("auth-token").value = text.trim();
    $("token-status")!.textContent = "Token pasted";
    $("token-status")!.className = "hint success";
  } catch {
    $("token-status")!.textContent = "Clipboard access denied";
    $("token-status")!.className = "hint error";
  }
});

// Test button — verify connection with current token
$("test-btn")!.addEventListener("click", async () => {
  const config = readForm();
  $("token-status")!.textContent = "Testing...";
  $("token-status")!.className = "hint";

  const ok = await checkConnection(config);
  if (ok) {
    $("token-status")!.textContent = "Connected successfully";
    $("token-status")!.className = "hint success";
  } else {
    $("token-status")!.textContent = "Could not connect — is the daemon running?";
    $("token-status")!.className = "hint error";
  }
});

// Save button
$("save-btn")!.addEventListener("click", async () => {
  const config = readForm();
  await saveConfig(config);

  // Notify background to reinitialize
  chrome.runtime.sendMessage({ type: "config_updated" });

  const status = $("save-status")!;
  status.textContent = "Saved";
  status.className = "hint success";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});

// Load on page open
populateForm();
