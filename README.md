# NeuroSkill™ for the Browser

**An attention-instrumentation layer for the web. Records how you browse, infers a documented attention signal, optionally correlates it with EEG band powers.** See "What this is, and isn't" below for more.

> ⚠️ **Research tool only — not a medical device.**
> NeuroSkill is open-source software for exploratory research on attention and EEG. It is **not** cleared or approved by the FDA, CE, or any regulatory body. It must not be used for clinical diagnosis, treatment decisions, or any medical purpose. All metrics are experimental research outputs — not validated clinical measurements. Do not rely on any output of this software for health-related decisions. Consult a qualified healthcare professional for any medical concerns.

The extension records *how* the browser is being used (tab focus, navigation type, scroll cadence, reading time, mouse/click behaviour, page content profile, search refinement, LLM-chat turns, email mode) and feeds that to a local daemon. The daemon computes a documented set of derived metrics — a focus score, a flow heuristic, a fatigue heuristic, a distraction score, a procrastination score — and, if a NeuroSkill EEG headset is streaming, time-aligns those signals with frequency-band power (δ, θ, α, β, γ).

Output is a structured view of *what already happened* in your browser, with the assumptions behind each derived metric written down so you can decide whether to trust it.

---

## What this is, and isn't

**It is** a passive instrumentation layer plus a small set of derived metrics. Every metric below has its formula and assumptions documented in [Derived metrics](#derived-metrics-formulas-and-caveats). All inference runs locally; no signal leaves your machine.

**It is not:**

- **Not a medical device.** EEG output in this use case cannot be used for diagnostic or any other medical and health-related purposes. See the disclaimer above.
- **Not a flow detector.** "In flow" is a thresholded heuristic, not a validated classifier of the construct described by Csikszentmihalyi [[1]](#references). It has not been calibrated against experience-sampling ground truth.
- **Not a productivity score for managers.** There is no team dashboard, no upload, no shared aggregate. The data lives in your home directory and goes nowhere else.
- **Not a website blocker.** The extension never closes a tab, dims a page, or blocks a domain on its own.
- **Not peer-reviewed.** The integration is original work; the underlying constructs (flow, attention, distraction-as-tab-switching) are referenced from the literature but our specific implementation has not been independently validated.
- **Not a substitute for self-reflection.** Quantitative signals are inputs to your judgement, not a replacement for it. If a metric disagrees with how you actually felt about a session, the metric is probably wrong.

---

## What it measures

These are direct observations from the WebExtension APIs and DOM events — no inference, no model.

| Source | Signal | API |
|---|---|---|
| Tabs | Tab switch / open / close, tab count | `tabs.onActivated`, `tabs.onCreated`, `tabs.onRemoved` |
| Window | Focus / blur of the browser window | `windows.onFocusChanged` |
| Navigation | Page load, navigation type (link, typed, reload, back/forward, bookmark) | `webNavigation.onCommitted` |
| Reading | Active reading time, idle time, scroll depth, scroll reversals | content-script `scroll` + visibility |
| Mouse | Distance moved, idle seconds, clicks per minute, click target class | `mousemove` / `click` |
| Input | Typing detected (boolean only — no keystrokes recorded) | `input` event probe |
| Forms | Submit count per page | `submit` event |
| Clipboard | Copy / paste detected; paste size class | `copy` / `paste` events |
| Media | Play state, has-video, has-audio, watched seconds, playback rate | `<video>` / `<audio>` element probes |
| Page profile | Content type (video, paper, social, code, chat, email, shopping, news, image, text), word count, image count, form count | DOM heuristics |
| Search | Query string + refinement-vs-fresh classification (off by default) | URL parsing on known engines |
| LLM chat | Provider (ChatGPT, Claude, Gemini, Perplexity, Copilot, Poe, You, Phind, HuggingFace, Pi, Character, Cohere), turn count, streaming state | DOM probes per provider |
| Email | Mode (inbox / reading / composing / searching), unread count from title | URL + title parsing |
| Bookmarks | Created (URL + title) | `bookmarks.onCreated` |
| Downloads | Started (URL + file type) | `downloads.onCreated` |
| Browser state | DevTools open/closed, revisit count per domain | `chrome.devtools` heuristics + history map |
| Environment | One-time at install: OS platform, browser name | `runtime.getPlatformInfo` |

What we **do not read**:

- **Page content beyond what's needed for classification.** Visible-text capture is bounded (heading + a short visible-text excerpt for content-type classification) and respects the [privacy mode](#privacy).
- **Form values.** We see that a form was submitted, not what was typed into it.
- **Clipboard contents.** Only that something was copied/pasted (size class), debounced.
- **Anything at all when `enabled = false`, the daemon is unreachable, or the domain is on your blocklist.**
- **Incognito by default.** `incognitoTracking` defaults off; you must opt in per-window.

---

## Derived metrics: formulas and caveats

Every metric the daemon exposes is computed from the signals above and, optionally, EEG band power. The formulas and validation status are below.

### Focus score (0–100)

> "How engaged were you in this window?"

**Browser-only path.** Linear blend of:

| Feature | Direction | Source |
|---|---|---|
| Reading-time / page-time ratio | + | content-script reading timer |
| Scroll-cadence regularity (low variance) | + | scroll event timestamps |
| Scroll reversal rate (back-and-forth on a page) | − | scroll direction transitions |
| Tab-switch rate over 60 s | − | `tabs.onActivated` |
| Mouse idle ratio in active window | + | `mousemove` gaps |
| Page-revisit churn (same domain, < 30 s apart) | − | navigation history map |

The weights are documented hyperparameters in the daemon and tuneable per user. Browser-only focus has not been validated against external instruments; treat as **exploratory**.

**With EEG.** When a headset, connected to NeuroSkill is streaming, the browser-only score is blended (50/50 by default) with a band-amplitude ratio derived from electrodes:

```
BAR = (θ + α) / β
```

This BAR is based on Lubar's theta/beta work on attention regulation [[3]](#references) and Klimesch's reviews of α/θ oscillations and cognitive performance [[2]](#references). The mapping `BAR → focus 0..100` is a daemon-side normalisation, not a clinical score.

**What can go wrong.** Dry-electrode consumer EEG is sensitive to electrode fit, skin contact, motion, jaw clench, eye-blink artefacts, electrode impedance, and stimulants (caffeine in particular shifts β power [[4]](#references)). Treat the EEG-blended score as a *research artifact*, not a measurement.

### Distraction score (0–100)

> "Are you context-switching faster than you can process the information?"

Heuristic blend of:

- Tab-switches per minute vs. your 7-day baseline
- Fraction of the last 10 minutes spent on `social` content_type
- Active-tab dwell time below your per-domain median

Surfaced in the popup when the score crosses a tuneable threshold. **No labelled training data exists**; the score is a hand-tuned function. It is best read as "you are switching more than usual," not "you are distracted."

### Procrastination score (0–100)

> "Are you on the tabs you opened, or on the tabs you opened to avoid the ones you opened?"

Heuristic over the last 30 minutes:

- Time-share on `social`, `shopping`, `media` content types
- Number of tabs opened-but-never-read (closed within 5 s)
- Distance, in the navigation graph, from the last `code` / `paper` / `email` page

Surfaced as a hint, never as an enforcement action. **Not validated** against any self-report instrument.

### Flow state

> "Are you in a sustained block of high attentional engagement?"

After Csikszentmihalyi [[1]](#references), flow is a self-reported state of effortless concentration on a challenging task. We do not measure that. We measure:

```
in_flow := (focus_score > T_flow)  for  ≥ D_flow seconds
```

Defaults: `T_flow = 70`, `D_flow = 300 s` (5 min). Both are tuneable. This is a thresholded heuristic — calling it "flow" is shorthand. Validation against experience-sampling (ESM) prompts is on the research roadmap and has not been done.

### Fatigue / Break Coach

> "Is your focus low enough that a break could help?"

Heuristic on the slope of focus_score over the last 30 minutes plus cumulative deep-work minutes today (combined across the browser and any installed editor channel). Surfaced as a popup hint, never as a system notification by default. **Not validated** against any objective fatigue measure (e.g., Karolinska Sleepiness Scale, PVT lapses).

### Content-type classification

> "What kind of page is this?"

Pure rule-based classifier in [`src/core/classify.ts`](src/core/classify.ts) — no ML, no remote calls. Buckets: `video`, `image`, `text`, `paper`, `social`, `code`, `chat`, `email`, `shopping`, `news`. The classifier matches domains and DOM signals (presence of a `<video>` player, image-to-text ratio, `<article>` element, etc.). Misclassifications happen on long-tail sites; the rules are auditable and editable.

### LLM-chat detection

> "Was this a chat with an AI assistant, and how many turns?"

Provider-by-provider DOM probes for ChatGPT, Claude, Gemini, Perplexity, Copilot, Poe, You.com, Phind, HuggingFace Chat, Pi, Character.ai, and Cohere. Records turn count, streaming state, and detected-input boolean — not the prompts themselves. Used by the daemon to attribute portions of your day to AI-mediated work.

---

## Validation status

| Metric / feature | Status | Caveat |
|---|---|---|
| WebExtension event capture | Production. | APIs are well-specified; counts are exact. |
| Content-type classifier | Production for the listed domains; best-effort otherwise. | Rule-based; long tail will misclassify. |
| LLM-chat detection | Production for listed providers. | DOM-based; provider UI changes will break it until we ship a fix. |
| Focus score (browser-only) | Exploratory. | No external validation yet. |
| Focus score (with EEG) | Exploratory. | EEG → attention is documented in the literature; our specific normalisation is not. |
| Flow detector | Thresholded heuristic. | Not calibrated against ESM. |
| Distraction score | Heuristic. | No labelled data. |
| Procrastination score | Heuristic. | No labelled data; reads as "off-task signal," not classifier. |
| Break Coach | Heuristic. | Not validated against objective fatigue measures. |

If a study moves a metric out of the "exploratory" column, this table is where we'll record it.

---

## Architecture

The extension is a thin client. All inference (focus score, flow heuristic, distraction/procrastination scores, EEG correlation) runs in the local **NeuroSkill daemon** on `127.0.0.1`. The extension streams structured events; the daemon answers queries.

- **Background service worker** (`src/background.ts`) — owns the tab/navigation/bookmark/download event firehose and the connection to the daemon. Batches events on a 2 s default cadence.
- **Content script** (`src/content.ts`) — runs in every tab; measures scroll/reading/mouse/click/clipboard/media/page-profile signals. Never reads form values, never reads clipboard contents.
- **Popup** (`src/popup/`) — current focus score, flow state, distraction hint, deep-work minutes today.
- **Options page** (`src/options/`) — daemon connection, privacy mode, per-channel toggles, domain allow/blocklist.

If the daemon is down, the extension fails closed: no events are buffered or sent, the popup shows a "not connected" state.

Port autodiscovery probes `18444` (production) and `18445` (dev). The daemon's auth token lives in your user config dir (`~/Library/Application Support/skill/daemon/auth.token` on macOS, equivalents elsewhere). Both are zero-config in the common case.

---

## Setup

1. Install and run the [NeuroSkill app](https://neuroskill.com) — it bundles the daemon.
2. Install this extension from the Chrome Web Store, Firefox Add-ons, or as an unpacked build (see [Development](#development)).
3. Open the popup. The connection indicator should turn green within a few seconds.

No accounts, no PATs, no config. Pin a port in the options page if you need to.

---

## Privacy

- All HTTP traffic is to `127.0.0.1`. 
- **Privacy mode** controls how URLs are recorded:
  - `domain_only` (**default**) — only the hostname is sent. `https://docs.example.com/private/page?token=…` becomes `docs.example.com`.
  - `title_and_domain` — hostname + path, no query string. Page title sent.
  - `full_url` — full URL including query string. Off by default; opt-in.
- No form values are read or sent. Only that a form was submitted.
- No clipboard contents are read. Only the fact that the clipboard changed (size class), debounced.
- No page text is sent except the bounded `visible_text` excerpt used for content-type classification, and only when not on a blocklisted domain.
- **Incognito off by default.** Set `incognitoTracking = true` only if you want incognito windows tracked too.
- Auth token is local-only; written by the NeuroSkill app to your user config dir, readable only by your user.
- `domainAllowlist` / `domainBlocklist` globs let you exclude entire sites. Internal pages (`chrome://`, `about:`, the Chrome Web Store, addons.mozilla.org) are never tracked.
- Source is GPL-3.0; this repository is the entirety of what runs in your browser.

---

## Permissions

| Permission | Why we ask for it |
|---|---|
| `tabs` | Detect tab switch, open, close, count — the core attention signal. |
| `activeTab` | Know which tab is foregrounded right now. |
| `webNavigation` | Distinguish link-click from typed-URL from back/forward (navigation-type signal). |
| `storage` | Persist your settings and the cached daemon port locally. |
| `alarms` | Periodic poll of the daemon for brain state. |
| `bookmarks` | Log bookmark-created events (you bookmarked something — a deliberate-save signal). |
| `downloads` | Log download-started events (file type only). |
| `notifications` | Surface fatigue-coach prompts when you've enabled them. |
| `host_permissions: 127.0.0.1:18444 / :18445` | Talk to the local daemon. The only network destination. |
| `<all_urls>` content script | Reading-time / scroll / mouse / page-profile signals require running on every site you visit. Honours the privacy-mode and domain blocklist settings. |

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| `enabled` | `true` | Master kill-switch |
| `daemonHost` | `127.0.0.1` | Daemon host (don't change unless you know why) |
| `daemonPort` | `0` | `0` = autodiscover `18444` / `18445` |
| `batchIntervalMs` | `2000` | Event flush cadence |
| `privacyMode` | `domain_only` | `domain_only` / `title_and_domain` / `full_url` |
| `trackScrollDepth` | `true` | Capture scroll-depth and reversal signals |
| `trackReadingPatterns` | `true` | Capture active-reading-time signal |
| `trackSearchQueries` | `false` | Send the search query string — **off by default** |
| `trackFormActivity` | `true` | Capture form-submit (count only) |
| `trackMediaState` | `true` | Capture `<video>` / `<audio>` play state |
| `domainAllowlist` | `[]` | If non-empty, only these domains are tracked |
| `domainBlocklist` | `[]` | These domains are never tracked |
| `incognitoTracking` | `false` | Track incognito windows too |

Every channel can be turned off independently. Defaults err on the quiet side.

---

## References

The constructs cited above are drawn from the published literature; the extension's specific implementation is original work and is **not** independently validated. Consult the primary sources before relying on the metrics for anything but personal exploration.

1. **Csikszentmihalyi, M.** (1990). *Flow: The Psychology of Optimal Experience.* Harper & Row. ISBN 978-0-06-016253-5. — Foundational definition of flow as a self-reported subjective state.
2. **Klimesch, W.** (1999). EEG alpha and theta oscillations reflect cognitive and memory performance: a review and analysis. *Brain Research Reviews*, 29(2–3), 169–195. [doi:10.1016/S0165-0173(98)00056-3](https://doi.org/10.1016/S0165-0173(98)00056-3) — Review of α / θ oscillations as correlates of attention and memory.
3. **Lubar, J. F.** (1991). Discourse on the development of EEG diagnostics and biofeedback for attention-deficit/hyperactivity disorders. *Biofeedback and Self-Regulation*, 16(3), 201–225. [doi:10.1007/BF01000016](https://doi.org/10.1007/BF01000016) — Origin of the θ/β ratio as an attention-deficit marker; basis for our BAR proxy.
4. **Barry, R. J., Rushby, J. A., Wallace, M. J., Clarke, A. R., Johnstone, S. J., & Zlojutro, I.** (2005). Caffeine effects on resting-state arousal. *Clinical Neurophysiology*, 116(11), 2693–2700. [doi:10.1016/j.clinph.2005.08.008](https://doi.org/10.1016/j.clinph.2005.08.008) — Why a coffee right before recording can shift your "focus score".
5. **Mark, G., Iqbal, S. T., Czerwinski, M., Johns, P., & Sano, A.** (2016). Neurotics can't focus: An *in situ* study of online multitasking in the workplace. *Proceedings of the CHI Conference on Human Factors in Computing Systems*, 1739–1744. [doi:10.1145/2858036.2858202](https://doi.org/10.1145/2858036.2858202) — Tab-switching / online multitasking as an attention indicator; informs the distraction score.

---

## Development

```bash
npm install
npm run build:chrome    # → dist/chrome/
npm run build:firefox   # → dist/firefox/
npm run build:safari    # → dist/safari/
npm run build:all
npm run watch           # rebuilds dist/chrome on change

npm run package:chrome  # → neuroskill-chrome.zip
npm run package:firefox # → neuroskill-firefox-…xpi (via web-ext)

npm run typecheck
npm run test            # vitest unit tests
npm run test:e2e        # playwright
```

Run the [NeuroSkill daemon](https://github.com/NeuroSkill-com/skill) on port 18445 (`npm run tauri dev` from the parent monorepo) and the extension will autodiscover it.

**Loading the unpacked build:**

- **Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → *Load unpacked* → select `dist/chrome/`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → select any file in `dist/firefox/`.
- **Safari:** open `dist/safari/` in Xcode (the build script emits a Safari Web Extension bundle).

---

## Disclaimer

NeuroSkill is a research tool only. It is **not** a medical device, has **not** been cleared or approved by the FDA, CE, or any regulatory body, and must not be used for clinical diagnosis, treatment decisions, or any medical purpose. All metrics are experimental research outputs — not validated clinical measurements. Do not rely on any output of this software for health-related decisions. Consult a qualified healthcare professional for any medical concerns. EEG signal quality is sensitive to electrode fit, placement, skin contact, motion, and stimulants (caffeine in particular [[4]](#references)).

## License

GPL-3.0-only.
