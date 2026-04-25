// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// Build script for NeuroSkill browser extension.
// Bundles TypeScript with esbuild, copies manifests and static assets.

import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const target = process.env.BROWSER_TARGET || "chrome";
const isWatch = process.argv.includes("--watch");

const outDir = resolve(root, "dist", target);

console.log(`Building for: ${target}${isWatch ? " (watch mode)" : ""}`);

// Ensure output directory exists
mkdirSync(outDir, { recursive: true });

// ── esbuild config ───────────────────────────────────────────────────

const commonOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: "chrome109",
  define: {
    BROWSER_TARGET: JSON.stringify(target),
  },
};

// Background service worker
const backgroundBuild = esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "src/background.ts")],
  outfile: resolve(outDir, "background.js"),
  format: "esm",
});

// Content script
const contentBuild = esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "src/content.ts")],
  outfile: resolve(outDir, "content.js"),
  format: "iife",
});

// Popup
const popupBuild = esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "src/popup/popup.ts")],
  outfile: resolve(outDir, "popup/popup.js"),
  format: "iife",
});

// Options
const optionsBuild = esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "src/options/options.ts")],
  outfile: resolve(outDir, "options/options.js"),
  format: "iife",
});

await Promise.all([backgroundBuild, contentBuild, popupBuild, optionsBuild]);

// ── Copy static assets ───────────────────────────────────────────────

// Manifest
cpSync(
  resolve(root, "manifests", target, "manifest.json"),
  resolve(outDir, "manifest.json"),
);

// HTML files
cpSync(
  resolve(root, "src/popup/popup.html"),
  resolve(outDir, "popup/popup.html"),
);
cpSync(
  resolve(root, "src/popup/popup.css"),
  resolve(outDir, "popup/popup.css"),
);
cpSync(
  resolve(root, "src/options/options.html"),
  resolve(outDir, "options/options.html"),
);
cpSync(
  resolve(root, "src/options/options.css"),
  resolve(outDir, "options/options.css"),
);

// Icons
const iconsDir = resolve(root, "icons");
if (existsSync(iconsDir)) {
  cpSync(iconsDir, resolve(outDir, "icons"), { recursive: true });
}

console.log(`Build complete: dist/${target}/`);

// ── Watch mode ───────────────────────────────────────────────────────

if (isWatch) {
  const ctx = await esbuild.context({
    ...commonOptions,
    entryPoints: [
      resolve(root, "src/background.ts"),
      resolve(root, "src/content.ts"),
      resolve(root, "src/popup/popup.ts"),
      resolve(root, "src/options/options.ts"),
    ],
    outdir: outDir,
    format: "esm",
  });
  await ctx.watch();
  console.log("Watching for changes...");
}
