import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseMock, TEST_USER_ID } from "../support/supabase-mock";

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

import { signIn } from "@/features/auth/actions";
import { finalizeDocumentUpload, getDocumentUrl, prepareDocumentUpload } from "@/features/documents/actions";

const DOC_ID = "55555555-5555-4555-8555-555555555555";
const PATH = `${TEST_USER_ID}/0f0e0d0c-0b0a-4908-8706-050403020100.pdf`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("document uploads", () => {
  it("rejects disallowed types and sizes before touching storage", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    expect((await prepareDocumentUpload({ name: "x.svg", size: 10, type: "image/svg+xml" })).ok).toBe(false);
    expect((await prepareDocumentUpload({ name: "x.html", size: 10, type: "text/html" })).ok).toBe(false);
    expect((await prepareDocumentUpload({ name: "big.pdf", size: 10 * 1024 * 1024 + 1, type: "application/pdf" })).ok).toBe(false);
    expect((await prepareDocumentUpload({ name: "empty.pdf", size: 0, type: "application/pdf" })).ok).toBe(false);
    expect(mock.storageCalls).toHaveLength(0);
    expect(mock.queries).toHaveLength(0);
  });

  it("uses a random path inside the user's folder and a sanitized display name", async () => {
    const mock = createSupabaseMock({
      handler: (q) => (q.action === "insert" ? { data: { id: DOC_ID } } : q.head ? { count: 3 } : { data: [] }),
      storage: () => ({ data: { signedUrl: "https://example.supabase.co/storage/v1/object/upload/sign/x?token=t" } }),
    });
    mocks.client = mock.client;
    const result = await prepareDocumentUpload({ name: "../../My <Passport>.pdf", size: 2048, type: "application/pdf" });
    expect(result).toMatchObject({ ok: true, data: { documentId: DOC_ID } });
    const insert = mock.queries.find((q) => q.action === "insert")!.payload as Record<string, string>;
    expect(insert.name).toBe("My Passport.pdf");
    expect(insert.storage_path).toMatch(new RegExp(`^${TEST_USER_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(insert.storage_path).not.toContain("Passport");
    expect(insert).not.toHaveProperty("user_id");
  });

  it("enforces the per-user quota", async () => {
    const mock = createSupabaseMock({ handler: (q) => (q.head ? { count: 200 } : { data: [] }) });
    mocks.client = mock.client;
    const result = await prepareDocumentUpload({ name: "a.pdf", size: 10, type: "application/pdf" });
    expect(result.ok).toBe(false);
    expect(mock.queries.some((q) => q.action === "insert")).toBe(false);
  });

  it("deletes uploads whose bytes don't match the declared type", async () => {
    const mock = createSupabaseMock({
      handler: (q) =>
        q.action === "select" ? { data: { id: DOC_ID, storage_path: PATH, mime_type: "application/pdf", status: "pending" } } : undefined,
      storage: (op) => {
        if (op === "info") return { data: { size: 1000, contentType: "application/pdf" } };
        if (op === "createSignedUrl") return { data: { signedUrl: "https://example.supabase.co/signed" } };
        return { data: [] };
      },
    });
    mocks.client = mock.client;
    // An HTML file renamed to .pdf
    vi.stubGlobal("fetch", async () => new Response(new TextEncoder().encode("<html><script>")));
    const result = await finalizeDocumentUpload(DOC_ID);
    expect(result.ok).toBe(false);
    expect(mock.storageCalls.some((c) => c.op === "remove")).toBe(true);
    expect(mock.queries.some((q) => q.table === "documents" && q.action === "delete")).toBe(true);
    expect(mock.queries.some((q) => q.action === "update")).toBe(false);
  });

  it("marks genuine files as ready", async () => {
    const mock = createSupabaseMock({
      handler: (q) =>
        q.action === "select" ? { data: { id: DOC_ID, storage_path: PATH, mime_type: "application/pdf", status: "pending" } } : undefined,
      storage: (op) => {
        if (op === "info") return { data: { size: 4096, contentType: "application/pdf" } };
        if (op === "createSignedUrl") return { data: { signedUrl: "https://example.supabase.co/signed" } };
        return { data: [] };
      },
    });
    mocks.client = mock.client;
    vi.stubGlobal("fetch", async () => new Response(new TextEncoder().encode("%PDF-1.7\n")));
    const result = await finalizeDocumentUpload(DOC_ID);
    expect(result.ok).toBe(true);
    expect(mock.queries.find((q) => q.action === "update")!.payload).toEqual({ status: "ready", size_bytes: 4096 });
  });

  it("only signs short-lived URLs for documents the caller can see", async () => {
    const hidden = createSupabaseMock({ handler: () => ({ data: null }) });
    mocks.client = hidden.client;
    expect(await getDocumentUrl(DOC_ID, "view")).toEqual({ ok: false, error: "That document could not be found." });
    expect(hidden.storageCalls).toHaveLength(0);

    const owned = createSupabaseMock({
      handler: () => ({ data: { name: "Passport.pdf", storage_path: PATH } }),
      storage: () => ({ data: { signedUrl: "https://example.supabase.co/signed" } }),
    });
    mocks.client = owned.client;
    expect((await getDocumentUrl(DOC_ID, "download")).ok).toBe(true);
    expect(owned.storageCalls[0]).toEqual({
      op: "createSignedUrl",
      args: [PATH, 60, { download: "Passport.pdf" }],
    });
  });
});

describe("sign in", () => {
  it("redirects only to safe relative paths", async () => {
    const signInWithPassword = vi.fn(async () => ({ error: null }));
    mocks.client = { auth: { signInWithPassword } };
    await expect(signIn({ email: "A@Example.com", password: "secret123", next: "https://evil.example" })).rejects.toMatchObject({
      url: "/dashboard",
    });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "secret123" });
    await expect(signIn({ email: "a@example.com", password: "secret123", next: "/tasks?view=calendar" })).rejects.toMatchObject({
      url: "/tasks?view=calendar",
    });
  });

  it("returns a friendly message for wrong credentials", async () => {
    mocks.client = {
      auth: { signInWithPassword: async () => ({ error: { code: "invalid_credentials", status: 400 } }) },
    };
    const result = await signIn({ email: "a@example.com", password: "nope" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/don't match/) });
  });
});
