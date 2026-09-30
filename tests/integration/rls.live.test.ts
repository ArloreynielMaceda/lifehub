/**
 * Live authorization suite against a real Supabase project (use a dedicated TEST project).
 * Requires TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY and TEST_SUPABASE_SECRET_KEY.
 * Without them the suite is skipped — it never runs against production by accident.
 *
 * It creates two confirmed users, then proves through the public Data/Storage APIs (exactly
 * what a malicious client could call) that neither can read or modify the other's data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;
const enabled = Boolean(url && publishableKey && secretKey);

type Client = SupabaseClient<Database>;

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

describe.skipIf(!enabled)("row level security (live Supabase)", () => {
  let admin: Client;
  let alice: Client;
  let bob: Client;
  const ids: { alice?: string; bob?: string } = {};
  const password = `Test-${crypto.randomUUID()}-9`;

  async function signedInClient(email: string): Promise<Client> {
    const client = createClient<Database>(url!, publishableKey!, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    admin = createClient<Database>(url!, secretKey!, { auth: { persistSession: false } });
    const stamp = Date.now();
    for (const who of ["alice", "bob"] as const) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `rls-${who}-${stamp}@example.test`,
        password,
        email_confirm: true,
        user_metadata: { full_name: who },
      });
      if (error) throw error;
      ids[who] = data.user.id;
    }
    alice = await signedInClient(`rls-alice-${stamp}@example.test`);
    bob = await signedInClient(`rls-bob-${stamp}@example.test`);
  });

  afterAll(async () => {
    for (const id of [ids.alice, ids.bob]) {
      if (!id) continue;
      const { data } = await admin.storage.from("documents").list(id);
      if (data?.length) await admin.storage.from("documents").remove(data.map((o) => `${id}/${o.name}`));
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("creates a profile for each new user", async () => {
    const { data } = await alice.from("profiles").select("id, full_name, currency");
    expect(data).toEqual([{ id: ids.alice, full_name: "alice", currency: "PHP" }]);
  });

  it("isolates every private table", async () => {
    const { data: task } = await alice.from("tasks").insert({ title: "Alice private task" }).select("id").single();
    await alice.from("notes").insert({ title: "Alice secret", content: "diary" });
    await alice
      .from("transactions")
      .insert({ type: "expense", amount_minor: 1000, description: "Coffee", category: "Food", occurred_on: "2026-09-30" });
    await alice.from("bills").insert({ title: "Alice rent", anchor_date: "2026-10-01", next_due_date: "2026-10-01" });

    for (const table of ["tasks", "notes", "transactions", "bills", "profiles", "documents", "notifications"] as const) {
      const { data } = await bob.from(table).select("*");
      expect((data ?? []).filter((row) => (row as { user_id?: string; id?: string }).user_id === ids.alice || (row as { id?: string }).id === ids.alice), table).toEqual([]);
    }

    const update = await bob.from("tasks").update({ title: "pwned" }).eq("id", task!.id).select("id");
    expect(update.data).toEqual([]);
    const remove = await bob.from("tasks").delete().eq("id", task!.id).select("id");
    expect(remove.data).toEqual([]);
    const { data: still } = await alice.from("tasks").select("title").eq("id", task!.id).single();
    expect(still?.title).toBe("Alice private task");
  });

  it("rejects writes that claim another user's id", async () => {
    const { error } = await bob
      .from("tasks")
      // @ts-expect-error user_id is intentionally not part of the insert type
      .insert({ title: "spoof", user_id: ids.alice });
    expect(error).not.toBeNull();
  });

  it("aggregates only the caller's transactions", async () => {
    const { data } = await bob.rpc("transaction_totals", { p_from: "2026-01-01", p_to: "2026-12-31" });
    expect(data).toEqual([]);
  });

  it("does not let anonymous clients read data or call privileged functions", async () => {
    const anon = createClient<Database>(url!, publishableKey!, { auth: { persistSession: false } });
    const { data } = await anon.from("tasks").select("*");
    expect(data ?? []).toEqual([]);
    const { error } = await alice.rpc("generate_all_notifications");
    expect(error).not.toBeNull();
  });

  it("marks a bill paid idempotently", async () => {
    const { data: bill } = await alice
      .from("bills")
      .insert({ title: "Internet", recurrence: "monthly", anchor_date: "2026-01-31", next_due_date: "2026-01-31" })
      .select("id")
      .single();
    const first = await alice.rpc("mark_bill_occurrence", { p_bill_id: bill!.id, p_due_date: "2026-01-31", p_next_due_date: "2026-02-28" });
    const retry = await alice.rpc("mark_bill_occurrence", { p_bill_id: bill!.id, p_due_date: "2026-01-31", p_next_due_date: "2026-02-28" });
    expect([first.data, retry.data]).toEqual(["advanced", "unchanged"]);
    const { count } = await alice.from("bill_occurrences").select("id", { count: "exact", head: true }).eq("bill_id", bill!.id);
    expect(count).toBe(1);
    const bobAttempt = await bob.rpc("mark_bill_occurrence", { p_bill_id: bill!.id, p_due_date: "2026-02-28", p_next_due_date: "2026-03-31" });
    expect(bobAttempt.error).not.toBeNull();
  });

  it("confines storage objects to the owner's folder", async () => {
    const path = `${ids.alice}/${crypto.randomUUID()}.pdf`;
    const upload = await alice.storage.from("documents").upload(path, PDF_BYTES, { contentType: "application/pdf" });
    expect(upload.error).toBeNull();

    const bobRead = await bob.storage.from("documents").download(path);
    expect(bobRead.data).toBeNull();
    const bobSign = await bob.storage.from("documents").createSignedUrl(path, 60);
    expect(bobSign.data).toBeNull();
    const bobList = await bob.storage.from("documents").list(ids.alice!);
    expect(bobList.data ?? []).toEqual([]);
    await bob.storage.from("documents").remove([path]);
    const stillThere = await alice.storage.from("documents").download(path);
    expect(stillThere.data).not.toBeNull();

    const intoAlice = await bob.storage
      .from("documents")
      .upload(`${ids.alice}/${crypto.randomUUID()}.pdf`, PDF_BYTES, { contentType: "application/pdf" });
    expect(intoAlice.error).not.toBeNull();

    const html = await alice.storage
      .from("documents")
      .upload(`${ids.alice}/${crypto.randomUUID()}.pdf`, new TextEncoder().encode("<html>"), { contentType: "text/html" });
    expect(html.error).not.toBeNull(); // bucket MIME allow-list
  });

  it("keeps routines and their completion history private", async () => {
    const { data: routine, error } = await alice
      .from("tasks")
      .insert({ kind: "routine", title: "Alice routine", repeat_days: [1, 2, 3, 4, 5, 6, 7], starts_on: "2026-01-01" })
      .select("id")
      .single();
    expect(error).toBeNull();
    await alice.from("task_completions").insert({ task_id: routine!.id, occurred_on: "2026-01-06" });

    const { data: seen } = await bob.from("task_completions").select("id").eq("task_id", routine!.id);
    expect(seen ?? []).toEqual([]);
    const intrude = await bob.from("task_completions").insert({ task_id: routine!.id, occurred_on: "2026-01-07" });
    expect(intrude.error).not.toBeNull();
    const removed = await bob.from("task_completions").delete().eq("task_id", routine!.id).select("id");
    expect(removed.data ?? []).toEqual([]);
    const { count } = await alice.from("task_completions").select("id", { count: "exact", head: true }).eq("task_id", routine!.id);
    expect(count).toBe(1);
  });

  it("records one linked expense per bill payment and keeps it private", async () => {
    const { data: bill } = await alice
      .from("bills")
      .insert({ title: "Electricity", amount_minor: 230000, recurrence: "monthly", anchor_date: "2026-01-31", next_due_date: "2026-01-31" })
      .select("id")
      .single();
    const call = () =>
      alice.rpc("mark_bill_occurrence", {
        p_bill_id: bill!.id,
        p_due_date: "2026-01-31",
        p_next_due_date: "2026-02-28",
        p_paid_on: "2026-01-30",
      });
    expect((await call()).data).toBe("advanced");
    expect((await call()).data).toBe("unchanged");
    const { data: summary } = await alice.rpc("money_summary", { p_from: "2026-01-30", p_to: "2026-01-30" });
    expect(summary?.find((row) => row.currency === "PHP")?.bill_expense_minor).toBe(230000);

    const { data: occurrence } = await alice.from("bill_occurrences").select("id").eq("bill_id", bill!.id).single();
    const steal = await bob
      .from("transactions")
      .insert({ type: "expense", amount_minor: 1, description: "x", category: "x", occurred_on: "2026-01-30", bill_occurrence_id: occurrence!.id });
    expect(steal.error).not.toBeNull();
    const { data: bobSummary } = await bob.rpc("money_summary", { p_from: "2026-01-01", p_to: "2026-01-31" });
    expect(bobSummary ?? []).toEqual([]);
  });

  it("has no public URL access to the private bucket", async () => {
    const path = `${ids.alice}/${crypto.randomUUID()}.pdf`;
    await alice.storage.from("documents").upload(path, PDF_BYTES, { contentType: "application/pdf" });
    const publicUrl = alice.storage.from("documents").getPublicUrl(path).data.publicUrl;
    const response = await fetch(publicUrl);
    expect(response.ok).toBe(false);
  });
});
