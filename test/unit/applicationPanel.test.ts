import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import {
	reviewPanel,
	viewPanel,
} from "../../src/web/pages/applicationPanel.ts";

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

describe("viewPanel", () => {
	test("shows application details", () => {
		const html = viewPanel(app);
		expect(html).toContain("Alice");
		expect(html).toContain("07700900001");
		expect(html).toContain("Cash");
	});

	test("shows reject reason when rejected", () => {
		const rejected = { ...app, status: "rejected", rejectReason: "cooldown" };
		const html = viewPanel(rejected);
		expect(html).toContain("cooldown");
	});

	test("shows rank when selected", () => {
		const selected = { ...app, status: "selected", rank: 3 };
		const html = viewPanel(selected);
		expect(html).toContain("3");
	});

	test("has close button", () => {
		const html = viewPanel(app);
		expect(html).toContain("/applications/close");
	});

	test("shows recipient link when recipientId provided", () => {
		const html = viewPanel(app, "rec-1");
		expect(html).toContain("/applicants/rec-1/edit");
		expect(html).toContain("View Applicant");
	});

	test("omits recipient link when recipientId is null", () => {
		const html = viewPanel(app, null);
		expect(html).not.toContain("View Applicant");
	});
});

describe("reviewPanel", () => {
	test("shows confirm and reject buttons for flagged app", () => {
		const flagged = { ...app, status: "flagged" };
		const html = reviewPanel(flagged);
		expect(html).toContain("Confirm");
		expect(html).toContain("Reject");
		expect(html).toContain("@post");
	});

	test("shows application details", () => {
		const flagged = { ...app, status: "flagged" };
		const html = reviewPanel(flagged);
		expect(html).toContain("Alice");
		expect(html).toContain("07700900001");
	});

	test("shows recipient link when recipientId provided", () => {
		const flagged = { ...app, status: "flagged" };
		const html = reviewPanel(flagged, "rec-2");
		expect(html).toContain("/applicants/rec-2/edit");
		expect(html).toContain("View Applicant");
	});
});
