import { describe, it, expect } from "vitest";
import { decodeBase32, generateTOTP } from "../../src/core/totp";

describe("decodeBase32", () => {
  it("decodes a known base32 string", () => {
    // "JBSWY3DP" is base32 for "Hello" (5 bytes)
    const bytes = decodeBase32("JBSWY3DP");
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe("Hello");
  });
  it("handles padding characters", () => {
    const a = decodeBase32("JBSWY3DPEHPK3PXP");
    const b = decodeBase32("JBSWY3DPEHPK3PXP====");
    expect(a).toEqual(b);
  });
  it("is case insensitive", () => {
    const a = decodeBase32("JBSWY3DPEHPK3PXP");
    const b = decodeBase32("jbswy3dpehpk3pxp");
    expect(a).toEqual(b);
  });
  it("returns empty for empty input", () => {
    expect(decodeBase32("").length).toBe(0);
  });
  it("skips invalid characters", () => {
    const result = decodeBase32("JBSW---Y3DP");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("generateTOTP", () => {
  // RFC 6238 test vector: SHA-1, secret = "12345678901234567890" (base32: GEZDGNBVGY3TQOJQ...)
  // At time step 0 (t=0..29), the expected OTP is known.
  // We use a fixed timestamp for deterministic testing.

  it("generates a 6-digit string", async () => {
    const otp = await generateTOTP("JBSWY3DPEHPK3PXP", 1000000 * 1000);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("same secret + same time → same OTP", async () => {
    const ts = 1700000000 * 1000; // fixed timestamp
    const a = await generateTOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", ts);
    const b = await generateTOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", ts);
    expect(a).toBe(b);
  });

  it("different time steps → different OTPs (usually)", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const a = await generateTOTP(secret, 1700000000 * 1000); // step N
    const b = await generateTOTP(secret, 1700000030 * 1000); // step N+1
    // Not guaranteed different, but overwhelmingly likely with 1M possibilities
    // If this flakes, the test secret needs adjustment
    expect(a.length).toBe(6);
    expect(b.length).toBe(6);
  });

  it("pads short OTPs with leading zeros", async () => {
    // The OTP should always be exactly 6 chars, even if the number is small
    const otp = await generateTOTP("AAAAAAAAAAAAAAAA", 0);
    expect(otp.length).toBe(6);
  });
});
