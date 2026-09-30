import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

import { toUserError } from "@/lib/server-action";
import {
  isDatabaseSchemaCurrent,
  isSchemaMismatch,
  reportQueryError,
  throwQueryError,
} from "@/lib/schema-status";

import { createSupabaseMock } from "../support/supabase-mock";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("schema mismatch detection", () => {
  it("recognises missing column, table and function errors", () => {
    for (const code of ["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]) {
      expect(isSchemaMismatch({ code }), code).toBe(true);
    }
    for (const error of [null, undefined, {}, { code: "42501" }, { code: "23505" }, { code: "PGRST116" }]) {
      expect(isSchemaMismatch(error)).toBe(false);
    }
  });

  it("sends page loaders to the update instructions when the database is behind", () => {
    expect(() => reportQueryError("routines:list", { code: "42703" })).toThrow(
      expect.objectContaining({ url: "/update-required" }),
    );
    expect(() => throwQueryError("tasks:list", { code: "PGRST205" }, "Could not load tasks")).toThrow(
      expect.objectContaining({ url: "/update-required" }),
    );
  });

  it("leaves other errors to the normal error handling", () => {
    expect(() => reportQueryError("tasks:focus", { code: "57014" })).not.toThrow();
    expect(() => reportQueryError("tasks:focus", null)).not.toThrow();
    expect(() => throwQueryError("tasks:list", { code: "57014" }, "Could not load tasks")).toThrow("Could not load tasks");
  });

  it("explains the fix in server action errors instead of a generic message", () => {
    expect(toUserError("bills:mark-paid", { code: "PGRST202" })).toMatch(/database needs an update.*supabase db push/);
    expect(toUserError("bills:mark-paid", { code: "XX000" })).toBe("Something went wrong. Please try again.");
  });
});

describe("isDatabaseSchemaCurrent", () => {
  it("reports an outdated database when any new object is missing", async () => {
    const mock = createSupabaseMock({
      handler: (q) => (q.table === "task_completions" ? { error: { code: "PGRST205" } } : { data: [] }),
    });
    expect(await isDatabaseSchemaCurrent(mock.client as never)).toBe(false);
    expect(mock.queries.map((q) => q.table).sort()).toEqual(["bill_occurrences", "task_completions", "tasks", "transactions"]);
  });

  it("treats permission errors (object exists) and success as current", async () => {
    const denied = createSupabaseMock({ handler: () => ({ error: { code: "42501" } }) });
    expect(await isDatabaseSchemaCurrent(denied.client as never)).toBe(true);
    const ok = createSupabaseMock({ handler: () => ({ data: [] }) });
    expect(await isDatabaseSchemaCurrent(ok.client as never)).toBe(true);
  });
});
