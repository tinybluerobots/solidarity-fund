import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	createRecipient,
	updateRecipient,
} from "../../src/domain/recipient/commandHandlers";
import type { RecipientRepository } from "../../src/domain/recipient/repository";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository";
import { createEventStore } from "../../src/infrastructure/eventStore";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository";
import { createRecipientRoutes } from "../../src/web/routes/recipients";

function signalsRequest(
	signals: Record<string, unknown>,
	method = "POST",
): Request {
	return new Request("http://localhost/recipients", {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(signals),
	});
}

describe("recipient routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;
	let volunteerRepo: VolunteerRepository;
	let routes: ReturnType<typeof createRecipientRoutes>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
		volunteerRepo = await SQLiteVolunteerRepository(pool);
		routes = createRecipientRoutes(recipientRepo, volunteerRepo, eventStore);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("list", () => {
		test("returns HTML page with recipients", async () => {
			await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.list();
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Alice");
			expect(html).toContain("Recipients");
		});

		test("returns empty state when no recipients", async () => {
			const res = await routes.list();
			const html = await res.text();
			expect(html).toContain("No recipients yet");
		});
	});

	describe("edit", () => {
		test("returns SSE with edit form", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.edit(id);
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain("Alice");
		});
	});

	describe("create form", () => {
		test("returns SSE with empty form", () => {
			const res = routes.create();
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
		});
	});

	describe("closePanel", () => {
		test("returns SSE with empty panel div", async () => {
			const res = routes.closePanel();
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain('<div id="panel"></div>');
		});
	});

	describe("handleCreate", () => {
		test("creates recipient and returns SSE", async () => {
			const req = signalsRequest({
				name: "Charlie",
				phone: "07700900099",
				paymentPreference: "cash",
			});

			const res = await routes.handleCreate(req, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const created = await recipientRepo.getByPhone("07700900099");
			expect(created).not.toBeNull();
			expect(created?.name).toBe("Charlie");
		});

		test("returns 400 when name is missing", async () => {
			const req = signalsRequest({
				phone: "07700900099",
				paymentPreference: "cash",
			});
			const res = await routes.handleCreate(req, "volunteer-1");
			expect(res.status).toBe(400);
		});

		test("returns 400 when phone contains non-numeric characters", async () => {
			const req = signalsRequest({
				name: "Charlie",
				phone: "077-009-00099",
				paymentPreference: "cash",
			});
			const res = await routes.handleCreate(req, "volunteer-1");
			expect(res.status).toBe(400);
		});
	});

	describe("handleUpdate", () => {
		test("updates recipient and returns SSE", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const req = signalsRequest(
				{
					name: "Alicia",
					phone: "07700900001",
					paymentPreference: "cash",
				},
				"PUT",
			);

			const res = await routes.handleUpdate(id, req, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await recipientRepo.getById(id);
			expect(updated?.name).toBe("Alicia");
		});
	});

	describe("handleDelete", () => {
		test("deletes recipient and returns SSE", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.handleDelete(id, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const deleted = await recipientRepo.getById(id);
			expect(deleted).toBeNull();
		});
	});

	describe("history", () => {
		test("returns timeline with events and volunteer names", async () => {
			const { id: volId } = await createVolunteer(
				{ name: "Sarah", password: "pass123" },
				eventStore,
			);
			const { id: recipientId } = await createRecipient(
				{ phone: "07700900001", name: "Alice", volunteerId: volId },
				eventStore,
			);
			await updateRecipient(
				recipientId,
				volId,
				{ name: "Alice Updated" },
				eventStore,
			);

			const res = await routes.history(recipientId);
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain("Sarah");
			expect(body).toContain("Created");
			expect(body).toContain("Updated");
		});

		test("returns 404 for unknown recipient", async () => {
			const res = await routes.history("nonexistent");
			expect(res.status).toBe(404);
		});

		test("shows 'via application' when no volunteerId", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900002", name: "Bob" },
				eventStore,
			);
			const res = await routes.history(id);
			const body = await res.text();
			expect(body).toContain("Created via application");
		});
	});
});
