import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository";
import { createEventStore } from "../../src/infrastructure/eventStore";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository";
import { createVolunteerRoutes } from "../../src/web/routes/volunteers";

function signalsRequest(
	signals: Record<string, unknown>,
	method = "POST",
): Request {
	return new Request("http://localhost/volunteers", {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(signals),
	});
}

describe("volunteer routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let volunteerRepo: VolunteerRepository;
	let routes: ReturnType<typeof createVolunteerRoutes>;
	let adminId: string;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		volunteerRepo = await SQLiteVolunteerRepository(pool);
		routes = createVolunteerRoutes(volunteerRepo, eventStore);
		const result = await createVolunteer(
			{ name: "Admin", password: "admin123", isAdmin: true },
			eventStore,
		);
		adminId = result.id;
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("list", () => {
		test("returns HTML page with volunteers", async () => {
			const res = await routes.list();
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Admin");
			expect(html).toContain("Volunteers");
		});

		test("returns empty state when no volunteers", async () => {
			const es = createEventStore(":memory:");
			const emptyRepo = await SQLiteVolunteerRepository(es.pool);
			const emptyRoutes = createVolunteerRoutes(emptyRepo, es.store);
			const res = await emptyRoutes.list();
			const html = await res.text();
			expect(html).toContain("No volunteers yet");
			await es.pool.close();
		});
	});

	describe("detail", () => {
		test("returns SSE with view panel", async () => {
			const res = await routes.detail(adminId, adminId);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
			const body = await res.text();
			expect(body).toContain("Admin");
			expect(body).toContain("datastar-patch-elements");
		});

		test("returns 404 for unknown id", async () => {
			const res = await routes.detail("nonexistent", adminId);
			expect(res.status).toBe(404);
		});
	});

	describe("handleCreate", () => {
		test("creates volunteer and returns SSE", async () => {
			const req = signalsRequest({
				name: "Charlie",
				phone: "07700900099",
				password: "secret123",
				isAdmin: false,
			});

			const res = await routes.handleCreate(req);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const volunteers = await volunteerRepo.list();
			const charlie = volunteers.find((v) => v.name === "Charlie");
			expect(charlie).not.toBeNull();
			expect(charlie?.requiresPasswordReset).toBe(true);
		});

		test("returns 400 when name is missing", async () => {
			const req = signalsRequest({
				password: "secret123",
			});
			const res = await routes.handleCreate(req);
			expect(res.status).toBe(400);
		});

		test("returns 400 when password is missing", async () => {
			const req = signalsRequest({
				name: "Charlie",
			});
			const res = await routes.handleCreate(req);
			expect(res.status).toBe(400);
		});
	});

	describe("handleUpdate", () => {
		test("updates volunteer and returns SSE", async () => {
			const { id } = await createVolunteer(
				{ name: "Bob", password: "pass123" },
				eventStore,
			);

			const req = signalsRequest(
				{
					name: "Bobby",
					phone: "07700900001",
				},
				"PUT",
			);

			const res = await routes.handleUpdate(id, req, adminId);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await volunteerRepo.getById(id);
			expect(updated?.name).toBe("Bobby");
		});

		test("ignores isAdmin change when editing self", async () => {
			const req = signalsRequest(
				{
					name: "Admin Updated",
					isAdmin: false,
				},
				"PUT",
			);

			const res = await routes.handleUpdate(adminId, req, adminId);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await volunteerRepo.getById(adminId);
			expect(updated?.name).toBe("Admin Updated");
			expect(updated?.isAdmin).toBe(true);
		});
	});

	describe("handleDelete", () => {
		test("deletes volunteer and returns SSE", async () => {
			const { id } = await createVolunteer(
				{ name: "ToDelete", password: "pass123" },
				eventStore,
			);

			const res = await routes.handleDelete(id, adminId);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const deleted = await volunteerRepo.getById(id);
			expect(deleted).toBeNull();
		});

		test("returns 400 when trying to delete self", async () => {
			const res = await routes.handleDelete(adminId, adminId);
			expect(res.status).toBe(400);
		});
	});
});
