import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

type ApplicationRow = {
	id: string;
	applicant_id: string;
	month_cycle: string;
	status: string;
	rank: number | null;
	payment_preference: string;
	reject_reason: string | null;
	applied_at: string | null;
	accepted_at: string | null;
	selected_at: string | null;
	rejected_at: string | null;
};

describe("applicationsProjection", () => {
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

	async function queryApps(): Promise<ApplicationRow[]> {
		return pool.withConnection(async (conn) =>
			conn.query<ApplicationRow>("SELECT * FROM applications"),
		);
	}

	test("ApplicationSubmitted creates row with status applied", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps).toHaveLength(1);
		expect(apps[0]!.status).toBe("applied");
		expect(apps[0]!.payment_preference).toBe("bank");
	});

	test("stores name and phone from ApplicationSubmitted", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T10:00:00Z",
				},
			},
		]);

		const rows = await pool.withConnection(async (conn) =>
			conn.query<{ name: string; phone: string }>(
				"SELECT name, phone FROM applications WHERE id = ?",
				["app-1"],
			),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.name).toBe("Alice");
		expect(rows[0]!.phone).toBe("07700900001");
	});

	test("ApplicationAccepted updates to accepted", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("accepted");
		expect(apps[0]!.accepted_at).toBe("2026-03-01T00:00:01.000Z");
	});

	test("ApplicationSelected updates to selected with rank", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
			{
				type: "ApplicationSelected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					rank: 1,
					selectedAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("selected");
		expect(apps[0]!.rank).toBe(1);
		expect(apps[0]!.selected_at).toBe("2026-04-01T10:00:00Z");
	});

	test("ApplicationNotSelected updates to not_selected", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
			{
				type: "ApplicationNotSelected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					notSelectedAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("not_selected");
	});

	test("ApplicationRejected updates to rejected with reason", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationRejected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					reason: "cooldown",
					detail: "Last grant in 2026-01",
					monthCycle: "2026-03",
					rejectedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("rejected");
		expect(apps[0]!.reject_reason).toBe("cooldown");
	});
});
