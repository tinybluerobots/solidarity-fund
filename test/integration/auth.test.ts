import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	changePassword,
	createVolunteer,
	disableVolunteer,
} from "../../src/domain/volunteer/commandHandlers.ts";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import type { SessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import {
	handleChangePassword,
	handleLogin,
	handleLogout,
} from "../../src/web/routes/auth.ts";

describe("auth routes", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let eventStore: SQLiteEventStore;
	let sessionStore: SessionStore;
	let volunteerRepo: VolunteerRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		pool = es.pool;
		eventStore = es.store;
		sessionStore = await SQLiteSessionStore(pool);
		volunteerRepo = await SQLiteVolunteerRepository(pool);
		const { id } = await createVolunteer(
			{ name: "Alice", password: "correct-password" },
			eventStore,
		);
		await changePassword(id, "correct-password", eventStore);
	});

	afterEach(async () => {
		await pool.close();
	});

	function loginRequest(name: string, password: string): Request {
		const body = new URLSearchParams({ name, password });
		return new Request("http://localhost/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
		});
	}

	describe("POST /login", () => {
		test("redirects with cookie on valid credentials", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const res = await login(loginRequest("Alice", "correct-password"));
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe("/");
			expect(res.headers.get("set-cookie")).toContain("session=");
		});

		test("returns error on wrong password", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const res = await login(loginRequest("Alice", "wrong"));
			expect(res.status).toBe(401);
			const body = await res.text();
			expect(body).toContain("Invalid name or password");
		});

		test("returns error on unknown user", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const res = await login(loginRequest("Nobody", "whatever"));
			expect(res.status).toBe(401);
			const body = await res.text();
			expect(body).toContain("Invalid name or password");
		});

		test("name lookup is case-insensitive", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const res = await login(loginRequest("alice", "correct-password"));
			expect(res.status).toBe(302);
			expect(res.headers.get("set-cookie")).toContain("session=");
		});

		test("returns error when volunteer is disabled", async () => {
			const { id } = await createVolunteer(
				{ name: "Disabled", password: "pw123" },
				eventStore,
			);
			await changePassword(id, "pw123", eventStore);
			await disableVolunteer(id, eventStore);
			const login = handleLogin(sessionStore, volunteerRepo);
			const res = await login(loginRequest("Disabled", "pw123"));
			expect(res.status).toBe(401);
			const body = await res.text();
			expect(body).toContain("disabled");
		});
	});

	test("redirects to /change-password when requiresPasswordReset is true", async () => {
		await createVolunteer({ name: "NewVol", password: "temp-pw" }, eventStore);
		const login = handleLogin(sessionStore, volunteerRepo);
		const res = await login(loginRequest("NewVol", "temp-pw"));
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/change-password");
	});

	describe("POST /change-password", () => {
		test("changes password and redirects to /", async () => {
			const { id } = await createVolunteer(
				{ name: "Bob", password: "old-pw" },
				eventStore,
			);
			const handler = handleChangePassword(volunteerRepo, eventStore);
			const form = new URLSearchParams({
				currentPassword: "old-pw",
				newPassword: "new-pw",
				confirmPassword: "new-pw",
			});
			const req = new Request("http://localhost/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: form.toString(),
			});
			const res = await handler(req, id);
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe("/");
			const valid = await volunteerRepo.verifyPassword(id, "new-pw");
			expect(valid).toBe(true);
		});

		test("rejects when current password is wrong", async () => {
			const { id } = await createVolunteer(
				{ name: "Bob2", password: "old-pw" },
				eventStore,
			);
			const handler = handleChangePassword(volunteerRepo, eventStore);
			const form = new URLSearchParams({
				currentPassword: "wrong",
				newPassword: "new-pw",
				confirmPassword: "new-pw",
			});
			const req = new Request("http://localhost/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: form.toString(),
			});
			const res = await handler(req, id);
			expect(res.status).toBe(400);
			const body = await res.text();
			expect(body).toContain("Current password is incorrect");
		});

		test("rejects when passwords don't match", async () => {
			const { id } = await createVolunteer(
				{ name: "Bob3", password: "old-pw" },
				eventStore,
			);
			const handler = handleChangePassword(volunteerRepo, eventStore);
			const form = new URLSearchParams({
				currentPassword: "old-pw",
				newPassword: "new-pw",
				confirmPassword: "different",
			});
			const req = new Request("http://localhost/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: form.toString(),
			});
			const res = await handler(req, id);
			expect(res.status).toBe(400);
			const body = await res.text();
			expect(body).toContain("do not match");
		});
	});

	describe("GET /logout", () => {
		test("clears cookie and redirects", async () => {
			const sessionId = await sessionStore.create("vol-1");
			const logout = handleLogout(sessionStore);
			const req = new Request("http://localhost/logout", {
				headers: { cookie: `session=${sessionId}` },
			});
			const res = await logout(req);
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe("/login");
			expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
			// Session should be destroyed
			const result = await sessionStore.get(sessionId);
			expect(result).toBeNull();
		});
	});
});
