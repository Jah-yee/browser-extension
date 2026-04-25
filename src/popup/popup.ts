// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com

import type { BrainState } from "../core/types";

interface StatusResponse {
  connected: boolean;
  eventsSent: number;
  brain: BrainState | null;
}

const $ = (id: string) => document.getElementById(id)!;

async function updateUI(): Promise<void> {
  const response: StatusResponse = await chrome.runtime.sendMessage({
    type: "get_status",
  });

  // Connection status
  const statusEl = $("connection-status");
  const statusText = $("status-text");
  if (response.connected) {
    statusEl.className = "status connected";
    statusText.textContent = "Connected";
  } else {
    statusEl.className = "status disconnected";
    statusText.textContent = "Disconnected";
  }

  // Events count
  $("events-count").textContent = String(response.eventsSent);

  // Brain state
  const brain = response.brain;
  const brainSection = $("brain-section");

  if (brain && (brain.flow || brain.fatigue || brain.streak || brain.taskType)) {
    brainSection.classList.remove("hidden");

    // Flow
    const flowCard = $("flow-card");
    const flowValue = $("flow-value");
    if (brain.flow?.in_flow) {
      const mins = Math.floor(brain.flow.duration_secs / 60);
      flowValue.textContent = `${mins}m`;
      flowCard.className = "brain-card in-flow";
    } else if (brain.flow) {
      flowValue.textContent = `${brain.flow.score.toFixed(0)}`;
      flowCard.className = "brain-card";
    }

    // Fatigue
    const fatigueCard = $("fatigue-card");
    const fatigueValue = $("fatigue-value");
    if (brain.fatigue?.fatigued) {
      fatigueValue.textContent = "Low";
      fatigueCard.className = "brain-card fatigued";
    } else {
      fatigueValue.textContent = "Good";
      fatigueCard.className = "brain-card";
    }

    // Streak
    const streakValue = $("streak-value");
    if (brain.streak && brain.streak.current_streak_days > 0) {
      streakValue.textContent = `${brain.streak.current_streak_days}d`;
    } else {
      streakValue.textContent = "0d";
    }

    // Task type
    const taskValue = $("task-value");
    if (brain.taskType?.task_type) {
      const labels: Record<string, string> = {
        coding: "Code",
        debugging: "Debug",
        reviewing: "Review",
        refactoring: "Refactor",
        testing: "Test",
        reading_docs: "Docs",
      };
      taskValue.textContent =
        labels[brain.taskType.task_type] ?? brain.taskType.task_type;
    }
  } else {
    brainSection.classList.add("hidden");
  }
}

// Reconnect button
$("reconnect-btn").addEventListener("click", async () => {
  $("reconnect-btn").textContent = "...";
  await chrome.runtime.sendMessage({ type: "reconnect" });
  await updateUI();
  $("reconnect-btn").textContent = "Reconnect";
});

// Options button
$("options-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Initial load + periodic refresh
updateUI();
setInterval(updateUI, 5000);
