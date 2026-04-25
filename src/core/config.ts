// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com

import { DEFAULT_CONFIG, type BrowserConfig } from "./types";

const STORAGE_KEY = "neuroskill_config";

/** Load config from browser extension storage, merging with defaults. */
export async function loadConfig(): Promise<BrowserConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as Partial<BrowserConfig> | undefined;
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Persist config to browser extension storage. */
export async function saveConfig(config: BrowserConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}

/** Try production port (18444), then dev port (18445). Cache the result. */
let discoveredPort: number | null = null;

export async function discoverDaemonPort(config: BrowserConfig): Promise<number> {
  if (config.daemonPort > 0) return config.daemonPort;
  if (discoveredPort) return discoveredPort;

  const candidates = [18444, 18445];
  for (const port of candidates) {
    try {
      const resp = await fetch(
        `http://${config.daemonHost}:${port}/v1/activity/current-window`,
        { signal: AbortSignal.timeout(1500) },
      );
      // Even 401 means the daemon is there.
      if (resp.status < 500) {
        discoveredPort = port;
        return port;
      }
    } catch {
      // not listening
    }
  }
  discoveredPort = 18444;
  return 18444;
}

/** Reset cached port — triggers re-discovery on next call. */
export function resetDiscoveredPort(): void {
  discoveredPort = null;
}

export function getBrowserEventsUrl(config: BrowserConfig, port: number): string {
  return `http://${config.daemonHost}:${port}/v1/activity/browser-events`;
}
