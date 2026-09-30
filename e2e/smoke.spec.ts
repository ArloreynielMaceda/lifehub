import { expect, test } from "@playwright/test";

/** Runs with or without Supabase configured. */

test("landing page explains the product and links to sign up and sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Everyday life");
  await expect(page.getByRole("link", { name: /Create your free account/ })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/login");
  for (const id of ["features", "how-it-works", "privacy", "faq"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await expect(page.getByText("shown with sample data")).toBeVisible();
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Terms of Service" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Contact" })).toBeVisible();
});

test("FAQ items expand with the keyboard", async ({ page }) => {
  await page.goto("/#faq");
  const trigger = page.getByRole("button", { name: "Does LifeHub connect to my bank account?" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/manual tracker by design/)).toBeVisible();
});

test("legal pages render", async ({ page }) => {
  for (const [path, heading] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
    ["/contact", "We'd love to hear from you."],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
});

test("auth forms have labelled fields and client-side validation", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();

  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address")).toBeVisible();
});

test("private pages are never shown to signed-out visitors", async ({ page }) => {
  for (const path of ["/dashboard", "/tasks", "/expenses", "/documents", "/settings"]) {
    await page.goto(path);
    // With Supabase configured the proxy redirects to sign in; without it, setup instructions show.
    await expect
      .poll(async () => page.url().includes("/login") || (await page.getByText("Connect Supabase to continue").isVisible()))
      .toBe(true);
    if (page.url().includes("/login")) {
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    }
  }
});

test("security headers are set", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("layout does not scroll horizontally on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/", "/login", "/signup", "/privacy"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
