import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/application/decider.ts";
import type {
	ApplicationEvent,
	SubmitApplication,
} from "../../src/domain/application/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

function makeCommand(
	overrides: Partial<SubmitApplication["data"]> = {},
): SubmitApplication {
	return {
		type: "SubmitApplication",
		data: {
			applicationId: "app-1",
			identity: { phone: "07700900001", name: "Alice" },
			paymentPreference: "bank",
			meetingDetails: { place: "Mill Road" },
			monthCycle: "2026-03",
			identityResolution: { type: "new" },
			eligibility: { status: "eligible" },
			submittedAt: "2026-03-06T12:00:00Z",
			...overrides,
		},
	};
}

describe("SubmitApplication", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;

	beforeEach(() => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
	});

	afterEach(async () => {
		await pool.close();
	});

	test("new eligible applicant → Submitted + Accepted", async () => {
		const cmd = makeCommand();
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const { events } = await eventStore.readStream<ApplicationEvent>(streamId);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationAccepted");
		expect(events[0]!.data.applicantId).toBe("applicant-07700900001");
	});

	test("matched existing applicant, eligible → Submitted + Accepted", async () => {
		const cmd = makeCommand({
			identityResolution: {
				type: "matched",
				applicantId: "applicant-existing-123",
			},
		});
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const { events } = await eventStore.readStream<ApplicationEvent>(streamId);
		expect(events).toHaveLength(2);
		expect(events[0]!.data.applicantId).toBe("applicant-existing-123");
		expect(events[1]!.type).toBe("ApplicationAccepted");
	});

	test("cooldown active → Submitted + Rejected(cooldown)", async () => {
		const cmd = makeCommand({
			eligibility: { status: "cooldown", lastGrantMonth: "2026-01" },
		});
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const { events } = await eventStore.readStream<ApplicationEvent>(streamId);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationRejected");
		expect(events[1]!.data).toMatchObject({
			reason: "cooldown",
			detail: "Last grant in 2026-01",
		});
	});

	test("duplicate this month → Submitted + Rejected(duplicate)", async () => {
		const cmd = makeCommand({
			eligibility: { status: "duplicate" },
		});
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const { events } = await eventStore.readStream<ApplicationEvent>(streamId);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationRejected");
		expect(events[1]!.data).toMatchObject({ reason: "duplicate" });
	});

	test("flagged identity → Submitted + FlaggedForReview", async () => {
		const cmd = makeCommand({
			identityResolution: {
				type: "flagged",
				applicantId: "applicant-suspect-456",
				reason: "Phone matches but name differs",
			},
		});
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const { events } = await eventStore.readStream<ApplicationEvent>(streamId);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationFlaggedForReview");
		expect(events[1]!.data).toMatchObject({
			applicantId: "applicant-suspect-456",
			reason: "Phone matches but name differs",
		});
	});

	test("idempotency — cannot submit twice to same stream", async () => {
		const cmd = makeCommand();
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		await expect(
			handle(eventStore, streamId, (state) => decide(cmd, state)),
		).rejects.toThrow(/already submitted/i);
	});

	test("projection — applications_this_month populated after acceptance", async () => {
		const cmd = makeCommand();
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const rows = await pool.withConnection(async (conn) =>
			conn.query(
				`SELECT * FROM applications_this_month WHERE applicant_id = 'applicant-07700900001'`,
			),
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			applicant_id: "applicant-07700900001",
			month_cycle: "2026-03",
		});
	});

	test("projection — rejection does NOT populate applications_this_month", async () => {
		const cmd = makeCommand({
			applicationId: "app-rejected",
			eligibility: { status: "duplicate" },
		});
		const streamId = `application-${cmd.data.applicationId}`;

		await handle(eventStore, streamId, (state) => decide(cmd, state));

		const rows = await pool.withConnection(async (conn) =>
			conn.query(`SELECT * FROM applications_this_month`),
		);

		expect(rows).toHaveLength(0);
	});
});
