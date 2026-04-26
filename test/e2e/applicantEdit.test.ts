import { expect, test } from "./fixtures.ts";

test.describe("applicant list edit", () => {
	test.beforeEach(async ({ serverInstance, login, page }) => {
		void serverInstance;
		await login(page);
		await page.goto("/applicants");
	});

	test("can edit second applicant with space in name", async ({ page }) => {
		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();
		await page.locator("input[data-bind\\:name]").fill("Alice Smith");
		await page.locator("input[data-bind\\:phone]").fill("07700900001");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(
			page.locator("#panel h2", { hasText: "Edit Applicant" }),
		).toBeVisible({ timeout: 10000 });

		await page.locator("button", { hasText: "Close" }).click();
		await expect(page.locator("#panel")).toBeEmpty();

		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();
		await page.locator("input[data-bind\\:name]").fill("Bob Jones");
		await page.locator("input[data-bind\\:phone]").fill("07700900002");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(
			page.locator("#panel h2", { hasText: "Edit Applicant" }),
		).toBeVisible({ timeout: 10000 });

		await page.locator("button", { hasText: "Close" }).click();
		await expect(page.locator("#panel")).toBeEmpty();

		const table = page.locator("#applicant-rows");
		await expect(table).toContainText("Bob Jones");
		await expect(table).toContainText("Alice Smith");

		await page
			.locator("#applicant-rows tr", { hasText: "Alice Smith" })
			.click();

		await expect(
			page.locator("#panel h2", { hasText: "Edit Applicant" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("input[data-bind\\:name]")).toHaveValue(
			"Alice Smith",
		);
	});
});
