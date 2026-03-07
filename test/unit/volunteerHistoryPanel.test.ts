import { describe, expect, test } from "bun:test";
import { volunteerHistoryPanel } from "../../src/web/pages/volunteerHistoryPanel";

describe("volunteerHistoryPanel", () => {
	test("renders created event", () => {
		const html = volunteerHistoryPanel([
			{ type: "VolunteerCreated", timestamp: "2026-03-01T10:00:00.000Z" },
		]);
		expect(html).toContain("Account created");
		expect(html).toContain("1 Mar 2026");
	});

	test("renders updated event", () => {
		const html = volunteerHistoryPanel([
			{ type: "VolunteerUpdated", timestamp: "2026-03-05T14:30:00.000Z" },
		]);
		expect(html).toContain("Details updated");
	});

	test("renders disabled event", () => {
		const html = volunteerHistoryPanel([
			{
				type: "VolunteerDisabled",
				timestamp: "2026-03-06T09:00:00.000Z",
			},
		]);
		expect(html).toContain("Account disabled");
		expect(html).toContain("bg-red-500");
	});

	test("renders enabled event", () => {
		const html = volunteerHistoryPanel([
			{ type: "VolunteerEnabled", timestamp: "2026-03-06T10:00:00.000Z" },
		]);
		expect(html).toContain("Account enabled");
	});

	test("renders password changed event", () => {
		const html = volunteerHistoryPanel([
			{ type: "PasswordChanged", timestamp: "2026-03-07T08:00:00.000Z" },
		]);
		expect(html).toContain("Password changed");
		expect(html).toContain("bg-blue-500");
	});

	test("renders newest first", () => {
		const html = volunteerHistoryPanel([
			{ type: "VolunteerCreated", timestamp: "2026-03-01T10:00:00.000Z" },
			{ type: "VolunteerUpdated", timestamp: "2026-03-05T14:30:00.000Z" },
		]);
		const createdIdx = html.indexOf("Account created");
		const updatedIdx = html.indexOf("Details updated");
		expect(updatedIdx).toBeLessThan(createdIdx);
	});

	test("renders empty state", () => {
		const html = volunteerHistoryPanel([]);
		expect(html).toContain("No history");
	});
});
