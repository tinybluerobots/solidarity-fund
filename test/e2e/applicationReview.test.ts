import {
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	submitApplication,
	test,
} from "./fixtures.ts";

async function setupAccepted(
	page: ReturnType<typeof test> extends { page: infer P } ? P : never,
	login: (p: ReturnType<typeof test> extends { page: infer P } ? P : never) => Promise<void>,
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
}

async function openApplicationPanel(page: ReturnType<typeof test> extends { page: infer P } ? P : never, name: string) {
	await page.goto("/applications");
	await expect(page.locator("tr", { hasText: name })).toBeVisible({
		timeout: 10000,
	});
	await page.locator("tr", { hasText: name }).click();
	await expect(page.locator("#panel")).toContainText(name, {
		timeout: 10000,
	});
}

test.describe("application review", () => {
	test("accepted application detail shows Confirm/Reject buttons", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupAccepted(page, login, "Review Alice", "07700900001");

		await openApplicationPanel(page, "Review Alice");

		const panel = page.locator("#panel");
		await expect(panel.locator("button", { hasText: "Confirm" })).toBeVisible();
		await expect(panel.locator("button", { hasText: "Reject" })).toBeVisible();
	});

	test("confirm an accepted application", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupAccepted(page, login, "Review Bob", "07700900002");

		await openApplicationPanel(page, "Review Bob");
		await page.locator("#panel button", { hasText: "Confirm" }).click();

		await expect(page.locator("#panel")).toContainText("confirmed", {
			timeout: 10000,
		});

		await page.goto("/applications");
		const row = page.locator("tr", { hasText: "Review Bob" });
		await expect(row).toContainText("Confirmed", { timeout: 5000 });
	});

	test("reject an accepted application", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupAccepted(page, login, "Review Carol", "07700900003");

		await openApplicationPanel(page, "Review Carol");
		await page.locator("#panel button", { hasText: "Reject" }).click();

		await expect(page.locator("#panel")).toContainText("rejected", {
			timeout: 10000,
		});
		await page.goto("/applications");
		const row = page.locator("tr", { hasText: "Review Carol" });
		await expect(row).toContainText("Rejected", { timeout: 5000 });
	});

	test("revert a confirmed application back to flagged", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupAccepted(page, login, "Review Dan", "07700900004");

		await openApplicationPanel(page, "Review Dan");
		await page.locator("#panel button", { hasText: "Confirm" }).click();

		await expect(
			page.locator("#panel button", { hasText: "Revert Decision" }),
		).toBeVisible({ timeout: 10000 });

		await page.locator("#panel button", { hasText: "Revert Decision" }).click();

		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).toBeVisible({ timeout: 10000 });
		await expect(page.locator("#panel")).toContainText("flagged for manual review");
	});

	test("cannot review a confirmed application twice", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupAccepted(page, login, "Review Eve", "07700900005");

		await openApplicationPanel(page, "Review Eve");
		await page.locator("#panel button", { hasText: "Confirm" }).click();
		await expect(page.locator("#panel")).toContainText("confirmed", {
			timeout: 10000,
		});

		await page.locator("#panel button", { hasText: "Close" }).click();
		await page.locator("tr", { hasText: "Review Eve" }).click();
		await expect(page.locator("#panel")).toContainText("Eve", {
			timeout: 10000,
		});
		await expect(page.locator("#panel button", { hasText: "Confirm" })).not.toBeVisible();
	});
});
