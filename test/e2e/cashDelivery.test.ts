import {
	assignVolunteer,
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	submitApplication,
	test,
} from "./fixtures.ts";

test.describe("cash delivery happy path", () => {
	test("applicant → accepted → selected → cash paid → reimbursed", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// ── Step 1: Open lottery window ──────────────────────────
		await openLotteryWindow(page);

		// ── Step 2: Submit public application (cash) ────────────
		const { ok, url } = await submitApplication(page, {
			name: "Cash Tester",
			phone: "07700900555",
			paymentPreference: "cash",
		});
		expect(ok).toBe(true);
		expect(url).toContain("status=accepted");

		// Verify application is accepted before the draw
		await page.goto("/applications");
		await expect(page.locator("text=Cash Tester")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator("tr", { hasText: "Cash Tester" })).toContainText(
			"Accepted",
			{ timeout: 5000 },
		);

		// ── Step 3: Close window + run draw ──────────────────────
		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 500 });

		// Verify application shows on applications page
		await expect(page.locator("text=Cash Tester")).toBeVisible({
			timeout: 10000,
		});

		// Check application status is "Selected"
		const row = page.locator("tr", { hasText: "Cash Tester" });
		await expect(row).toContainText("Selected", { timeout: 5000 });

		// ── Step 4: Navigate to grants board ─────────────────────
		await page.goto("/grants");
		await expect(page.locator("text=Cash Tester")).toBeVisible({
			timeout: 10000,
		});

		// Click the grant card to open the panel
		await page.locator("text=Cash Tester").click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Cash Handover",
			{ timeout: 10000 },
		);

		// ── Step 5: Assign volunteer, then record cash payment ───
		await assignVolunteer(page);
		await page.locator("input[data-bind\\:paymentamount]").fill("40");
		await page.locator("button", { hasText: "Record Payment" }).click();
		await expect(page.locator("#panel")).toContainText(
			"Awaiting Reimbursement",
			{ timeout: 10000 },
		);

		// ── Step 6: Record reimbursement ─────────────────────────
		await page.locator("input[data-bind\\:expenseref]").fill("OC-12345");
		await page.locator("button", { hasText: "Record Reimbursement" }).click();
		await expect(page.locator("#panel")).toContainText("Reimbursed", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("OC-12345");

		// ── Step 7: Verify grant card shows in the board
		await expect(page.locator("#grants-board")).toContainText("Cash Tester", {
			timeout: 10000,
		});
	});
});
