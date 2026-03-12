import { expect, test } from "./fixtures.ts";

test.describe("create applicant", () => {
	test.beforeEach(async ({ serverInstance, login, page }) => {
		void serverInstance;
		await login(page);
		await page.goto("/applicants");
		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();
	});

	test("creates applicant with name and phone", async ({ page }) => {
		await page.locator("input[data-bind\\:name]").fill("Alice Smith");
		await page.locator("input[data-bind\\:phone]").fill("07700900001");

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Applicant" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#applicant-rows")).toContainText("Alice Smith");
		await expect(page.locator("#applicant-rows")).toContainText("07700900001");
	});

	test("creates applicant with all fields", async ({ page }) => {
		await page.locator("input[data-bind\\:name]").fill("Carol White");
		await page.locator("input[data-bind\\:phone]").fill("07700900003");
		await page.locator("input[data-bind\\:email]").fill("carol@example.com");

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Applicant" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#applicant-rows")).toContainText("Carol White");
	});

	test("prevents submission with empty name", async ({ page }) => {
		await page.locator("input[data-bind\\:phone]").fill("07700900010");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Form should still be open
		await expect(
			page.locator("#panel h2", { hasText: "New Applicant" }),
		).toBeVisible();

		// No applicant should appear in the table
		await expect(page.locator("#applicant-rows")).not.toContainText(
			"07700900010",
		);
	});

	test("prevents submission with empty phone", async ({ page }) => {
		await page.locator("input[data-bind\\:name]").fill("No Phone Person");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Form should still be open
		await expect(
			page.locator("#panel h2", { hasText: "New Applicant" }),
		).toBeVisible();

		// No applicant should appear in the table
		await expect(page.locator("#applicant-rows")).not.toContainText(
			"No Phone Person",
		);
	});

	test("rejects duplicate phone number", async ({ page }) => {
		// Create first applicant
		await page.locator("input[data-bind\\:name]").fill("First Person");
		await page.locator("input[data-bind\\:phone]").fill("07700900099");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Applicant" }),
		).toBeVisible({ timeout: 10000 });

		// Navigate back to get a clean page state
		await page.goto("/applicants");
		await expect(page.locator("#applicant-rows")).toContainText(
			"First Person",
			{
				timeout: 10000,
			},
		);

		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();

		await page.locator("input[data-bind\\:name]").fill("Second Person");
		await page.locator("input[data-bind\\:phone]").fill("07700900099");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Wait for the server to process (it will fail with SQLITE_CONSTRAINT)
		await page.waitForTimeout(2000);

		// The edit panel for "Second Person" should NOT appear — the create failed
		await expect(
			page.locator("#panel h2", { hasText: "Second Person" }),
		).not.toBeVisible();
	});
});
