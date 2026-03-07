# Playwright E2E Tests: Create Recipient Flow

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright E2E tests covering the create recipient happy paths and validation.

**Architecture:** Playwright test fixture starts a real Bun server with in-memory SQLite, seeds a test volunteer, and provides a `login()` helper. Tests use the standard Playwright page interactions against the Datastar-driven UI.

**Tech Stack:** `@playwright/test`, Bun, in-memory SQLite

---

### Task 1: Install Playwright and create config

**Files:**
- Create: `playwright.config.ts`

**Step 1: Install Playwright**

Run: `bun install -D @playwright/test && bunx playwright install chromium`

**Step 2: Create playwright config**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3001",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
```

**Step 3: Commit**

```bash
git add playwright.config.ts package.json bun.lock
git commit -m "chore: add Playwright and config for E2E tests"
```

---

### Task 2: Create test fixture with server lifecycle and login helper

**Files:**
- Create: `test/e2e/fixtures.ts`

**Step 1: Create the fixture**

The fixture needs to:
1. Start the app server with `:memory:` SQLite on port 3001
2. Seed a test volunteer (name: "Test", password: "test")
3. Provide a `login(page)` helper that logs in via the UI
4. Tear down the server after all tests

```ts
// test/e2e/fixtures.ts
import { test as base, type Page } from "@playwright/test";
import type { Server } from "bun";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "../../src/web/server.ts";

type Fixtures = {
  serverInstance: Server;
  login: (page: Page) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  serverInstance: [
    async ({}, use) => {
      const { store, pool } = createEventStore(":memory:");
      const sessionStore = await SQLiteSessionStore(pool);
      const volunteerRepo = await SQLiteVolunteerRepository(pool);
      const recipientRepo = await SQLiteRecipientRepository(pool);

      await createVolunteer({ name: "Test", password: "test" }, store);

      const server = startServer(
        sessionStore,
        volunteerRepo,
        recipientRepo,
        store,
        3001,
      );

      await use(server);

      server.stop(true);
      await pool.close();
    },
    { scope: "test" },
  ],

  login: async ({}, use) => {
    await use(async (page: Page) => {
      await page.goto("/login");
      await page.locator("#name").fill("Test");
      await page.locator("#password").fill("test");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("/");
    });
  },
});

export { expect } from "@playwright/test";
```

**Step 2: Commit**

```bash
git add test/e2e/fixtures.ts
git commit -m "feat: add Playwright test fixture with server lifecycle and login"
```

---

### Task 3: Write happy path tests

**Files:**
- Create: `test/e2e/createRecipient.test.ts`

**Step 1: Write the test file**

Important Datastar notes for the implementor:
- The form uses `data-bind:name`, `data-bind:phone`, etc. These are standard `<input>` elements — Playwright `fill()` works.
- Radio buttons use `data-bind:payment-preference` — use `click()` on the radio input.
- Form submit triggers Datastar's `@post('/recipients')` which patches the DOM via SSE. After clicking Create, wait for the view panel or table row to appear.
- Conditional fields (bank details / meeting place) are shown/hidden via `data-show`. They exist in the DOM but are hidden — wait for visibility before filling.

```ts
// test/e2e/createRecipient.test.ts
import { test, expect } from "./fixtures.ts";

