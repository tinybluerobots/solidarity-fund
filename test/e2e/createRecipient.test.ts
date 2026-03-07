import { expect, test } from "./fixtures.ts";

test.describe("create recipient", () => {
	test.beforeEach(async ({ serverInstance, login, page }) => {
		void serverInstance;
		await login(page);
		await page.goto("/recipients");
		await page.locator("button", { hasText: "Add Recipient" }).click();
		await page.locator("#panel h2", { hasText: "New Recipient" }).waitFor();
	});

	test("creates recipient with cash payment", async ({ page }) => {
		await page.locator("input[data-bind-name]").fill("Alice Smith");
		await page.locator("input[data-bind-phone]").fill("07700900001");

		// Cash is default — meeting place should be visible
		const meetingPlaceInput = page.locator("input[data-bind-meeting-place]");
		await meetingPlaceInput.waitFor({ state: "visible" });
		await meetingPlaceInput.fill("Town Hall");

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Recipient" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#recipient-rows")).toContainText("Alice Smith");
		await expect(page.locator("#recipient-rows")).toContainText("07700900001");
	});

	test("creates recipient with bank payment", async ({ page }) => {
		await page.locator("input[data-bind-name]").fill("Bob Jones");
		await page.locator("input[data-bind-phone]").fill("07700900002");

		await page.locator('input[type="radio"][value="bank"]').check();

		const sortCodeInput = page.locator("input[data-bind-sort-code]");
		await sortCodeInput.waitFor({ state: "visible", timeout: 10000 });
		await sortCodeInput.fill("12-34-56");
		await page.locator("input[data-bind-account-number]").fill("12345678");

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Recipient" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#recipient-rows")).toContainText("Bob Jones");
	});

	test("creates recipient with all optional fields", async ({ page }) => {
		await page.locator("input[data-bind-name]").fill("Carol White");
		await page.locator("input[data-bind-phone]").fill("07700900003");
		await page.locator("input[data-bind-email]").fill("carol@example.com");

		const meetingPlaceInput = page.locator("input[data-bind-meeting-place]");
		await meetingPlaceInput.waitFor({ state: "visible" });
		await meetingPlaceInput.fill("Library");

		await page.locator("textarea[data-bind-notes]").fill("Prefers mornings");

		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Recipient" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#recipient-rows")).toContainText("Carol White");
	});

	test("prevents submission with empty name", async ({ page }) => {
		await page.locator("input[data-bind-phone]").fill("07700900010");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Form should still be open
		await expect(
			page.locator("#panel h2", { hasText: "New Recipient" }),
		).toBeVisible();

		// No recipient should appear in the table
		await expect(page.locator("#recipient-rows")).not.toContainText(
			"07700900010",
		);
	});

	test("prevents submission with empty phone", async ({ page }) => {
		await page.locator("input[data-bind-name]").fill("No Phone Person");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Form should still be open
		await expect(
			page.locator("#panel h2", { hasText: "New Recipient" }),
		).toBeVisible();

		// No recipient should appear in the table
		await expect(page.locator("#recipient-rows")).not.toContainText(
			"No Phone Person",
		);
	});

	test("rejects duplicate phone number", async ({ page }) => {
		// Create first recipient
		await page.locator("input[data-bind-name]").fill("First Person");
		await page.locator("input[data-bind-phone]").fill("07700900099");
		const meetingPlaceInput = page.locator("input[data-bind-meeting-place]");
		await meetingPlaceInput.waitFor({ state: "visible" });
		await meetingPlaceInput.fill("Park");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Recipient" }),
		).toBeVisible({ timeout: 10000 });

		// Navigate back to get a clean page state
		await page.goto("/recipients");
		await expect(page.locator("#recipient-rows")).toContainText(
			"First Person",
			{
				timeout: 10000,
			},
		);

		await page.locator("button", { hasText: "Add Recipient" }).click();
		await page.locator("#panel h2", { hasText: "New Recipient" }).waitFor();

		await page.locator("input[data-bind-name]").fill("Second Person");
		await page.locator("input[data-bind-phone]").fill("07700900099");
		const meetingPlace2 = page.locator("input[data-bind-meeting-place]");
		await meetingPlace2.waitFor({ state: "visible" });
		await meetingPlace2.fill("Square");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();

		// Wait for the server to process (it will fail with SQLITE_CONSTRAINT)
		await page.waitForTimeout(2000);

		// The edit panel for "Second Person" should NOT appear — the create failed
		await expect(
			page.locator("#panel h2", { hasText: "Second Person" }),
		).not.toBeVisible();
	});
});
