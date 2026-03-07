import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { checkEligibility } from "../../src/domain/application/checkEligibility.ts";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";
import {
	decide as lotteryDecide,
	evolve as lotteryEvolve,
	initialState as lotteryInitialState,
} from "../../src/domain/lottery/decider.ts";
import { processLotteryDrawn } from "../../src/domain/lottery/processManager.ts";
import type { LotteryEvent } from "../../src/domain/lottery/types.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";

describe("lottery draw end-to-end", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	async function submitAccepted(id: string, phone: string, name: string) {
		await submitApplication(
			{
				applicationId: id,
				phone,
				name,
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);
	}

	test("full lottery flow: submit → close → draw → selections", async () => {
		await submitAccepted("app-1", "07700900001", "Alice");
		await submitAccepted("app-2", "07700900002", "Bob");
		await submitAccepted("app-3", "07700900003", "Charlie");
		await submitAccepted("app-4", "07700900004", "Diana");
		await submitAccepted("app-5", "07700900005", "Eve");

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		const lotteryStream = "lottery-2026-03";

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "OpenApplicationWindow",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
				state,
			),
		);

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		const apps = await pool.withConnection(async (conn) =>
			conn.query<{ id: string; applicant_id: string }>(
				"SELECT id, applicant_id FROM applications WHERE month_cycle = ? AND status = 'accepted'",
				["2026-03"],
			),
		);

		// balance=120, reserve=0, grant=40 → 3 winners
		const { newEvents } = await lotteryHandle(
			eventStore,
			lotteryStream,
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 120,
							reserve: 0,
							grantAmount: 40,
							applicantPool: apps.map((a) => ({
								applicationId: a.id,
								applicantId: a.applicant_id,
							})),
							seed: crypto.randomUUID(),
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		const drawn = newEvents[0]!;
		expect(drawn.type).toBe("LotteryDrawn");
		expect(drawn.data.selected).toHaveLength(3);
		expect(drawn.data.notSelected).toHaveLength(2);

		await processLotteryDrawn(drawn, eventStore);

		for (const s of drawn.data.selected) {
			const { events } = await eventStore.readStream<ApplicationEvent>(
				`application-${s.applicationId}`,
			);
			const selected = events.find((e) => e.type === "ApplicationSelected");
			expect(selected).toBeDefined();
			expect(selected!.data.rank).toBe(s.rank);
		}

		for (const ns of drawn.data.notSelected) {
			const { events } = await eventStore.readStream<ApplicationEvent>(
				`application-${ns.applicationId}`,
			);
			const notSelected = events.find(
				(e) => e.type === "ApplicationNotSelected",
			);
			expect(notSelected).toBeDefined();
		}
	});

	test("process manager is idempotent", async () => {
		await submitAccepted("app-1", "07700900001", "Alice");

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		const lotteryStream = "lottery-2026-03";

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "OpenApplicationWindow",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
				state,
			),
		);

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		const { newEvents } = await lotteryHandle(
			eventStore,
			lotteryStream,
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 40,
							reserve: 0,
							grantAmount: 40,
							applicantPool: [
								{
									applicationId: "app-1",
									applicantId: "applicant-07700900001",
								},
							],
							seed: "test-seed",
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		const drawn = newEvents[0]!;

		await processLotteryDrawn(drawn, eventStore);
		await processLotteryDrawn(drawn, eventStore);

		const { events } =
			await eventStore.readStream<ApplicationEvent>("application-app-1");
		const selected = events.filter((e) => e.type === "ApplicationSelected");
		expect(selected).toHaveLength(1);
	});

	test("selected applicant triggers cooldown", async () => {
		await submitAccepted("app-1", "07700900001", "Alice");

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		await lotteryHandle(eventStore, "lottery-2026-03", (state) =>
			lotteryDecide(
				{
					type: "OpenApplicationWindow",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
				state,
			),
		);

		await lotteryHandle(eventStore, "lottery-2026-03", (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		const { newEvents } = await lotteryHandle(
			eventStore,
			"lottery-2026-03",
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 40,
							reserve: 0,
							grantAmount: 40,
							applicantPool: [
								{
									applicationId: "app-1",
									applicantId: "applicant-07700900001",
								},
							],
							seed: "test-seed",
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		await processLotteryDrawn(newEvents[0]!, eventStore);

		await eventStore.appendToStream("lottery-2026-04", [
			{
				type: "ApplicationWindowOpened",
				data: {
					monthCycle: "2026-04",
					openedAt: "2026-04-01T00:00:00Z",
				},
			},
		]);

		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-04",
			pool,
		);
		expect(result).toEqual({ status: "cooldown", lastGrantMonth: "2026-03" });
	});
});
