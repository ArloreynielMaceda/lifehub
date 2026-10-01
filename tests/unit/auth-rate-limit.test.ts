import { describe, expect, it, vi } from "vitest";

import { isRateLimited, logRateLimit, rateLimitMessage } from "@/features/auth/rate-limit";

describe("Supabase rate-limit messages", () => {
  it("tells people exactly how long the per-address email cooldown is", () => {
    const error = {
      code: "over_email_send_rate_limit",
      status: 429,
      message: "For security purposes, you can only request this after 42 seconds.",
    };
    expect(rateLimitMessage(error)).toBe("Please wait 42 seconds before asking for another email.");
    expect(rateLimitMessage({ ...error, message: "…only request this after 1 second." })).toBe(
      "Please wait 1 second before asking for another email.",
    );
  });

  it("explains the hourly email cap instead of saying 'wait a minute'", () => {
    const message = rateLimitMessage({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" });
    expect(message).toMatch(/hourly email limit/);
    expect(message).not.toMatch(/minute/);
  });

  it("covers request limits and unknown 429s", () => {
    expect(rateLimitMessage({ code: "over_request_rate_limit", status: 429 })).toMatch(/few minutes/);
    expect(rateLimitMessage({ status: 429 })).toMatch(/few minutes/);
  });

  it("ignores errors that aren't rate limits", () => {
    expect(isRateLimited({ code: "invalid_credentials", status: 400 })).toBe(false);
    expect(rateLimitMessage({ code: "weak_password", status: 422 })).toBeNull();
  });

  it("logs the code and a hint, never the message text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logRateLimit("sign-up", { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" });
    expect(warn).toHaveBeenCalledWith("[auth:sign-up] rate limited", {
      code: "over_email_send_rate_limit",
      status: 429,
      hint: expect.stringContaining("custom SMTP"),
    });
    warn.mockRestore();
  });
});
