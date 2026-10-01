import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: null as unknown, headers: new Map<string, string>() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => mocks.headers.get(name.toLowerCase()) ?? null }),
}));

import { requestPasswordReset, resendVerification, signUp } from "@/features/auth/actions";
import { getRequestOrigin } from "@/lib/site-url";
import { getSiteUrl } from "@/lib/supabase/env";

const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  mocks.headers = new Map();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function setHeaders(values: Record<string, string>) {
  mocks.headers = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
}

describe("auth email links use the site the user is on", () => {
  it("password reset links back to the deployed domain, not localhost", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"; // e.g. copied from .env.local
    setHeaders({ origin: "https://lifehub-demo.vercel.app", host: "lifehub-demo.vercel.app" });
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
    mocks.client = { auth: { resetPasswordForEmail } };

    expect((await requestPasswordReset({ email: "a@example.com" })).ok).toBe(true);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@example.com", {
      redirectTo: "https://lifehub-demo.vercel.app/auth/confirm?next=%2Freset-password",
    });
  });

  it("sign-up and resend confirmation use the same origin", async () => {
    setHeaders({ origin: "https://lifehub.example.com" });
    const signUpFn = vi.fn<(params: unknown) => Promise<{ data: { session: null }; error: null }>>(async () => ({
      data: { session: null },
      error: null,
    }));
    const resend = vi.fn<(params: unknown) => Promise<{ error: null }>>(async () => ({ error: null }));
    mocks.client = { auth: { signUp: signUpFn, resend } };

    await signUp({ fullName: "Ana", email: "ana@example.com", password: "Password123", confirmPassword: "Password123" });
    await resendVerification("ana@example.com");
    expect(signUpFn.mock.calls[0]![0]).toMatchObject({
      options: { emailRedirectTo: "https://lifehub.example.com/auth/confirm?next=%2Fverify-email" },
    });
    expect(resend.mock.calls[0]![0]).toMatchObject({
      options: { emailRedirectTo: "https://lifehub.example.com/auth/confirm?next=%2Fverify-email" },
    });
  });
});

describe("getRequestOrigin", () => {
  it("prefers the Origin header", async () => {
    setHeaders({ origin: "https://app.example.com", host: "internal:3000" });
    expect(await getRequestOrigin()).toBe("https://app.example.com");
  });

  it("falls back to forwarded host and protocol", async () => {
    setHeaders({ "x-forwarded-host": "lifehub-git-main.vercel.app", "x-forwarded-proto": "https", host: "localhost:3000" });
    expect(await getRequestOrigin()).toBe("https://lifehub-git-main.vercel.app");
    setHeaders({ host: "localhost:3000" });
    expect(await getRequestOrigin()).toBe("http://localhost:3000");
  });

  it("ignores malformed values and uses the configured site URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://lifehub.example.com";
    setHeaders({ origin: "javascript:alert(1)", host: "evil.example/path?x=1" });
    expect(await getRequestOrigin()).toBe("https://lifehub.example.com");
    setHeaders({});
    expect(await getRequestOrigin()).toBe("https://lifehub.example.com");
  });
});

describe("getSiteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://lifehub.example.com/";
    expect(getSiteUrl()).toBe("https://lifehub.example.com");
  });

  it("never returns localhost on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "lifehub-demo.vercel.app";
    expect(getSiteUrl()).toBe("https://lifehub-demo.vercel.app");
  });

  it("uses the Vercel URL when nothing is configured, else localhost for local dev", () => {
    process.env.VERCEL_URL = "lifehub-abc123.vercel.app";
    expect(getSiteUrl()).toBe("https://lifehub-abc123.vercel.app");
    delete process.env.VERCEL_URL;
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});
