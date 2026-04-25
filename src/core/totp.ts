// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 NeuroSkill.com
//
// TOTP generation (RFC 6238) — extracted for testability.
// Uses Web Crypto API (available in both browser and Node 20+).

/** Decode a base32 string to Uint8Array. */
export function decodeBase32(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits: number[] = [];
  for (const c of input.toUpperCase().replace(/=+$/, "")) {
    const val = alphabet.indexOf(c);
    if (val < 0) continue;
    for (let i = 4; i >= 0; i--) bits.push((val >> i) & 1);
  }
  const key = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < key.length; i++) {
    key[i] = bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0);
  }
  return key;
}

/** Generate a 6-digit TOTP from a base32 secret (SHA-1, 30s period).
 *  Optionally accepts a timestamp for deterministic testing. */
export async function generateTOTP(secretB32: string, nowMs?: number): Promise<string> {
  const key = decodeBase32(secretB32);
  const counter = Math.floor((nowMs ?? Date.now()) / 1000 / 30);

  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(4, counter, false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, counterBuf);
  const hmac = new Uint8Array(sig);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1000000).padStart(6, "0");
}
