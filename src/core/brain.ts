// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// BrainMonitor — polls brain state from the daemon every 30s.
// Mirrors extensions/vscode/src/brain.ts but uses browser badge/popup
// instead of VS Code StatusBarItem.

import { brainGet } from "./daemon-client";
import type {
  BrowserConfig,
  BrainState,
  FlowState,
  FatigueAlert,
  DeepWorkStreak,
  TaskType,
  StruggleState,
} from "./types";

interface DistractionScore {
  score: number;
  suggestion: string;
  tab_switches_per_min: number;
  social_pct: number;
}

interface ProcrastinationScore {
  score: number;
  procrastinating: boolean;
  suggestion: string;
}

export class BrainMonitor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastFatigueAlert = 0;
  private lastStruggleAlert = 0;
  private lastDistractionAlert = 0;
  private lastProcrastinationAlert = 0;
  private _distraction: DistractionScore | null = null;
  private _procrastination: ProcrastinationScore | null = null;
  private _state: BrainState = {
    flow: null,
    fatigue: null,
    streak: null,
    taskType: null,
    struggle: null,
  };

  constructor(private config: BrowserConfig) {}

  get state(): BrainState {
    return this._state;
  }

  start(): void {
    this.update(); // immediate first poll
    this.timer = setInterval(() => this.update(), 30_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async update(): Promise<void> {
    const [flow, fatigue, streak, taskType, struggle, distraction, procrastination] =
      await Promise.allSettled([
        brainGet<FlowState>(this.config, "/brain/flow-state", {
          windowSecs: 300,
        }),
        brainGet<FatigueAlert>(this.config, "/brain/fatigue"),
        brainGet<DeepWorkStreak>(this.config, "/brain/streak", {
          minDeepWorkMins: 60,
        }),
        brainGet<TaskType>(this.config, "/brain/task-type", {
          windowSecs: 300,
        }),
        brainGet<StruggleState>(this.config, "/brain/struggle-predict", {
          windowSecs: 600,
        }),
        brainGet<DistractionScore>(this.config, "/brain/browser-distraction", {
          windowSecs: 300,
        }),
        brainGet<ProcrastinationScore>(this.config, "/brain/browser-procrastination", {
          windowSecs: 600,
        }),
      ]);

    this._state = {
      flow: flow.status === "fulfilled" ? flow.value : null,
      fatigue: fatigue.status === "fulfilled" ? fatigue.value : null,
      streak: streak.status === "fulfilled" ? streak.value : null,
      taskType: taskType.status === "fulfilled" ? taskType.value : null,
      struggle: struggle.status === "fulfilled" ? struggle.value : null,
    };
    this._distraction = distraction.status === "fulfilled" ? distraction.value : null;
    this._procrastination = procrastination.status === "fulfilled" ? procrastination.value : null;

    this.updateBadge();
    this.checkNotifications();
  }

  private updateBadge(): void {
    const { flow, fatigue, struggle } = this._state;

    // Badge text — compact summary
    let text = "";
    let color = "#888888"; // default grey

    if (flow?.in_flow) {
      const mins = Math.floor(flow.duration_secs / 60);
      text = `${mins}m`;
      color = "#4CAF50"; // green
    } else if (this._procrastination?.procrastinating) {
      text = "Z";
      color = "#9C27B0"; // purple
    } else if (this._distraction && this._distraction.score > 70) {
      text = "D";
      color = "#FF9800"; // orange
    } else if (struggle?.struggling) {
      text = "!";
      color = "#FF5722"; // red-orange
    } else if (fatigue?.fatigued) {
      text = "~";
      color = "#FFC107"; // yellow
    }

    try {
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color });
    } catch {
      // action API may not be available during startup
    }
  }

  private checkNotifications(): void {
    const now = Date.now();
    const { fatigue, struggle } = this._state;

    // Fatigue notification (max once per 30 min)
    if (fatigue?.fatigued && now - this.lastFatigueAlert > 30 * 60 * 1000) {
      this.lastFatigueAlert = now;
      this.notify("neuroskill-fatigue", "NeuroSkill: Take a Break", fatigue.suggestion);
    }

    // Struggle notification (max once per 10 min)
    if (struggle?.struggling && struggle.score > 70 && now - this.lastStruggleAlert > 10 * 60 * 1000) {
      this.lastStruggleAlert = now;
      this.notify("neuroskill-struggle", "NeuroSkill: You Might Be Stuck", struggle.suggestion);
    }

    // Distraction notification (max once per 15 min)
    if (this._distraction && this._distraction.score > 70 && now - this.lastDistractionAlert > 15 * 60 * 1000) {
      this.lastDistractionAlert = now;
      this.notify("neuroskill-distraction", "NeuroSkill: High Distraction", this._distraction.suggestion);
    }

    // Procrastination notification (max once per 20 min)
    if (this._procrastination?.procrastinating && now - this.lastProcrastinationAlert > 20 * 60 * 1000) {
      this.lastProcrastinationAlert = now;
      this.notify("neuroskill-procrastination", "NeuroSkill: Procrastination Detected", this._procrastination.suggestion);
    }
  }

  private notify(id: string, title: string, message: string): void {
    try {
      chrome.notifications.create(id, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title,
        message,
      });
    } catch { /* notifications may not be available */ }
  }
}
