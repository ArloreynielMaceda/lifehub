import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseMock, TEST_USER_ID } from "../support/supabase-mock";

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createNote, saveNote } from "@/features/notes/actions";
import { createTask, deleteTask, setTaskStatus, updateTask } from "@/features/tasks/actions";

const TASK_ID = "22222222-2222-4222-8222-222222222222";
const validTask = {
  title: "Pay rent",
  description: "",
  dueDate: "2026-10-01",
  priority: "high",
  status: "pending",
  category: "Home",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("task actions", () => {
  it("requires a signed-in user and touches nothing otherwise", async () => {
    const mock = createSupabaseMock({ userId: null });
    mocks.client = mock.client;
    const result = await createTask(validTask);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/session has expired/i) });
    expect(mock.queries).toHaveLength(0);
  });

  it("validates input on the server", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    const result = await createTask({ ...validTask, title: "   ", dueDate: "2026-02-30", priority: "urgent" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.title?.[0]).toMatch(/title/i);
      expect(result.fieldErrors?.dueDate).toBeDefined();
      expect(result.fieldErrors?.priority).toBeDefined();
    }
    expect(mock.queries).toHaveLength(0);
  });

  it("never forwards a client-supplied user_id or unknown fields", async () => {
    const mock = createSupabaseMock({
      handler: (q) => (q.action === "insert" ? { data: { id: TASK_ID } } : undefined),
    });
    mocks.client = mock.client;
    const result = await createTask({ ...validTask, user_id: "33333333-3333-4333-8333-333333333333", completed_at: "x" });
    expect(result).toMatchObject({ ok: true, data: { id: TASK_ID } });
    const insert = mock.queries.find((q) => q.action === "insert")!;
    expect(insert.table).toBe("tasks");
    expect(insert.payload).toEqual({
      title: "Pay rent",
      description: "",
      due_date: "2026-10-01",
      priority: "high",
      status: "pending",
      category: "Home",
    });
  });

  it("stores an empty due date as null", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: { id: TASK_ID } }) });
    mocks.client = mock.client;
    await createTask({ ...validTask, dueDate: "" });
    expect((mock.queries[0]!.payload as { due_date: unknown }).due_date).toBeNull();
  });

  it("reports not found when RLS hides the row (another user's task)", async () => {
    const mock = createSupabaseMock({ handler: () => ({ data: null }) });
    mocks.client = mock.client;
    const result = await updateTask(TASK_ID, validTask);
    expect(result).toEqual({ ok: false, error: "That task could not be found." });
    const update = mock.queries[0]!;
    expect(update.action).toBe("update");
    expect(update.filters).toContainEqual(["eq", "id", TASK_ID]);
  });

  it("rejects malformed ids before querying", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    expect((await deleteTask("1 or 1=1")).ok).toBe(false);
    expect((await setTaskStatus("not-a-uuid", "completed")).ok).toBe(false);
    expect((await setTaskStatus(TASK_ID, "archived")).ok).toBe(false);
    expect(mock.queries).toHaveLength(0);
  });

  it("clears related notifications when a task is completed", async () => {
    const mock = createSupabaseMock({ handler: (q) => (q.table === "tasks" ? { data: { id: TASK_ID } } : undefined) });
    mocks.client = mock.client;
    const result = await setTaskStatus(TASK_ID, "completed");
    expect(result.ok).toBe(true);
    const notificationUpdate = mock.queries.find((q) => q.table === "notifications");
    expect(notificationUpdate?.action).toBe("update");
    expect(notificationUpdate?.filters).toContainEqual(["eq", "source_id", TASK_ID]);
  });

  it("hides database error details from the user", async () => {
    const mock = createSupabaseMock({
      handler: () => ({ error: { code: "XX000", message: 'relation "tasks" does not exist at character 15' } }),
    });
    mocks.client = mock.client;
    const result = await createTask(validTask);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Something went wrong. Please try again.");
      expect(result.error).not.toMatch(/relation|character/);
    }
  });
});

describe("note actions", () => {
  it("rejects oversized content", async () => {
    const mock = createSupabaseMock();
    mocks.client = mock.client;
    const result = await saveNote(TASK_ID, { title: "Big", content: "x".repeat(50_001) });
    expect(result.ok).toBe(false);
    expect(mock.queries).toHaveLength(0);
  });

  it("creates a note owned by the caller via database defaults", async () => {
    const mock = createSupabaseMock({
      handler: () => ({ data: { id: TASK_ID, updated_at: "2026-09-30T00:00:00Z" } }),
    });
    mocks.client = mock.client;
    const result = await createNote({ title: "  Groceries  ", content: "eggs" });
    expect(result).toMatchObject({ ok: true, data: { id: TASK_ID } });
    expect(mock.queries[0]!.payload).toEqual({ title: "Groceries", content: "eggs" });
    expect(JSON.stringify(mock.queries[0]!.payload)).not.toContain(TEST_USER_ID);
  });
});
