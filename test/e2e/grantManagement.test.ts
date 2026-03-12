import type { Page } from "@playwright/test";
import {
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	submitApplication,
	test,
} from "./fixtures.ts";

/** Set up a cash grant ready for management actions */
async function setupCashGrant(
	page: Page,
	login: (p: Page) => Promise<void>,
	name: string,
	phone: string,
) {
	await login(page);
	await openLotteryWindow(page);

	const { url } = await submitApplication(page, {
		name,
		phone,
		paymentPreference: "cash",
	});
	expect(url).toContain("status=accepted");

	await closeLotteryWindow(page);
	await runLotteryDraw(page, { balance: 500 });

	// Verify selected
	await page.goto("/applications");
	const row = page.locator("tr", { hasText: name });
	await expect(row).toContainText("Selected", { timeout: 5000 });
}

test.describe("grant management operations", () => {
	test("assign volunteer to grant", async ({ serverInstance, login, page }) => {
		void serverInstance;
		await setupCashGrant(page, login, "Assign Test", "07700900300");

		await page.goto("/grants");
		await page.locator("text=Assign Test").click();
		await expect(page.locator("#panel")).toContainText("Assign Test", {
			timeout: 10000,
		});

		// The seed user "Test" should be in the volunteer dropdown
		const select = page.locator("select[data-bind\\:assignvolunteerid]");
		await expect(select).toBeVisible({ timeout: 5000 });

		// Select the "Test" volunteer and assign
		await select.selectOption({ label: "Test" });
		await page.locator("#panel button", { hasText: "Assign" }).click();

		// Panel should now show "Test" as the volunteer
		await expect(page.locator("#panel")).toContainText("Test", {
			timeout: 10000,
		});
	});

	test("release slot from awaiting_cash_handover state", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupCashGrant(page, login, "Release Test", "07700900301");

		await page.goto("/grants");
		await page.locator("text=Release Test").click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Cash Handover",
			{ timeout: 10000 },
		);

		// Fill in release reason and release
		await page
			.locator("input[data-bind\\:releasereason]")
			.fill("No longer needed");
		await page.locator("#panel button", { hasText: "Release Slot" }).click();
		await expect(page.locator("#panel")).toContainText("Released", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("No longer needed");
	});

	test("POA document upload and viewing", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// Set up a bank grant — POA submitted at apply time
		await openLotteryWindow(page);
		const { url } = await submitApplication(page, {
			name: "POA Doc Test",
			phone: "07700900302",
			paymentPreference: "bank",
			sortCode: "12-34-56",
			accountNumber: "12345678",
			poa: Buffer.from("fake-png-data"),
		});
		expect(url).toContain("status=accepted");

		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 500 });

		// Grant panel should show awaiting_review with View Document link
		await page.goto("/grants");
		await page.locator("text=POA Doc Test").click();
		await expect(page.locator("#panel")).toContainText("Awaiting Review", {
			timeout: 10000,
		});

		const docLink = page.locator('#panel a:has-text("View Document")');
		await expect(docLink).toBeVisible({ timeout: 5000 });

		// Verify the document link is accessible
		const href = await docLink.getAttribute("href");
		if (!href) throw new Error("Expected POA document link to have href");
		expect(href).toContain("/documents/poa");
		const docResponse = await page.request.get(href);
		expect(docResponse.ok()).toBe(true);
		expect(docResponse.headers()["content-type"]).toBe("image/png");
	});
});
