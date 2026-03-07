import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { checkEligibility } from "../../src/domain/application/checkEligibility.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

describe("checkEligibility", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
	});

	afterEach(async () => {
		await pool.close();
	});

	async function openWindow(monthCycle: string) {
		await eventStore.appendToStream(`lottery-${monthCycle}`, [
			{
				type: "ApplicationWindowOpened",
				data: { monthCycle, openedAt: "2026-01-01T00:00:00Z" },
			},
		]);
	}

	async function submitAndAccept(
		applicantId: string,
		monthCycle: string,
		applicationId: string,
	) {
		await eventStore.appendToStream(`application-${applicationId}`, [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId,
					applicantId,
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle,
					submittedAt: new Date().toISOString(),
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId,
					applicantId,
					monthCycle,
					acceptedAt: new Date().toISOString(),
				},
			},
		]);
	}

	async function submitAcceptAndSelect(
		applicantId: string,
		monthCycle: string,
		applicationId: string,
	) {
		await submitAndAccept(applicantId, monthCycle, applicationId);
		await eventStore.appendToStream(`application-${applicationId}`, [
			{
				type: "ApplicationSelected",
				data: {
					applicationId,
					applicantId,
					monthCycle,
					rank: 1,
					selectedAt: new Date().toISOString(),
				},
			},
		]);
	}

	test("eligible when prior application was not_selected", async () => {
		await openWindow("2026-04");
		await submitAndAccept("applicant-07700900001", "2026-03", "app-1");
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationNotSelected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					notSelectedAt: new Date().toISOString(),
				},
			},
		]);

		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-04",
			pool,
		);
		expect(result).toEqual({ status: "eligible" });
	});

	test("cooldown returns most recent selected month", async () => {
		await openWindow("2026-03");
		await submitAcceptAndSelect("applicant-07700900001", "2026-01", "app-1");
		await submitAcceptAndSelect("applicant-07700900001", "2026-02", "app-2");

		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-03",
			pool,
		);
		expect(result).toEqual({ status: "cooldown", lastGrantMonth: "2026-02" });
	});

	test("different applicant is not affected", async () => {
		await openWindow("2026-03");
		await submitAcceptAndSelect("applicant-07700900002", "2026-03", "app-1");

		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-03",
			pool,
		);
		expect(result).toEqual({ status: "eligible" });
	});

	test("cooldown across year boundary", async () => {
		await openWindow("2026-02");
		await submitAcceptAndSelect("applicant-07700900001", "2025-12", "app-1");

		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-02",
			pool,
		);
		expect(result).toEqual({
			status: "cooldown",
			lastGrantMonth: "2025-12",
		});
	});

	test("accepted-only does not trigger cooldown", async () => {
		await openWindow("2026-03");
		await submitAndAccept("applicant-07700900001", "2026-01", "app-1");

		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-03",
			pool,
		);
		expect(result).toEqual({ status: "eligible" });
	});
});
