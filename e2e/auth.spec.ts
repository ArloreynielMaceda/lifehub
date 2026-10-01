import { expect, test } from "@playwright/test";

import { PASSWORD, SKIP_REASON, admin, createConfirmedUser, deleteUser, hasTestEnv, signIn, uniqueEmail } from "./helpers";

test.skip(!hasTestEnv, SKIP_REASON);

test.describe("authentication", () => {
  const created: string[] = [];
  test.afterAll(async () => {
    for (const id of created) await deleteUser(id);
  });

  test("sign up stays inactive until the emailed link confirms it", async ({ page }) => {
    const email = uniqueEmail("signup");
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Maria Clara");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    // With email confirmation enabled (recommended) the form switches to "Confirm your email".
    // If confirmation is disabled in the project, the user lands on the dashboard directly.
    await expect(page.getByRole("heading", { name: "Confirm your email" }).or(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }))).toBeVisible();

    const { data: users } = await admin().auth.admin.listUsers({ perPage: 200 });
    const user = users.users.find((u) => u.email === email);
    expect(user).toBeDefined();
    created.push(user!.id);

    if (page.url().includes("/dashboard")) return;

    // Pending: the account can't sign in yet and has no LifeHub data.
    await expect(page.getByRole("list", { name: "Sign-up progress" })).toBeVisible();
    const { data: pendingProfile } = await admin().from("profiles").select("id").eq("id", user!.id).maybeSingle();
    expect(pendingProfile).toBeNull();

    // Simulate clicking the confirmation email: generate the same token server-side.
    const { data: link, error } = await admin().auth.admin.generateLink({ type: "signup", email, password: PASSWORD });
    expect(error).toBeNull();
    const tokenHash = link?.properties?.hashed_token;
    expect(tokenHash).toBeTruthy();
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email&next=/verify-email`);
    await expect(page).toHaveURL(/\/verify-email$/);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
    await expect(page.getByText("Welcome to LifeHub, Maria")).toBeVisible();
    const { data: profile } = await admin().from("profiles").select("full_name").eq("id", user!.id).maybeSingle();
    expect(profile?.full_name).toBe("Maria Clara");

    await page.getByRole("link", { name: "Go to my dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Maria/ })).toBeVisible();
  });

  test("sign in, sign out, and protected route redirect with return path", async ({ page }) => {
    const user = await createConfirmedUser("login", "Jose Rizal");
    created.push(user.id);

    await page.goto("/tasks?scope=today");
    await expect(page).toHaveURL(/\/login\?next=%2Ftasks%3Fscope%3Dtoday/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/tasks\?scope=today/);

    await page.getByRole("button", { name: /Open account menu/ }).first().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?signed_out=1/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong password shows a friendly error", async ({ page }) => {
    const user = await createConfirmedUser("badpw");
    created.push(user.id);
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("Wrong-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText("don't match");
  });

  test("forgot password flow resets the password", async ({ page }) => {
    const user = await createConfirmedUser("reset");
    created.push(user.id);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(user.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("reset link");

    const { data: link } = await admin().auth.admin.generateLink({ type: "recovery", email: user.email });
    const tokenHash = link?.properties?.hashed_token;
    expect(tokenHash).toBeTruthy();
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
    await expect(page).toHaveURL(/\/reset-password/);
    const newPassword = "Brand-new-pass-7";
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.context().clearCookies();
    await signIn(page, user.email, newPassword);
  });

  test("invalid or reused confirmation links are rejected safely", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=not-a-real-token&type=signup&next=https://evil.example");
    await expect(page).toHaveURL(/\/verify-email\?status=expired/);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send a new link" })).toBeVisible();

    await page.goto("/auth/confirm?token_hash=not-a-real-token&type=recovery");
    await expect(page).toHaveURL(/\/login\?error=link_invalid/);
    await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  });
});
