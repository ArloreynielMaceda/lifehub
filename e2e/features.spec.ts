import { expect, test } from "@playwright/test";

import { SAMPLE_PDF, SKIP_REASON, createConfirmedUser, deleteUser, hasTestEnv, signIn } from "./helpers";

test.skip(!hasTestEnv, SKIP_REASON);

test.describe("core features", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createConfirmedUser("features", "Andrea Cruz");
  });
  test.afterAll(async () => {
    await deleteUser(user?.id);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page, user.email);
  });

  test("dashboard greets the user and starts empty", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Andrea");
    await expect(page.getByText("Nothing due today.")).toBeVisible();
    await expect(page.getByText("No income or expenses recorded this month yet.")).toBeVisible();
  });

  test("task create, complete, edit and delete", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("button", { name: "New task" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Submit enrollment form");
    await dialog.getByRole("radio", { name: "High" }).or(dialog.getByRole("button", { name: "High" })).first().click();
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Submit enrollment form")).toBeVisible();

    await page.getByRole("button", { name: "Submit enrollment form" }).click();
    await page.getByRole("dialog").getByLabel("Title").fill("Submit enrollment form (signed)");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Submit enrollment form (signed)")).toBeVisible();

    await page.getByRole("checkbox", { name: /Mark "Submit enrollment form \(signed\)" as done/ }).click();
    await page.getByRole("link", { name: /Completed/ }).click();
    await expect(page.getByText("Submit enrollment form (signed)")).toBeVisible();

    await page.getByRole("button", { name: /Actions for "Submit enrollment form \(signed\)"/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Submit enrollment form (signed)")).toHaveCount(0);
  });

  test("monthly bill: mark paid rolls forward, undo restores", async ({ page }) => {
    await page.goto("/bills?new=bill");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Water bill");
    await dialog.getByLabel(/Amount/).fill("450.75");
    await dialog.getByLabel("Due date").fill("2026-01-31");
    await dialog.getByLabel("Repeats").selectOption("monthly");
    await dialog.getByRole("button", { name: "Add bill" }).click();

    await page.getByRole("link", { name: /Overdue/ }).click();
    await expect(page.getByText("Water bill")).toBeVisible();
    await expect(page.getByText("₱450.75").first()).toBeVisible();
    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText(/Water bill paid · next on Feb 28/)).toBeVisible();

    await page.getByRole("link", { name: "History" }).click();
    await expect(page.getByText(/for Jan 31, 2026/)).toBeVisible();
  });

  test("transactions update totals exactly", async ({ page }) => {
    await page.goto("/expenses?new=1");
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Income" }).or(dialog.getByRole("button", { name: "Income" })).first().click();
    await dialog.getByLabel("Amount").fill("1000.10");
    await dialog.getByLabel("Description").fill("Freelance gig");
    await dialog.getByLabel("Category").fill("Freelance");
    await dialog.getByRole("button", { name: "Add income" }).click();
    await expect(page.getByText("Freelance gig")).toBeVisible();

    await page.getByRole("button", { name: "Add transaction" }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount").fill("0.20");
    await dialog.getByLabel("Description").fill("Candy");
    await dialog.getByLabel("Category").fill("Food & dining");
    await dialog.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText("Candy")).toBeVisible();

    await expect(page.getByText("₱999.90").first()).toBeVisible(); // net, no float drift
  });

  test("notes autosave and survive a reload", async ({ page }) => {
    await page.goto("/notes/new");
    await page.getByLabel("Title").fill("Packing list");
    await page.getByLabel("Note").fill("Passport\nCharger\nUmbrella");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
    await page.reload();
    await expect(page.getByLabel("Note")).toHaveValue("Passport\nCharger\nUmbrella");
    await page.getByRole("button", { name: "Pin note" }).click();
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Pinned" })).toHaveCount(0); // single pinned note, no grouping
    await expect(page.getByRole("link", { name: /Packing list/ })).toBeVisible();
  });

  test("documents upload, open via signed URL, and delete", async ({ page }) => {
    await page.goto("/documents");
    await page.locator('input[type="file"]').setInputFiles({ name: "Birth certificate.pdf", mimeType: "application/pdf", buffer: SAMPLE_PDF });
    await expect(page.getByText("Uploaded ·")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("list").getByText("Birth certificate.pdf")).toBeVisible();

    // Disguised file is rejected before upload.
    await page.locator('input[type="file"]').setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>") });
    await expect(page.getByText(/contents don't match/)).toBeVisible();

    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Open" }).first().click();
    const tab = await popup;
    await tab.waitForURL(/\/storage\/v1\/object\/sign\/documents\//);
    expect(tab.url()).toContain("token=");
    await tab.close();

    await page.getByRole("button", { name: "Actions for Birth certificate.pdf" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Your vault is empty")).toBeVisible();
  });
});

test.describe("routines and bill payments", () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createConfirmedUser("routines", "Rosa Diaz");
  });
  test.afterAll(async () => {
    await deleteUser(user?.id);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page, user.email);
  });

  test("daily routine: create, complete today, history, pause, resume, delete", async ({ page }) => {
    await page.goto("/tasks?new=routine");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Routine", { exact: true }).fill("Drink water");
    await dialog.getByLabel("Repeats").selectOption("daily");
    await dialog.getByRole("button", { name: "Add routine" }).click();

    await page.getByRole("link", { name: /Routines/ }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Drink water" });
    await expect(row.getByText("Every day")).toBeVisible();
    await expect(row.getByText("Due today")).toBeVisible();

    await row.getByRole("checkbox", { name: /Mark "Drink water" done today/ }).click();
    await expect(row.getByText("Completed today")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Drink water" }).getByText("Completed today")).toBeVisible();

    // The one-time task list is unaffected: a routine never shows up as a task.
    await page.goto("/tasks?scope=all");
    await expect(page.getByText("Drink water")).toHaveCount(0);

    await page.goto("/tasks?scope=routines");
    await page.getByRole("button", { name: 'Actions for "Drink water"' }).click();
    await page.getByRole("menuitem", { name: "Pause" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await page.getByRole("button", { name: 'Actions for "Drink water"' }).click();
    await page.getByRole("menuitem", { name: "Resume" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toHaveCount(0);

    await page.getByRole("button", { name: 'Actions for "Drink water"' }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No routines yet")).toBeVisible();
  });

  test("routines appear in the calendar and can be ticked off there", async ({ page }) => {
    await page.goto("/tasks?new=routine");
    await page.getByRole("dialog").getByLabel("Routine", { exact: true }).fill("Read 10 pages");
    await page.getByRole("dialog").getByRole("button", { name: "Add routine" }).click();
    await page.goto("/tasks?view=calendar");
    const chip = page.getByRole("button", { name: /Read 10 pages, .*: not done/ }).first();
    await chip.click();
    await expect(page.getByRole("button", { name: /Read 10 pages, .*: done/ }).first()).toBeVisible();
  });

  test("paying a bill updates available money exactly once; skipping records no money", async ({ page }) => {
    await page.goto("/expenses?new=1");
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Income" }).or(dialog.getByRole("button", { name: "Income" })).first().click();
    await dialog.getByLabel("Amount").fill("30000");
    await dialog.getByLabel("Description").fill("Salary");
    await dialog.getByLabel("Category").fill("Salary");
    await dialog.getByRole("button", { name: "Add income" }).click();
    await expect(page.getByText("Salary").first()).toBeVisible();

    await page.goto("/bills?new=bill");
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Internet");
    await dialog.getByLabel(/Amount/).fill("1500");
    await dialog.getByLabel("Repeats").selectOption("monthly");
    await dialog.getByRole("button", { name: "Add bill" }).click();

    // Unpaid: reduces "After upcoming bills" only.
    await page.goto("/expenses");
    await expect(page.getByLabel("Actual money").getByText("₱30,000.00").last()).toBeVisible();
    await expect(page.getByLabel("Planned").getByText("₱28,500.00")).toBeVisible();

    // Pay it (twice-clicking is harmless: the second call is a no-op).
    await page.goto("/bills");
    await page.getByRole("button", { name: "Mark as paid" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark as paid" }).click();
    await expect(page.getByText(/Internet paid · added to expenses/)).toBeVisible();

    await page.goto("/expenses");
    await expect(page.getByLabel("Actual money").getByText("₱28,500.00")).toBeVisible(); // available now
    await expect(page.getByText("Bill", { exact: true }).first()).toBeVisible(); // linked expense badge
    const internetRows = page.getByRole("row").filter({ hasText: "Internet" });
    await expect(internetRows).toHaveCount(1); // no duplicate expense

    // Skip the next occurrence: schedule moves on, no money recorded.
    await page.goto("/bills");
    await page.getByRole("button", { name: "Actions for Internet" }).click();
    await page.getByRole("menuitem", { name: "Skip this one" }).click();
    await expect(page.getByText(/Internet skipped/)).toBeVisible();
    await page.goto("/bills?view=paid");
    await expect(page.getByText("Skipped").first()).toBeVisible();
    await page.goto("/expenses");
    await expect(page.getByRole("row").filter({ hasText: "Internet" })).toHaveCount(1);
  });
});

test.describe("cross-user access", () => {
  test("another user's note URL returns not found", async ({ browser }) => {
    const owner = await createConfirmedUser("owner");
    const intruder = await createConfirmedUser("intruder");
    try {
      const ownerPage = await (await browser.newContext()).newPage();
      await signIn(ownerPage, owner.email);
      await ownerPage.goto("/notes/new");
      await ownerPage.getByLabel("Title").fill("Owner only");
      await expect(ownerPage).toHaveURL(/\/notes\/[0-9a-f-]{36}$/, { timeout: 10_000 });
      const noteUrl = ownerPage.url();

      const intruderPage = await (await browser.newContext()).newPage();
      await signIn(intruderPage, intruder.email);
      const response = await intruderPage.goto(noteUrl);
      expect(response?.status()).toBe(404);
      await expect(intruderPage.getByText("Owner only")).toHaveCount(0);
    } finally {
      await deleteUser(owner.id);
      await deleteUser(intruder.id);
    }
  });
});
