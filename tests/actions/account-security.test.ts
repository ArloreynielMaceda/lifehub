import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseMock } from "../support/supabase-mock";

type AuthError = { code?: string; status?: number } | null;

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  verifyCurrentPassword: vi.fn(),
  discardSession: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("@/lib/supabase/reauth", () => ({
  verifyCurrentPassword: mocks.verifyCurrentPassword,
  discardSession: mocks.discardSession,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

import { updatePassword } from "@/features/auth/actions";
import { changePassword, deleteAccount, signOutEverywhere } from "@/features/settings/actions";
import { STALE_SESSION_MESSAGE, isRecentlyAuthenticated, lastAuthenticatedAt } from "@/lib/auth-recency";

const NOW = () => Math.floor(Date.now() / 1000);
const NEW_PASSWORD = "Brand-new-pass-7";

/** The request's (cookie) client: the mock plus the auth calls these actions use. */
function signedIn({ amrAgeSeconds = 60, userId = "11111111-1111-4111-8111-111111111111" as string | null } = {}) {
  const mock = createSupabaseMock({ userId, storage: (op) => (op === "list" ? { data: [] } : undefined) });
  const auth = {
    getClaims: async () =>
      userId
        ? {
            data: {
              claims: {
                sub: userId,
                email: "owner@example.test",
                amr: amrAgeSeconds === null ? undefined : [{ method: "password", timestamp: NOW() - amrAgeSeconds }],
              },
            },
            error: null,
          }
        : { data: null, error: null },
    signOut: vi.fn<(options?: unknown) => Promise<{ error: null }>>(async () => ({ error: null })),
    setSession: vi.fn<(tokens: unknown) => Promise<{ data: object; error: AuthError }>>(async () => ({ data: {}, error: null })),
    updateUser: vi.fn<(attrs: unknown) => Promise<{ data: object; error: AuthError }>>(async () => ({ data: {}, error: null })),
  };
  mocks.client = { ...mock.client, auth };
  return { mock, auth };
}

/** The throwaway client returned by a successful password check. */
function verifiedClient(updateError: AuthError = null) {
  const client = {
    auth: {
      updateUser: vi.fn<(attrs: unknown) => Promise<{ data: object; error: AuthError }>>(async () => ({ data: {}, error: updateError })),
      signOut: vi.fn<(options?: unknown) => Promise<{ error: null }>>(async () => ({ error: null })),
    },
  };
  mocks.verifyCurrentPassword.mockResolvedValue({
    ok: true,
    client,
    session: { access_token: "fresh-access", refresh_token: "fresh-refresh" },
  });
  return client;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  mocks.verifyCurrentPassword.mockReset();
  mocks.discardSession.mockClear();
});

describe("changing the password in Settings requires the current password", () => {
  const input = { currentPassword: "Old-pass-1", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

  it("is refused without a session", async () => {
    signedIn({ userId: null });
    expect((await changePassword(input)).ok).toBe(false);
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it("asks for the current password", async () => {
    signedIn();
    const result = await changePassword({ ...input, currentPassword: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.currentPassword).toBeDefined();
    expect(mocks.verifyCurrentPassword).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password and changes nothing", async () => {
    const { auth } = signedIn();
    mocks.verifyCurrentPassword.mockResolvedValue({ ok: false, reason: "wrong_password" });
    const result = await changePassword(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.currentPassword).toEqual(["That isn't your current password."]);
    expect(mocks.verifyCurrentPassword).toHaveBeenCalledWith("owner@example.test", "Old-pass-1");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("changes it through the verified session, signs out other devices and keeps this one", async () => {
    const { auth } = signedIn();
    const verified = verifiedClient();
    const result = await changePassword(input);
    expect(result.ok).toBe(true);
    expect(verified.auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
    expect(verified.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "fresh-access", refresh_token: "fresh-refresh" });
  });

  it("maps Supabase password rules to the field and discards the verified session", async () => {
    signedIn();
    verifiedClient({ code: "same_password", status: 422 });
    const result = await changePassword(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.password).toBeDefined();
    expect(mocks.discardSession).toHaveBeenCalled();
  });

  it("surfaces rate limiting", async () => {
    signedIn();
    mocks.verifyCurrentPassword.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const result = await changePassword(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Too many password attempts/);
  });
});

describe("deleting the account requires the password", () => {
  it("needs the password as well as DELETE", async () => {
    const { mock } = signedIn();
    expect((await deleteAccount({ confirmation: "DELETE" })).ok).toBe(false);
    expect(mock.rpcCalls).toHaveLength(0);
  });

  it("does nothing with a wrong password", async () => {
    const { mock } = signedIn();
    mocks.verifyCurrentPassword.mockResolvedValue({ ok: false, reason: "wrong_password" });
    const result = await deleteAccount({ confirmation: "DELETE", password: "guess" });
    expect(result.ok).toBe(false);
    expect(mock.storageCalls).toHaveLength(0);
    expect(mock.rpcCalls).toHaveLength(0);
  });

  it("deletes after the password is confirmed", async () => {
    const { mock } = signedIn();
    verifiedClient();
    await expect(deleteAccount({ confirmation: "DELETE", password: "Right-pass-1" })).rejects.toMatchObject({
      url: "/?account_deleted=1",
    });
    expect(mocks.discardSession).toHaveBeenCalled();
    expect(mock.rpcCalls.map((call) => call.fn)).toEqual(["delete_my_account"]);
  });
});

describe("sign out everywhere", () => {
  it("ends every session for the account", async () => {
    const { auth } = signedIn();
    await expect(signOutEverywhere()).rejects.toMatchObject({ url: "/login?signed_out=everywhere" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});

describe("setting a password without the old one (reset link)", () => {
  const input = { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

  it("works right after opening the reset link", async () => {
    const { auth } = signedIn({ amrAgeSeconds: 120 });
    expect((await updatePassword(input)).ok).toBe(true);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
  });

  it("is refused for an older session, e.g. a device left signed in", async () => {
    const { auth } = signedIn({ amrAgeSeconds: 60 * 60 });
    const result = await updatePassword(input);
    expect(result).toMatchObject({ ok: false, error: STALE_SESSION_MESSAGE });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("auth recency", () => {
  it("uses the latest authentication time from the amr claim", () => {
    expect(lastAuthenticatedAt({ amr: [{ method: "password", timestamp: 100 }, { method: "otp", timestamp: 250 }] })).toBe(250);
    expect(lastAuthenticatedAt({ amr: [{ method: "x", timestamp: "soon" }] })).toBeNull();
    expect(lastAuthenticatedAt({})).toBeNull();
    expect(lastAuthenticatedAt(null)).toBeNull();
  });

  it("allows 15 minutes", () => {
    expect(isRecentlyAuthenticated(1000, 1000 + 15 * 60)).toBe(true);
    expect(isRecentlyAuthenticated(1000, 1000 + 15 * 60 + 1)).toBe(false);
    expect(isRecentlyAuthenticated(null, 99999)).toBe(true);
  });
});
