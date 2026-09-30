import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const hasTestEnv = Boolean(
  process.env.TEST_SUPABASE_URL && process.env.TEST_SUPABASE_PUBLISHABLE_KEY && process.env.TEST_SUPABASE_SECRET_KEY,
);
export const SKIP_REASON = "Set TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY and TEST_SUPABASE_SECRET_KEY to run E2E tests.";

export function admin() {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

export const PASSWORD = "E2e-password-2026";

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
}

/** Creates a confirmed user directly (no inbox needed). */
export async function createConfirmedUser(label: string, fullName = "Test User") {
  const email = uniqueEmail(label);
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, timezone: "Asia/Manila" },
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function deleteUser(id: string | undefined) {
  if (!id) return;
  const client = admin();
  const { data } = await client.storage.from("documents").list(id);
  if (data?.length) await client.storage.from("documents").remove(data.map((o) => `${id}/${o.name}`));
  await client.auth.admin.deleteUser(id);
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** A tiny but genuine PDF. */
export const SAMPLE_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
