import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { createApplicantRoutes } from "../../src/web/routes/applicants-admin.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

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
	let env: TestEnv;
	let volunteerRepo: VolunteerRepository;
	let routes: ReturnType<typeof createApplicantRoutes>;

	beforeEach(async () => {
		env = await createTestEnv();
		volunteerRepo = await SQLiteVolunteerRepository(env.pool);
		routes = createApplicantRoutes(
			env.applicantRepo,
			volunteerRepo,
			env.eventStore,
		);
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("list returns empty state when no applicants", async () => {
		const res = await routes.list();
		const html = await res.text();
		expect(html).toContain("No applicants yet");
	});

	test("create form returns SSE", () => {
		const res = routes.create();
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
	});

	test("closePanel returns SSE with empty panel div", async () => {
		const res = routes.closePanel();
		const body = await res.text();
		expect(body).toContain("datastar-patch-elements");
		expect(body).toContain('<div id="panel"></div>');
	});

	test("handleCreate returns 400 when name is missing", async () => {
		const req = signalsRequest({ phone: "07700900099" });
		const res = await routes.handleCreate(req, "volunteer-1");
		expect(res.status).toBe(400);
	});

	test("handleCreate returns 400 when phone contains non-numeric characters", async () => {
		const req = signalsRequest({ name: "Charlie", phone: "077-009-00099" });
		const res = await routes.handleCreate(req, "volunteer-1");
		expect(res.status).toBe(400);
	});

	test("history returns empty for unknown applicant", async () => {
		const res = await routes.history("nonexistent");
		const body = await res.text();
		expect(body).toContain("No history");
	});
});
