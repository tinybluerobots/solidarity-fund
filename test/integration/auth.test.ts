import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers.ts";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import type { SessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { handleLogin, handleLogout } from "../../src/web/routes/auth.ts";

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
		await createVolunteer(
			{ name: "Alice", password: "correct-password" },
			eventStore,
		);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("POST /login", () => {
		test("returns SSE with cookie on valid credentials", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const req = new Request("http://localhost/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Alice",
					password: "correct-password",
				}),
			});
			const res = await login(req);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("text/event-stream");
			const body = await res.text();
			expect(body).toContain("document.cookie");
			expect(body).toContain("window.location.href");
		});

		test("returns SSE error on wrong password", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const req = new Request("http://localhost/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Alice",
					password: "wrong",
				}),
			});
			const res = await login(req);
			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain("Invalid name or password");
		});

		test("returns SSE error on unknown user", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const req = new Request("http://localhost/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Nobody",
					password: "whatever",
				}),
			});
			const res = await login(req);
			const body = await res.text();
			expect(body).toContain("Invalid name or password");
		});

		test("name lookup is case-insensitive", async () => {
			const login = handleLogin(sessionStore, volunteerRepo);
			const req = new Request("http://localhost/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "alice",
					password: "correct-password",
				}),
			});
			const res = await login(req);
			const body = await res.text();
			expect(body).toContain("document.cookie");
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
