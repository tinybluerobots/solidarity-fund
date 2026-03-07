import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import { applicationsPage } from "../../src/web/pages/applications.ts";

const app: ApplicationRow = {
	id: "app-1",
	applicantId: "applicant-07700900001",
	monthCycle: "2026-03",
	status: "accepted",
	rank: null,
	paymentPreference: "cash",
	name: "Alice",
	phone: "07700900001",
	rejectReason: null,
	appliedAt: "2026-03-01T10:00:00Z",
	acceptedAt: "2026-03-01T10:00:00Z",
	selectedAt: null,
	rejectedAt: null,
};

describe("applicationsPage", () => {
	test("renders table with applications", () => {
		const html = applicationsPage([app], ["2026-03"], "2026-03");
		expect(html).toContain("Alice");
		expect(html).toContain("07700900001");
		expect(html).toContain("Applications");
	});

	test("renders empty state", () => {
		const html = applicationsPage([], ["2026-03"], "2026-03");
		expect(html).toContain("No applications");
	});

	test("renders status badges", () => {
		const flagged = { ...app, status: "flagged" };
		const html = applicationsPage([app, flagged], ["2026-03"], "2026-03");
		expect(html).toContain("Accepted");
		expect(html).toContain("Flagged");
	});

	test("renders month cycle selector", () => {
		const html = applicationsPage([app], ["2026-03", "2026-04"], "2026-03");
		expect(html).toContain("2026-03");
		expect(html).toContain("2026-04");
	});

	test("includes Datastar attributes for row click", () => {
		const html = applicationsPage([app], ["2026-03"], "2026-03");
		expect(html).toContain("@get");
		expect(html).toContain("/applications/app-1");
	});
});
