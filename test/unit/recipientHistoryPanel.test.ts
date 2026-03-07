import { describe, expect, test } from "bun:test";
import { historyPanel } from "../../src/web/pages/recipientHistoryPanel";

describe("historyPanel", () => {
	test("renders timeline with created event", () => {
		const html = historyPanel([
			{
				type: "RecipientCreated",
				volunteerName: "Sarah",
				timestamp: "2026-03-01T10:00:00.000Z",
			},
		]);
		expect(html).toContain("Created");
		expect(html).toContain("Sarah");
		expect(html).toContain("1 Mar 2026");
	});

	test("renders timeline with updated event", () => {
		const html = historyPanel([
			{
				type: "RecipientUpdated",
				volunteerName: "Jon",
				timestamp: "2026-03-05T14:30:00.000Z",
			},
		]);
		expect(html).toContain("Updated");
		expect(html).toContain("Jon");
		expect(html).toContain("5 Mar 2026");
	});

	test("renders created via application when no volunteer", () => {
		const html = historyPanel([
			{
				type: "RecipientCreated",
				volunteerName: null,
				timestamp: "2026-03-01T10:00:00.000Z",
			},
		]);
		expect(html).toContain("Created via application");
	});

	test("renders events in order (newest first)", () => {
		const html = historyPanel([
			{
				type: "RecipientCreated",
				volunteerName: "Sarah",
				timestamp: "2026-03-01T10:00:00.000Z",
			},
			{
				type: "RecipientUpdated",
				volunteerName: "Jon",
				timestamp: "2026-03-05T14:30:00.000Z",
			},
		]);
		const createdIdx = html.indexOf("Created");
		const updatedIdx = html.indexOf("Updated");
		expect(updatedIdx).toBeLessThan(createdIdx);
	});

	test("renders timeline with deleted event", () => {
		const html = historyPanel([
			{
				type: "RecipientDeleted",
				volunteerName: "Sarah",
				timestamp: "2026-03-06T09:00:00.000Z",
			},
		]);
		expect(html).toContain("Deleted");
		expect(html).toContain("Sarah");
		expect(html).toContain("bg-red-500");
	});

	test("shows unknown when volunteerName is null on update", () => {
		const html = historyPanel([
			{
				type: "RecipientUpdated",
				volunteerName: null,
				timestamp: "2026-03-05T14:30:00.000Z",
			},
		]);
		expect(html).toContain("Updated by");
		expect(html).toContain("unknown");
	});

	test("renders empty state when no events", () => {
		const html = historyPanel([]);
		expect(html).toContain("No history");
	});
});
