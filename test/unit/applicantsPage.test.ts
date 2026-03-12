import { describe, expect, test } from "bun:test";
import type { Applicant } from "../../src/domain/applicant/types";
import { applicantsPage } from "../../src/web/pages/applicants";

const alice: Applicant = {
	id: "a-1",
	phone: "07700900001",
	name: "Alice Smith",
	email: "alice@example.com",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Applicant = {
	id: "a-2",
	phone: "07700900002",
	name: "Bob Jones",
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("applicantsPage", () => {
	test("renders table with applicants", () => {
		const html = applicantsPage([alice, bob]);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("Bob Jones");
		expect(html).toContain("07700900001");
		expect(html).toContain("07700900002");
	});

	test("renders empty state when no applicants", () => {
		const html = applicantsPage([]);
		expect(html).toContain("No applicants yet");
	});

	test("includes Datastar signals for search", () => {
		const html = applicantsPage([alice]);
		expect(html).toContain("data-signals");
		expect(html).toContain("search");
	});

	test("includes search input with data-bind", () => {
		const html = applicantsPage([alice]);
		expect(html).toContain("data-bind:search");
	});

	test("includes Add Applicant button", () => {
		const html = applicantsPage([]);
		expect(html).toContain("Add Applicant");
	});

	test("table rows have data-on-click for SSE fetch", () => {
		const html = applicantsPage([alice]);
		expect(html).toContain("@get");
		expect(html).toContain("/applicants/a-1/edit");
	});
});
