import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import type { RecipientEvent } from "../../src/domain/recipient/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";

describe("submitApplication", () => {
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

	test("new phone → Submitted + Accepted", async () => {
		const { events } = await submitApplication(
			{
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationAccepted");
		expect(events[0]!.data.applicantId).toBe("applicant-07700900001");
	});

	test("new phone → creates recipient", async () => {
		await submitApplication(
			{
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const recipient = await recipientRepo.getByPhone("07700900001");
		expect(recipient).not.toBeNull();
		expect(recipient!.name).toBe("Alice");
		expect(recipient!.paymentPreference).toBe("bank");
		expect(recipient!.meetingPlace).toBe("Mill Road");
	});

	test("new phone → RecipientCreated event includes applicationId", async () => {
		await submitApplication(
			{
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const recipient = await recipientRepo.getByPhone("07700900001");
		const { events } = await eventStore.readStream<RecipientEvent>(
			`recipient-${recipient!.id}`,
		);
		const created = events.find((e) => e.type === "RecipientCreated");
		expect(created).toBeDefined();
		expect(created!.data.applicationId).toBe("app-1");
	});

	test("known phone → does not create duplicate recipient", async () => {
		await submitApplication(
			{
				applicationId: "app-first",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		await submitApplication(
			{
				applicationId: "app-second",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "cash",
				meetingPlace: "Market Square",
				monthCycle: "2026-04",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const recipient = await recipientRepo.getByPhone("07700900001");
		const { events } = await eventStore.readStream<RecipientEvent>(
			`recipient-${recipient!.id}`,
		);
		const createdEvents = events.filter((e) => e.type === "RecipientCreated");
		expect(createdEvents).toHaveLength(1);
	});

	test("known phone + same name → Submitted + Accepted with existing applicantId", async () => {
		await submitApplication(
			{
				applicationId: "app-first",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const { events } = await submitApplication(
			{
				applicationId: "app-second",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "cash",
				meetingPlace: "Market Square",
				monthCycle: "2026-04",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		expect(events).toHaveLength(2);
		expect(events[0]!.data.applicantId).toBe("applicant-07700900001");
		expect(events[1]!.type).toBe("ApplicationAccepted");
	});

	test("known phone + different name → Submitted + FlaggedForReview", async () => {
		await submitApplication(
			{
				applicationId: "app-first",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		const { events } = await submitApplication(
			{
				applicationId: "app-flagged",
				phone: "07700900001",
				name: "Bob",
				paymentPreference: "cash",
				meetingPlace: "Station",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);

		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationFlaggedForReview");
		expect(events[1]!.data).toMatchObject({
			applicantId: "applicant-07700900001",
			reason: "Phone matches but name differs",
		});
	});

	test("cooldown active → Submitted + Rejected", async () => {
		const { events } = await submitApplication(
			{
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "cooldown", lastGrantMonth: "2026-01" },
			},
			eventStore,
			recipientRepo,
		);

		expect(events).toHaveLength(2);
		expect(events[1]!.type).toBe("ApplicationRejected");
		expect(events[1]!.data).toMatchObject({
			reason: "cooldown",
			detail: "Last grant in 2026-01",
		});
	});

	test("duplicate this month → Submitted + Rejected", async () => {
		const { events } = await submitApplication(
			{
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "duplicate" },
			},
			eventStore,
			recipientRepo,
		);

		expect(events).toHaveLength(2);
		expect(events[1]!.type).toBe("ApplicationRejected");
		expect(events[1]!.data).toMatchObject({ reason: "duplicate" });
	});

	test("idempotency — cannot submit twice with same applicationId", async () => {
		const form = {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			paymentPreference: "bank" as const,
			meetingPlace: "Mill Road",
			monthCycle: "2026-03",
			eligibility: { status: "eligible" as const },
		};

		await submitApplication(form, eventStore, recipientRepo);
		await expect(
			submitApplication(form, eventStore, recipientRepo),
		).rejects.toThrow(/already submitted/i);
	});
});