test.describe("create recipient", () => {
  test.beforeEach(async ({ serverInstance, login, page }) => {
    await login(page);
    await page.goto("/recipients");
    await page.locator("button", { hasText: "Add Recipient" }).click();
    await page.locator("#panel h2", { hasText: "New Recipient" }).waitFor();
  });

  test("creates recipient with cash payment", async ({ page }) => {
    await page.locator('input[data-bind\\:name]').fill("Alice Smith");
    await page.locator('input[data-bind\\:phone]').fill("07700900001");

    // Cash is the default payment preference
    const meetingPlaceInput = page.locator('input[data-bind\\:meeting-place]');
    await meetingPlaceInput.waitFor({ state: "visible" });
    await meetingPlaceInput.fill("Town Hall");

    await page.locator('button[type="submit"]', { hasText: "Create" }).click();

    // After creation, the view panel shows and the table updates
    await expect(page.locator("#panel h2", { hasText: "Alice Smith" })).toBeVisible();
    await expect(page.locator("#recipient-rows")).toContainText("Alice Smith");
    await expect(page.locator("#recipient-rows")).toContainText("07700900001");
  });

  test("creates recipient with bank payment", async ({ page }) => {
    await page.locator('input[data-bind\\:name]').fill("Bob Jones");
    await page.locator('input[data-bind\\:phone]').fill("07700900002");

    // Switch to bank payment
    await page.locator('input[type="radio"][value="bank"]').click();

    const sortCodeInput = page.locator('input[data-bind\\:sort-code]');
    await sortCodeInput.waitFor({ state: "visible" });
    await sortCodeInput.fill("12-34-56");

    await page.locator('input[data-bind\\:account-number]').fill("12345678");

    await page.locator('button[type="submit"]', { hasText: "Create" }).click();

    await expect(page.locator("#panel h2", { hasText: "Bob Jones" })).toBeVisible();
    await expect(page.locator("#panel")).toContainText("12-34-56");
    await expect(page.locator("#panel")).toContainText("12345678");
    await expect(page.locator("#recipient-rows")).toContainText("Bob Jones");
  });

  test("creates recipient with all optional fields", async ({ page }) => {
    await page.locator('input[data-bind\\:name]').fill("Carol White");
    await page.locator('input[data-bind\\:phone]').fill("07700900003");
    await page.locator('input[data-bind\\:email]').fill("carol@example.com");

    const meetingPlaceInput = page.locator('input[data-bind\\:meeting-place]');
    await meetingPlaceInput.waitFor({ state: "visible" });
    await meetingPlaceInput.fill("Library");

    await page.locator('textarea[data-bind\\:notes]').fill("Prefers mornings");

    await page.locator('button[type="submit"]', { hasText: "Create" }).click();

    await expect(page.locator("#panel h2", { hasText: "Carol White" })).toBeVisible();
    await expect(page.locator("#panel")).toContainText("carol@example.com");
    await expect(page.locator("#panel")).toContainText("Library");
    await expect(page.locator("#panel")).toContainText("Prefers mornings");
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `bunx playwright test test/e2e/createRecipient.test.ts`

**Step 3: Commit**

```bash
git add test/e2e/createRecipient.test.ts
git commit -m "test: add Playwright happy path tests for create recipient"
```

---

### Task 4: Write validation tests

**Files:**
- Modify: `test/e2e/createRecipient.test.ts`

**Step 1: Add validation tests to the existing describe block**

Browser-native required field validation prevents form submission when name or phone is empty. For duplicate phone, the form submits but the server should reject it.

Note: Datastar's `data-on-submit__prevent` intercepts the submit — but `required` attributes on inputs should still trigger browser validation before the Datastar handler fires. If browser validation doesn't fire (because Datastar intercepts first), we may need to adjust the approach — check whether the form actually submits with empty required fields.

```ts
test("prevents submission with empty name", async ({ page }) => {
  // Only fill phone, leave name empty
  await page.locator('input[data-bind\\:phone]').fill("07700900004");
  await page.locator('button[type="submit"]', { hasText: "Create" }).click();

  // Form should not submit — panel should still show "New Recipient"
  await expect(page.locator("#panel h2", { hasText: "New Recipient" })).toBeVisible();
  // Name input should have validation message
  const nameInput = page.locator('input[data-bind\\:name]');
  await expect(nameInput).toHaveJSProperty("validity.valueMissing", true);
});

test("prevents submission with empty phone", async ({ page }) => {
  await page.locator('input[data-bind\\:name]').fill("Dave");
  await page.locator('button[type="submit"]', { hasText: "Create" }).click();

  await expect(page.locator("#panel h2", { hasText: "New Recipient" })).toBeVisible();
  const phoneInput = page.locator('input[data-bind\\:phone]');
  await expect(phoneInput).toHaveJSProperty("validity.valueMissing", true);
});

test("rejects duplicate phone number", async ({ page }) => {
  // Create first recipient
  await page.locator('input[data-bind\\:name]').fill("First Person");
  await page.locator('input[data-bind\\:phone]').fill("07700900099");
  await page.locator('button[type="submit"]', { hasText: "Create" }).click();
  await expect(page.locator("#panel h2", { hasText: "First Person" })).toBeVisible();

  // Open create panel again
  await page.locator("button", { hasText: "Add Recipient" }).click();
  await page.locator("#panel h2", { hasText: "New Recipient" }).waitFor();

  // Try to create second recipient with same phone
  await page.locator('input[data-bind\\:name]').fill("Second Person");
  await page.locator('input[data-bind\\:phone]').fill("07700900099");
  await page.locator('button[type="submit"]', { hasText: "Create" }).click();

  // Should see an error — the exact behavior depends on how the server
  // handles UNIQUE constraint violations. Check that the second recipient
  // does NOT appear in the table.
  // Wait briefly for any response
  await page.waitForTimeout(1000);
  await expect(page.locator("#recipient-rows")).not.toContainText("Second Person");
});
```

**Step 2: Run all tests**

Run: `bunx playwright test test/e2e/createRecipient.test.ts`

Note: The `required` field validation tests may need adjustment if Datastar's `data-on-submit__prevent` bypasses native validation. If tests fail:
- Check if the form submits despite empty required fields
- If so, switch to asserting that the server returns an error / the recipient doesn't appear in the table

The duplicate phone test may also need adjustment depending on how the app handles the SQLite UNIQUE constraint error — it may crash or return a generic error. Adjust assertions accordingly.

**Step 3: Commit**

```bash
git add test/e2e/createRecipient.test.ts
git commit -m "test: add validation tests for create recipient"
```

---

### Task 5: Add E2E script to package.json and final verification

**Files:**
- Modify: `package.json`

**Step 1: Add test:e2e script**

Add to the `scripts` section of `package.json`:

```json
{
  "scripts": {
    "test:e2e": "bunx playwright test"
  }
}
```

If there's no `scripts` section yet, create one.

**Step 2: Run full suite**

Run: `bun run test:e2e`

**Step 3: Run biome check**

Run: `bunx biome check --write test/e2e/ playwright.config.ts`

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add test:e2e script"
```
