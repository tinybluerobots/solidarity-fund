import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { toApplicantId } from "../../src/domain/application/applicantId.ts";
import { checkEligibility } from "../../src/domain/application/checkEligibility.ts";
import { reviewApplication } from "../../src/domain/application/reviewApplication.ts";
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

	describe("application window gate", () => {
		test("window not opened → checkEligibility returns window_closed", async () => {
			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "window_closed" });
		});

		test("window not opened → Submitted + Rejected(window_closed)", async () => {
			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);

			const { events } = await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-03",
					eligibility,
				},
				eventStore,
				recipientRepo,
			);

			expect(events).toHaveLength(2);
			expect(events[0]!.type).toBe("ApplicationSubmitted");
			expect(events[1]!.type).toBe("ApplicationRejected");
			expect(events[1]!.data).toMatchObject({
				reason: "window_closed",
				detail: "Application window is not open",
			});
		});

		test("window open → eligible", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});

		test("window closed → checkEligibility returns window_closed", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowClosed",
					data: {
						monthCycle: "2026-03",
						closedAt: "2026-03-31T23:59:59Z",
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "window_closed" });
		});
	});

	describe("eligibility end-to-end", () => {
		test("accepted grant blocks same month (duplicate)", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

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

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "duplicate" });

			const { events } = await submitApplication(
				{
					applicationId: "app-2",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-03",
					eligibility,
				},
				eventStore,
				recipientRepo,
			);

			expect(events[1]!.type).toBe("ApplicationRejected");
			expect(events[1]!.data).toMatchObject({ reason: "duplicate" });
		});

		test("accepted-only does not trigger cooldown", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

			await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-01",
					eligibility: { status: "eligible" },
				},
				eventStore,
				recipientRepo,
			);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});

		test("selected application triggers cooldown in following months", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

			await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-01",
					eligibility: { status: "eligible" },
				},
				eventStore,
				recipientRepo,
			);

			// Simulate lottery selection
			await eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: toApplicantId("07700900001"),
						monthCycle: "2026-01",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({
				status: "cooldown",
				lastGrantMonth: "2026-01",
			});

			const { events } = await submitApplication(
				{
					applicationId: "app-2",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-03",
					eligibility,
				},
				eventStore,
				recipientRepo,
			);

			expect(events[1]!.type).toBe("ApplicationRejected");
			expect(events[1]!.data).toMatchObject({ reason: "cooldown" });
		});

		test("eligible after cooldown expires", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

			await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2025-11",
					eligibility: { status: "eligible" },
				},
				eventStore,
				recipientRepo,
			);

			// Select so cooldown would apply if within window
			await eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: toApplicantId("07700900001"),
						monthCycle: "2025-11",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });

			const { events } = await submitApplication(
				{
					applicationId: "app-2",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-03",
					eligibility,
				},
				eventStore,
				recipientRepo,
			);

			expect(events[1]!.type).toBe("ApplicationAccepted");
		});

		test("rejected grant does not block reapplication", async () => {
			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

			await submitApplication(
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

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});
	});

	describe("volunteer review of flagged application", () => {
		async function submitFlagged() {
			// First application creates the recipient
			await submitApplication(
				{
					applicationId: "app-first",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					monthCycle: "2026-01",
					eligibility: { status: "eligible" },
				},
				eventStore,
				recipientRepo,
			);

			// Second application with different name → flagged
			const { events } = await submitApplication(
				{
					applicationId: "app-flagged",
					phone: "07700900001",
					name: "Bob",
					paymentPreference: "cash",
					meetingPlace: "Station",
					monthCycle: "2026-06",
					eligibility: { status: "eligible" },
				},
				eventStore,
				recipientRepo,
			);

			expect(events[1]!.type).toBe("ApplicationFlaggedForReview");
			return events;
		}

		test("volunteer confirms eligible flagged application → ApplicationConfirmed", async () => {
			await submitFlagged();

			await eventStore.appendToStream("lottery-2026-06", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-06",
						openedAt: "2026-06-01T00:00:00Z",
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-06",
				pool,
			);

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				eventStore,
			);

			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicationConfirmed");
			expect(events[0]!.data).toMatchObject({
				volunteerId: "vol-1",
				applicantId: "applicant-07700900001",
			});
		});

		test("volunteer confirms but applicant in cooldown → ApplicationRejected", async () => {
			await submitFlagged();

			await eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-03",
						openedAt: "2026-03-01T00:00:00Z",
					},
				},
			]);

			// Select the first application so cooldown triggers
			await eventStore.appendToStream("application-app-first", [
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-first",
						applicantId: toApplicantId("07700900001"),
						monthCycle: "2026-01",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-03",
				pool,
			);
			expect(eligibility.status).toBe("cooldown");

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				eventStore,
			);

			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicationRejected");
			expect(events[0]!.data).toMatchObject({
				reason: "cooldown",
				volunteerId: "vol-1",
			});
		});

		test("volunteer rejects flagged application → ApplicationRejected with identity_mismatch", async () => {
			await submitFlagged();

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"reject",
				{ status: "eligible" },
				eventStore,
			);

			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicationRejected");
			expect(events[0]!.data).toMatchObject({
				reason: "identity_mismatch",
				volunteerId: "vol-1",
			});
		});

		test("confirmed application creates accepted row in applications projection", async () => {
			await submitFlagged();

			await eventStore.appendToStream("lottery-2026-06", [
				{
					type: "ApplicationWindowOpened",
					data: {
						monthCycle: "2026-06",
						openedAt: "2026-06-01T00:00:00Z",
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001"),
				"2026-06",
				pool,
			);
			await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				eventStore,
			);

			const apps = await pool.withConnection(async (conn) =>
				conn.query<{ id: string; status: string }>(
					"SELECT id, status FROM applications WHERE id = ?",
					["app-flagged"],
				),
			);
			expect(apps).toHaveLength(1);
			expect(apps[0]!.status).toBe("accepted");
		});

		test("cannot review non-flagged application", async () => {
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

			await expect(
				reviewApplication(
					"app-1",
					"vol-1",
					"confirm",
					{ status: "eligible" },
					eventStore,
				),
			).rejects.toThrow(/cannot review/i);
		});
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
