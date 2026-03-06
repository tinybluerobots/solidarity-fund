import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";
import {
	acceptCashAlternative,
	approveProofOfAddress,
	assignVolunteer,
	declineCashAlternative,
	recordPayment,
	recordReimbursement,
	rejectProofOfAddress,
	releaseSlot,
	submitBankDetails,
} from "../../src/domain/grant/commandHandlers.ts";
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

describe("grant payment end-to-end", () => {
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

	async function selectWinner(
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

		const { events } = await eventStore.readStream<ApplicationEvent>(
			`application-${appId}`,
		);
		const selected = events.find((e) => e.type === "ApplicationSelected");
		expect(selected).toBeDefined();

		await processApplicationSelected(selected!, eventStore, pool);
	}

	test("bank path: submit details -> approve POA -> pay", async () => {
		const appId = "app-bank-pay";
		await selectWinner(appId, "07700900020", "Alice", "bank");

		await assignVolunteer(appId, "vol-1", eventStore);
		await submitBankDetails(
			appId,
			{
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-1",
			},
			eventStore,
		);
		await approveProofOfAddress(appId, "vol-1", eventStore);
		await recordPayment(
			appId,
			{ amount: 40, method: "bank", paidBy: "vol-1" },
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.method).toBe("bank");
		expect(paid!.data.amount).toBe(40);
	});

	test("cash path: straight to payment", async () => {
		const appId = "app-cash-pay";
		await selectWinner(appId, "07700900021", "Bob", "cash");

		await recordPayment(
			appId,
			{ amount: 40, method: "cash", paidBy: "vol-2" },
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.method).toBe("cash");
	});

	test("3 POA rejections -> accept cash alternative -> pay", async () => {
		const appId = "app-poa-cash";
		await selectWinner(appId, "07700900022", "Charlie", "bank");

		for (let i = 0; i < 3; i++) {
			await submitBankDetails(
				appId,
				{
					sortCode: "12-34-56",
					accountNumber: "12345678",
					proofOfAddressRef: `poa-ref-${i}`,
				},
				eventStore,
			);
			await rejectProofOfAddress(appId, "Bad document", "vol-1", eventStore);
		}

		await acceptCashAlternative(appId, eventStore);
		await recordPayment(
			appId,
			{ amount: 40, method: "cash", paidBy: "vol-1" },
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const types = events.map((e) => e.type);
		expect(types).toContain("CashAlternativeOffered");
		expect(types).toContain("CashAlternativeAccepted");
		expect(types).toContain("GrantPaid");

		const paid = events.find((e) => e.type === "GrantPaid")!;
		expect(paid.data.method).toBe("cash");
	});

	test("3 POA rejections -> decline cash -> slot released", async () => {
		const appId = "app-poa-decline";
		await selectWinner(appId, "07700900023", "Diana", "bank");

		for (let i = 0; i < 3; i++) {
			await submitBankDetails(
				appId,
				{
					sortCode: "12-34-56",
					accountNumber: "12345678",
					proofOfAddressRef: `poa-ref-${i}`,
				},
				eventStore,
			);
			await rejectProofOfAddress(appId, "Bad document", "vol-1", eventStore);
		}

		await declineCashAlternative(appId, eventStore);

		const { events } = await eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const released = events.find((e) => e.type === "SlotReleased");
		expect(released).toBeDefined();
	});

	test("cash path: payment -> reimbursement", async () => {
		const appId = "app-cash-reimburse";
		await selectWinner(appId, "07700900030", "Frank", "cash");

		await recordPayment(
			appId,
			{ amount: 40, method: "cash", paidBy: "vol-1" },
			eventStore,
		);
		await recordReimbursement(
			appId,
			{
				volunteerId: "vol-1",
				expenseReference: "https://opencollective.com/csf/expenses/456",
			},
			eventStore,
		);

		const { events } = await eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const reimbursed = events.find((e) => e.type === "VolunteerReimbursed");
		expect(reimbursed).toBeDefined();
		expect(reimbursed!.data.expenseReference).toBe(
			"https://opencollective.com/csf/expenses/456",
		);
	});

	test("bank path: no reimbursement step", async () => {
		const appId = "app-bank-no-reimburse";
		await selectWinner(appId, "07700900031", "Grace", "bank");

		await submitBankDetails(appId, {
			sortCode: "12-34-56",
			accountNumber: "12345678",
			proofOfAddressRef: "poa-ref-1",
		}, eventStore);
		await approveProofOfAddress(appId, "vol-1", eventStore);
		await recordPayment(
			appId,
			{ amount: 40, method: "bank", paidBy: "vol-1" },
			eventStore,
		);

		await expect(
			recordReimbursement(
				appId,
				{ volunteerId: "vol-1", expenseReference: "ref-1" },
				eventStore,
			),
		).rejects.toThrow(/cannot record reimbursement/i);
	});

	test("volunteer releases unresponsive winner", async () => {
		const appId = "app-release";
		await selectWinner(appId, "07700900024", "Eve", "bank");

		await releaseSlot(appId, "No response after 14 days", "vol-1", eventStore);

		const { events } = await eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const released = events.find((e) => e.type === "SlotReleased");
		expect(released).toBeDefined();
		expect(released!.data.reason).toBe("No response after 14 days");
		expect(released!.data.releasedBy).toBe("vol-1");
	});
});
