import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { verifyCurrentPassword } from "@/lib/supabase/reauth";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  mocks.signInWithPassword.mockReset();
  mocks.createClient.mockReset().mockReturnValue({ auth: { signInWithPassword: mocks.signInWithPassword } });
});

describe("verifyCurrentPassword", () => {
  it("uses a throwaway client that never stores a session", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "a", refresh_token: "r" } }, error: null });
    const result = await verifyCurrentPassword("owner@example.test", "Right-pass-1");
    expect(result.ok).toBe(true);
    expect(mocks.createClient).toHaveBeenCalledWith("https://example.supabase.co", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "owner@example.test", password: "Right-pass-1" });
  });

  it("reports wrong passwords, rate limits and outages separately", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code: "invalid_credentials", status: 400 } });
    expect(await verifyCurrentPassword("o@example.test", "x")).toEqual({ ok: false, reason: "wrong_password" });

    mocks.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code: "over_request_rate_limit", status: 429 } });
    expect(await verifyCurrentPassword("o@example.test", "x")).toEqual({ ok: false, reason: "rate_limited" });

    mocks.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code: "unexpected_failure", status: 500 } });
    expect(await verifyCurrentPassword("o@example.test", "x")).toEqual({ ok: false, reason: "unavailable" });
  });
});
