import type { Page } from "@playwright/test";
import {
	assignVolunteer,
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	submitApplication,
	test,
} from "./fixtures.ts";

const FAKE_POA = Buffer.from("fake-png-data");

/** Set up a bank grant: apply with bank details → draw → grant in awaiting_review */
async function setupBankGrant(
	page: Page,
	login: (p: Page) => Promise<void>,
	applicantName: string,
	phone: string,
) {
	await login(page);
	await openLotteryWindow(page);

	const { url } = await submitApplication(page, {
		name: applicantName,
		phone,
		paymentPreference: "bank",
		sortCode: "12-34-56",
		accountNumber: "12345678",
		poa: FAKE_POA,
	});
	expect(url).toContain("status=accepted");

	await closeLotteryWindow(page);
	await runLotteryDraw(page, { balance: 500 });

	// Verify selected
	await page.goto("/applications");
	const row = page.locator("tr", { hasText: applicantName });
	await expect(row).toContainText("Selected", { timeout: 5000 });
}

/** Navigate to grant panel for a specific applicant */
async function openGrantPanel(page: Page, applicantName: string) {
	await page.goto("/grants");
	await expect(page.locator(`text=${applicantName}`)).toBeVisible({
		timeout: 10000,
	});
	await page.locator(`text=${applicantName}`).click();
	await expect(page.locator("#panel")).toContainText(applicantName, {
		timeout: 10000,
	});
}

test.describe("bank transfer grant payment path", () => {
	test("full bank happy path: apply → awaiting review → approve POA → paid", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "Bank Happy", "07700900100");

		// Grant should be in "Awaiting Review" with bank details and POA doc
		await openGrantPanel(page, "Bank Happy");
		await expect(page.locator("#panel")).toContainText("Awaiting Review", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("12-34-56");
		await expect(page.locator("#panel")).toContainText("12345678");
		const docLink = page.locator('#panel a:has-text("View Document")');
		await expect(docLink).toBeVisible({ timeout: 5000 });

		// Assign volunteer, then approve POA
		await assignVolunteer(page);
		await page.locator("#panel button", { hasText: "Approve POA" }).click();
		await expect(page.locator("#panel")).toContainText("Poa Approved", {
			timeout: 10000,
		});

		// Record bank payment
		await page.locator("input[data-bind\\:paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText("Paid", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("Bank Transfer");
	});

	test("POA rejection → re-approve → paid", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "POA Retry", "07700900101");

		// Grant in awaiting_review — reject POA once
		await openGrantPanel(page, "POA Retry");
		await expect(page.locator("#panel")).toContainText("Awaiting Review", {
			timeout: 10000,
		});
		await page.locator("#panel button", { hasText: "Reject POA" }).click();

		// Still in awaiting_review (attempt 1, no cash alternative yet)
		await expect(page.locator("#panel")).toContainText("Awaiting Review", {
			timeout: 10000,
		});

		// Assign volunteer, then approve POA
		await assignVolunteer(page);
		await page.locator("#panel button", { hasText: "Approve POA" }).click();
		await expect(page.locator("#panel")).toContainText("Poa Approved", {
			timeout: 10000,
		});

		// Record bank payment
		await page.locator("input[data-bind\\:paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText("Paid", {
			timeout: 10000,
		});
	});

	test("3x POA rejection → cash alternative offered", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "POA Triple", "07700900102");

		await openGrantPanel(page, "POA Triple");

		// Reject 3 times — 3rd triggers cash alternative
		for (let attempt = 1; attempt <= 3; attempt++) {
			await expect(page.locator("#panel")).toContainText("Awaiting Review", {
				timeout: 10000,
			});
			await Promise.all([
				page.waitForResponse((resp) => resp.url().includes("reject-poa")),
				page.locator("#panel button", { hasText: "Reject POA" }).click(),
			]);
		}

		// After 3rd rejection, should offer cash alternative
		await expect(page.locator("#panel")).toContainText(
			"Offered Cash Alternative",
			{ timeout: 10000 },
		);
	});

	test("accept cash alternative → cash handover → paid → reimbursed", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "Cash Accept", "07700900103");

		await openGrantPanel(page, "Cash Accept");

		// 3x rejection to trigger cash alternative
		for (let attempt = 1; attempt <= 3; attempt++) {
			await expect(page.locator("#panel")).toContainText("Awaiting Review", {
				timeout: 10000,
			});
			await Promise.all([
				page.waitForResponse((resp) => resp.url().includes("reject-poa")),
				page.locator("#panel button", { hasText: "Reject POA" }).click(),
			]);
		}

		await expect(page.locator("#panel")).toContainText(
			"Offered Cash Alternative",
			{ timeout: 10000 },
		);

		// Accept cash alternative
		await page.locator("#panel button", { hasText: "Accept Cash" }).click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Cash Handover",
			{ timeout: 10000 },
		);

		// Assign volunteer, then record cash payment
		await assignVolunteer(page);
		await page.locator("input[data-bind\\:paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Reimbursement",
			{ timeout: 10000 },
		);

		// Record reimbursement
		await page.locator("input[data-bind\\:expenseref]").fill("OC-CASH-ALT");
		await page.locator("button", { hasText: "Record Reimbursement" }).click();
		await expect(page.locator("#panel")).toContainText("Reimbursed", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("OC-CASH-ALT");
	});

	test("decline cash alternative → slot released", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await setupBankGrant(page, login, "Cash Decline", "07700900104");

		await openGrantPanel(page, "Cash Decline");

		// 3x rejection to trigger cash alternative
		for (let attempt = 1; attempt <= 3; attempt++) {
			await expect(page.locator("#panel")).toContainText("Awaiting Review", {
				timeout: 10000,
			});
			await Promise.all([
				page.waitForResponse((resp) => resp.url().includes("reject-poa")),
				page.locator("#panel button", { hasText: "Reject POA" }).click(),
			]);
		}

		await expect(page.locator("#panel")).toContainText(
			"Offered Cash Alternative",
			{ timeout: 10000 },
		);

		// Decline cash alternative
		await page.locator("#panel button", { hasText: "Decline Cash" }).click();
		await expect(page.locator("#panel")).toContainText("Released", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText(
			"Cash alternative declined",
		);
	});
});
