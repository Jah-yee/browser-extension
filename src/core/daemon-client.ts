// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com

import { discoverDaemonPort, getBrowserEventsUrl, resetDiscoveredPort } from "./config";
import type { BrowserConfig, BrowserEvent } from "./types";

export interface DaemonStatus {
  connected: boolean;
  eventsSent: number;
}

let connected = false;
let eventsSent = 0;

export function getDaemonStatus(): DaemonStatus {
  return { connected, eventsSent };
}

/** Send a batch of browser events to the daemon. */
export async function sendBatch(
  config: BrowserConfig,
  events: BrowserEvent[],
): Promise<boolean> {
  if (events.length === 0) return true;

  const port = await discoverDaemonPort(config);
  const url = getBrowserEventsUrl(config, port);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(events),
      signal: AbortSignal.timeout(3000),
    });

    if (resp.ok) {
      connected = true;
      eventsSent += events.length;
      return true;
    } else if (resp.status === 401) {
      // Daemon is there, auth issue — still consider connected
      connected = true;
      return false;
    }
    return false;
  } catch {
    connected = false;
    resetDiscoveredPort();
    return false;
  }
}

/** Fetch JSON from a daemon brain endpoint. */
export async function brainGet<T>(
  config: BrowserConfig,
  path: string,
  body?: Record<string, unknown>,
): Promise<T | null> {
  const port = await discoverDaemonPort(config);
  const base = `http://${config.daemonHost}:${port}/v1`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  }

  try {
    const resp = body
      ? await fetch(`${base}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(3000),
        })
      : await fetch(`${base}${path}`, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

/** Quick health check — verify daemon is reachable. */
export async function checkConnection(config: BrowserConfig): Promise<boolean> {
  const port = await discoverDaemonPort(config);
  const headers: Record<string, string> = {};
  if (config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  }
  try {
    const resp = await fetch(
      `http://${config.daemonHost}:${port}/v1/activity/current-window`,
      { headers, signal: AbortSignal.timeout(3000) },
    );
    connected = resp.ok || resp.status === 401;
    return connected;
  } catch {
    connected = false;
    return false;
  }
}
