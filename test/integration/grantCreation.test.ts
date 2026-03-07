import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";
import { processApplicationSelected } from "../../src/domain/grant/processManager.ts";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
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

describe("grant creation end-to-end", () => {
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

	const lotteryHandle = () =>
		CommandHandler<ReturnType<typeof lotteryInitialState>, LotteryEvent>({
			evolve: lotteryEvolve,
			initialState: lotteryInitialState,
		});

	async function submitAndSelect(
		appId: string,
		phone: string,
		name: string,
		paymentPreference: "bank" | "cash",
	) {
		await submitApplication(
			{
				applicationId: appId,
				phone,
				name,
				paymentPreference,
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const handle = lotteryHandle();
		const lotteryStream = `lottery-2026-03-${appId}`;

		await handle(eventStore, lotteryStream, (state) =>
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

		await handle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: {
						monthCycle: "2026-03",
						closedAt: "2026-03-31T23:59:59Z",
					},
				},
				state,
			),
		);

		const { newEvents } = await handle(eventStore, lotteryStream, (state) =>
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
								applicationId: appId,
								applicantId: `applicant-${phone}`,
							},
						],
						seed: `seed-${appId}`,
						drawnAt: "2026-04-01T10:00:00Z",
					},
				},
				state,
			),
		);

		const drawn = newEvents[0]!;
		await processLotteryDrawn(drawn, eventStore);

		// Get the ApplicationSelected event from the application stream
		const { events } = await eventStore.readStream<ApplicationEvent>(
			`application-${appId}`,
		);
		const selected = events.find((e) => e.type === "ApplicationSelected");
		expect(selected).toBeDefined();
		return selected!;
	}

	test("ApplicationSelected -> grant created with bank preference", async () => {
		const selected = await submitAndSelect(
			"app-bank-1",
			"07700900010",
			"Alice",
			"bank",
		);

		await processApplicationSelected(selected, eventStore, pool);

		const { events } =
			await eventStore.readStream<GrantEvent>("grant-app-bank-1");
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("GrantCreated");
		expect(events[0].data.paymentPreference).toBe("bank");
		expect(events[0].data.applicationId).toBe("app-bank-1");
		expect(events[0].data.rank).toBe(selected.data.rank);
	});

	test("ApplicationSelected -> grant created with cash preference", async () => {
		const selected = await submitAndSelect(
			"app-cash-1",
			"07700900011",
			"Bob",
			"cash",
		);

		await processApplicationSelected(selected, eventStore, pool);

		const { events } =
			await eventStore.readStream<GrantEvent>("grant-app-cash-1");
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("GrantCreated");
		expect(events[0].data.paymentPreference).toBe("cash");
		expect(events[0].data.applicationId).toBe("app-cash-1");
	});

	test("process manager is idempotent", async () => {
		const selected = await submitAndSelect(
			"app-idem-1",
			"07700900012",
			"Charlie",
			"bank",
		);

		await processApplicationSelected(selected, eventStore, pool);
		await processApplicationSelected(selected, eventStore, pool);

		const { events } =
			await eventStore.readStream<GrantEvent>("grant-app-idem-1");
		const created = events.filter((e) => e.type === "GrantCreated");
		expect(created).toHaveLength(1);
	});
});
