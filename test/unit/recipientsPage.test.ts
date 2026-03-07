import { describe, expect, test } from "bun:test";
import type { Recipient } from "../../src/domain/recipient/types";
import { recipientsPage } from "../../src/web/pages/recipients";

const alice: Recipient = {
	id: "r-1",
	phone: "07700900001",
	name: "Alice Smith",
	email: "alice@example.com",
	paymentPreference: "bank",
	bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
	notes: "Prefers mornings",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Recipient = {
	id: "r-2",
	phone: "07700900002",
	name: "Bob Jones",
	paymentPreference: "cash",
	meetingPlace: "Mill Road",
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("recipientsPage", () => {
	test("renders table with recipients", () => {
		const html = recipientsPage([alice, bob]);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("Bob Jones");
		expect(html).toContain("07700900001");
		expect(html).toContain("07700900002");
	});

	test("renders empty state when no recipients", () => {
		const html = recipientsPage([]);
		expect(html).toContain("No recipients yet");
	});

	test("renders payment preference badges", () => {
		const html = recipientsPage([alice, bob]);
		expect(html).toContain("Bank");
		expect(html).toContain("Cash");
	});

	test("includes Datastar signals for search", () => {
		const html = recipientsPage([alice]);
		expect(html).toContain("data-signals");
		expect(html).toContain("search");
	});

	test("includes search input with data-bind", () => {
		const html = recipientsPage([alice]);
		expect(html).toContain("data-bind-search");
	});

	test("includes Add Recipient button", () => {
		const html = recipientsPage([]);
		expect(html).toContain("Add Recipient");
	});

	test("table rows have data-on-click for SSE fetch", () => {
		const html = recipientsPage([alice]);
		expect(html).toContain("@get");
		expect(html).toContain("/recipients/r-1/edit");
	});
});
