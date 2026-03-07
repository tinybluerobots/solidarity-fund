import { expect, test } from "./fixtures.ts";

test.describe("volunteer management", () => {
	test.beforeEach(async ({ serverInstance, login, page }) => {
		void serverInstance;
		await login(page);
		await page.goto("/volunteers");
		await expect(page.locator("h1", { hasText: "Volunteers" })).toBeVisible();
	});

	test("shows volunteers list with seed user", async ({ page }) => {
		await expect(page.locator("#volunteer-rows")).toContainText("Test");
		await expect(page.locator("#volunteer-rows")).toContainText("Admin");
	});

	test("creates a new volunteer", async ({ page }) => {
		await page.locator("button", { hasText: "Add Volunteer" }).click();
		await page.locator("#panel h2", { hasText: "New Volunteer" }).waitFor();

		await page.locator("input[data-bind-name]").fill("Alice Helper");
		await page.locator("input[data-bind-phone]").fill("07700900001");
		await page.locator("input[data-bind-email]").fill("alice@example.com");
		await page.locator("input[data-bind-password]").fill("secret123");

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#volunteer-rows")).toContainText("Alice Helper");
	});

	test("creates an admin volunteer", async ({ page }) => {
		await page.locator("button", { hasText: "Add Volunteer" }).click();
		await page.locator("#panel h2", { hasText: "New Volunteer" }).waitFor();

		await page.locator("input[data-bind-name]").fill("Bob Admin");
		await page.locator("input[data-bind-password]").fill("admin123");
		await page.locator("input[data-bind-is-admin]").check();

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#panel")).toContainText("Admin");
	});

	test("clicking volunteer opens edit panel", async ({ page }) => {
		await page.locator("#volunteer-rows tr", { hasText: "Test" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#panel")).toContainText("Admin");
	});

	test("edits a volunteer", async ({ page }) => {
		// Create a volunteer to edit
		await page.locator("button", { hasText: "Add Volunteer" }).click();
		await page.locator("#panel h2", { hasText: "New Volunteer" }).waitFor();
		await page.locator("input[data-bind-name]").fill("Edit Me");
		await page.locator("input[data-bind-password]").fill("pass123");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });

		// Update name
		const nameInput = page.locator("input[data-bind-name]");
		await nameInput.clear();
		await nameInput.fill("Edited Name");

		await page.locator('button[type="submit"]', { hasText: "Save" }).click();

		await expect(page.locator("#volunteer-rows")).toContainText("Edited Name", {
			timeout: 10000,
		});
	});

	test("disables a volunteer", async ({ page }) => {
		// Create a volunteer to disable
		await page.locator("button", { hasText: "Add Volunteer" }).click();
		await page.locator("#panel h2", { hasText: "New Volunteer" }).waitFor();
		await page.locator("input[data-bind-name]").fill("Disable Me");
		await page.locator("input[data-bind-password]").fill("pass123");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });

		// Click Disable Account, then Confirm
		await page.locator("#panel button", { hasText: "Disable" }).click();
		await expect(
			page.locator("#panel", { hasText: "Sure?" }),
		).toBeVisible();
		await page.locator("#panel button", { hasText: "Confirm" }).click();

		// Volunteer should be marked as disabled in the table
		await expect(
			page.locator("#volunteer-rows tr", { hasText: "Disable Me" }),
		).toContainText("Disabled", { timeout: 10000 });
	});

	test("cannot disable self", async ({ page }) => {
		// Click on the Test user (self)
		await page.locator("#volunteer-rows tr", { hasText: "Test" }).click();
		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });

		// Disable button should not be present
		await expect(
			page.locator("#panel button", { hasText: "Disable" }),
		).not.toBeVisible();
	});

	test("closes panel", async ({ page }) => {
		await page.locator("#volunteer-rows tr", { hasText: "Test" }).click();
		await expect(page.locator("#panel h2")).toBeVisible({ timeout: 10000 });

		await page.locator("#panel button", { hasText: "Close" }).click();
		await expect(page.locator("#panel h2")).not.toBeVisible({ timeout: 5000 });
	});

	test("searches volunteers by name", async ({ page }) => {
		// Create a second volunteer
		await page.locator("button", { hasText: "Add Volunteer" }).click();
		await page.locator("#panel h2", { hasText: "New Volunteer" }).waitFor();
		await page.locator("input[data-bind-name]").fill("Searchable Person");
		await page.locator("input[data-bind-password]").fill("pass123");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(
			page.locator("#panel h2", { hasText: "Edit Volunteer" }),
		).toBeVisible({ timeout: 10000 });

		// Close panel and search
		await page.locator("#panel button", { hasText: "Close" }).click();
		await page.locator("input[data-bind-search]").fill("Searchable");

		await expect(page.locator("#volunteer-rows")).toContainText(
			"Searchable Person",
		);
		// Test user row should be hidden (data-show evaluates to false)
		const testRow = page.locator("#volunteer-rows tr", { hasText: "Test" });
		await expect(testRow).not.toBeVisible({ timeout: 5000 });
	});

	test("prevents creation with empty name", async ({ page }) => {
		await page.locator("button", { hasText: "Add Volunteer" }).click();
		await page.locator("#panel h2", { hasText: "New Volunteer" }).waitFor();

		await page.locator("input[data-bind-password]").fill("pass123");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Form should still be open (HTML validation prevents submit)
		await expect(
			page.locator("#panel h2", { hasText: "New Volunteer" }),
		).toBeVisible();
	});
});
