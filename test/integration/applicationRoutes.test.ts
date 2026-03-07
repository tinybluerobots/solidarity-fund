import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../src/domain/application/repository.ts";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import { createApplicationRoutes } from "../../src/web/routes/applications.ts";

describe("application routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;
	let appRepo: ApplicationRepository;
	let routes: ReturnType<typeof createApplicationRoutes>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
		appRepo = SQLiteApplicationRepository(pool);
		routes = createApplicationRoutes(appRepo, recipientRepo, eventStore, pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	async function seedApp(
		id: string,
		month: string,
		name: string,
		phone: string,
	) {
		await eventStore.appendToStream(`lottery-${month}`, [
			{
				type: "ApplicationWindowOpened",
				data: { monthCycle: month, openedAt: `${month}-01T00:00:00Z` },
			},
		]);
		await submitApplication(
			{
				applicationId: id,
				phone,
				name,
				paymentPreference: "cash",
				meetingPlace: "Mill Road",
				monthCycle: month,
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);
	}

	describe("list", () => {
		test("returns HTML page with applications for given month", async () => {
			await seedApp("app-1", "2026-03", "Alice", "07700900001");
			const res = await routes.list("2026-03");
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Alice");
		});

		test("returns empty state for month with no applications", async () => {
			const res = await routes.list("2026-03");
			const html = await res.text();
			expect(html).toContain("No applications");
		});
	});

	describe("detail", () => {
		test("returns SSE with view panel", async () => {
			await seedApp("app-1", "2026-03", "Alice", "07700900001");
			const res = await routes.detail("app-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
			const body = await res.text();
			expect(body).toContain("Alice");
		});

		test("returns review panel for flagged application", async () => {
			await seedApp("app-first", "2025-12", "Alice", "07700900001");

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

			const res = await routes.detail("app-flagged");
			const body = await res.text();
			expect(body).toContain("Confirm");
			expect(body).toContain("Reject");
		});

		test("returns 404 for unknown id", async () => {
			const res = await routes.detail("nonexistent");
			expect(res.status).toBe(404);
		});
	});

	describe("handleReview", () => {
		test("confirms flagged application", async () => {
			await seedApp("app-first", "2025-12", "Alice", "07700900001");

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

			const res = await routes.handleReview("app-flagged", "confirm", "vol-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await appRepo.getById("app-flagged");
			expect(updated!.status).toBe("accepted");
		});

		test("rejects flagged application", async () => {
			await seedApp("app-first", "2025-12", "Alice", "07700900001");

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

			const res = await routes.handleReview("app-flagged", "reject", "vol-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await appRepo.getById("app-flagged");
			expect(updated!.status).toBe("rejected");
		});
	});

	describe("closePanel", () => {
		test("returns SSE with empty panel div", () => {
			const res = routes.closePanel();
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
		});
	});
});
