import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn<(params: unknown) => Promise<{ error: { code?: string; status?: number } | null }>>(),
  exchangeCodeForSession: vi.fn<(code: string) => Promise<{ error: { code?: string; status?: number } | null }>>(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchangeCodeForSession },
  }),
}));

import { GET } from "@/app/auth/confirm/route";

const ORIGIN = "https://lifehub.example.com";

async function visit(query: string): Promise<string> {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/confirm?${query}`));
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin).toBe(ORIGIN);
  return `${location.pathname}${location.search}`;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
});

describe("sign-up confirmation links end on the confirmation page", () => {
  it("token_hash links (custom template) confirm and show 'Email confirmed'", async () => {
    expect(await visit("token_hash=abc&type=email&next=/verify-email")).toBe("/verify-email");
    expect(await visit("token_hash=abc&type=signup&next=/dashboard")).toBe("/verify-email");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
  });

  it("default (PKCE) links confirm and show 'Email confirmed'", async () => {
    expect(await visit("next=%2Fverify-email&code=xyz")).toBe("/verify-email");
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
  });

  it("opened in another browser: the email is confirmed, so ask the user to sign in", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "pkce_code_verifier_not_found", status: 400 } });
    expect(await visit("next=%2Fverify-email&code=xyz")).toBe("/verify-email?status=confirmed");
  });

  it("expired, reused or broken links offer a new link", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    expect(await visit("token_hash=old&type=email&next=/verify-email")).toBe("/verify-email?status=expired");

    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "flow_state_expired", status: 400 } });
    expect(await visit("next=%2Fverify-email&code=old")).toBe("/verify-email?status=expired");

    expect(await visit("next=%2Fverify-email&error=access_denied&error_code=otp_expired")).toBe(
      "/verify-email?status=expired",
    );
    expect(await visit("next=%2Fverify-email")).toBe("/verify-email?status=expired");
  });
});

describe("other auth links keep their behaviour", () => {
  it("password reset links go to the reset form, and failures to sign-in", async () => {
    expect(await visit("token_hash=abc&type=recovery")).toBe("/reset-password");
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    expect(await visit("token_hash=abc&type=recovery")).toBe("/login?error=link_invalid");
  });

  it("a missing code verifier outside sign-up is not treated as confirmed", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "pkce_code_verifier_not_found", status: 400 } });
    expect(await visit("next=%2Freset-password&code=xyz")).toBe("/login?error=link_invalid");
  });

  it("never redirects off-site", async () => {
    expect(await visit("code=xyz&next=https://evil.example")).toBe("/dashboard");
    expect(await visit("code=xyz&next=//evil.example/path")).toBe("/dashboard");
  });
});
