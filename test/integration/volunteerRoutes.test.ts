import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers.ts";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { createVolunteerRoutes } from "../../src/web/routes/volunteers.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

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
	let env: TestEnv;
	let volunteerRepo: VolunteerRepository;
	let routes: ReturnType<typeof createVolunteerRoutes>;
	let adminId: string;

	beforeEach(async () => {
		env = await createTestEnv();
		volunteerRepo = await SQLiteVolunteerRepository(env.pool);
		routes = createVolunteerRoutes(volunteerRepo, env.eventStore);
		const result = await createVolunteer(
			{ name: "Admin", password: "admin123", isAdmin: true },
			env.eventStore,
		);
		adminId = result.id;
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("list returns empty state when no volunteers", async () => {
		const freshEnv = await createTestEnv();
		const freshRepo = await SQLiteVolunteerRepository(freshEnv.pool);
		const freshRoutes = createVolunteerRoutes(freshRepo, freshEnv.eventStore);
		const res = await freshRoutes.list();
		const html = await res.text();
		expect(html).toContain("No volunteers yet");
		await freshEnv.cleanup();
	});

	test("edit returns 404 for unknown id", async () => {
		const res = await routes.edit("nonexistent", adminId);
		expect(res.status).toBe(404);
	});

	test("handleCreate returns 400 when name is missing", async () => {
		const req = signalsRequest({ password: "secret123" });
		const res = await routes.handleCreate(req, adminId);
		expect(res.status).toBe(400);
	});

	test("handleCreate returns 400 when password is missing", async () => {
		const req = signalsRequest({ name: "Charlie" });
		const res = await routes.handleCreate(req, adminId);
		expect(res.status).toBe(400);
	});

	test("handleCreate returns 400 when phone contains non-numeric characters", async () => {
		const req = signalsRequest({
			name: "Charlie",
			phone: "077-009-00099",
			password: "secret123",
		});
		const res = await routes.handleCreate(req, adminId);
		expect(res.status).toBe(400);
	});

	test("handleDisable returns 400 when trying to disable self", async () => {
		const res = await routes.handleDisable(adminId, adminId);
		expect(res.status).toBe(400);
	});
});
