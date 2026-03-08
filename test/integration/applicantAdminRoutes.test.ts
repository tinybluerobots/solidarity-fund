import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	createApplicant,
	updateApplicant,
} from "../../src/domain/applicant/commandHandlers";
import type { ApplicantRepository } from "../../src/domain/applicant/repository";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository";
import { SQLiteApplicantRepository } from "../../src/infrastructure/applicant/sqliteApplicantRepository";
import { createEventStore } from "../../src/infrastructure/eventStore";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository";
import { createApplicantRoutes } from "../../src/web/routes/applicants-admin";

function signalsRequest(
	signals: Record<string, unknown>,
	method = "POST",
): Request {
	return new Request("http://localhost/applicants", {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(signals),
	});
}

describe("applicant routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let applicantRepo: ApplicantRepository;
	let volunteerRepo: VolunteerRepository;
	let routes: ReturnType<typeof createApplicantRoutes>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		applicantRepo = await SQLiteApplicantRepository(pool);
		volunteerRepo = await SQLiteVolunteerRepository(pool);
		routes = createApplicantRoutes(applicantRepo, volunteerRepo, eventStore);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("list", () => {
		test("returns HTML page with applicants", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.list();
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Alice");
			expect(html).toContain("Applicants");
		});

		test("returns empty state when no applicants", async () => {
			const res = await routes.list();
			const html = await res.text();
			expect(html).toContain("No applicants yet");
		});
	});

	describe("edit", () => {
		test("returns SSE with edit form", async () => {
			const { id } = await createApplicant(
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
		test("creates applicant and returns SSE", async () => {
			const req = signalsRequest({
				name: "Charlie",
				phone: "07700900099",
			});

			const res = await routes.handleCreate(req, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const created = await applicantRepo.getByPhone("07700900099");
			expect(created).not.toBeEmpty();
			expect(created[0]?.name).toBe("Charlie");
		});

		test("returns 400 when name is missing", async () => {
			const req = signalsRequest({
				phone: "07700900099",
			});
			const res = await routes.handleCreate(req, "volunteer-1");
			expect(res.status).toBe(400);
		});

		test("returns 400 when phone contains non-numeric characters", async () => {
			const req = signalsRequest({
				name: "Charlie",
				phone: "077-009-00099",
			});
			const res = await routes.handleCreate(req, "volunteer-1");
			expect(res.status).toBe(400);
		});
	});

	describe("handleUpdate", () => {
		test("updates applicant and returns SSE", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const req = signalsRequest(
				{
					name: "Alicia",
					phone: "07700900001",
				},
				"PUT",
			);

			const res = await routes.handleUpdate(id, req, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await applicantRepo.getById(id);
			expect(updated?.name).toBe("Alicia");
		});
	});

	describe("handleDelete", () => {
		test("deletes applicant and returns SSE", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.handleDelete(id, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const deleted = await applicantRepo.getById(id);
			expect(deleted).toBeNull();
		});
	});

	describe("history", () => {
		test("returns timeline with events and volunteer names", async () => {
			const { id: volId } = await createVolunteer(
				{ name: "Sarah", password: "pass123" },
				eventStore,
			);
			const { id: applicantId } = await createApplicant(
				{ phone: "07700900001", name: "Alice", volunteerId: volId },
				eventStore,
			);
			await updateApplicant(
				applicantId,
				volId,
				{ name: "Alice Updated" },
				eventStore,
			);

			const res = await routes.history(applicantId);
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain("Sarah");
			expect(body).toContain("Created");
			expect(body).toContain("Updated");
		});

		test("returns empty history for unknown applicant", async () => {
			const res = await routes.history("nonexistent");
			const body = await res.text();
			expect(body).toContain("No history");
		});

		test("shows 'via application' when no volunteerId", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900002", name: "Bob" },
				eventStore,
			);
			const res = await routes.history(id);
			const body = await res.text();
			expect(body).toContain("Created via application");
		});
	});
});
