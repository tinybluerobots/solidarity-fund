import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import type { SessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";

describe("SQLiteSessionStore", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let store: SessionStore;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		pool = es.pool;
		store = await SQLiteSessionStore(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	test("creates a session and retrieves the volunteer ID", async () => {
		const sessionId = await store.create("vol-1");
		const volunteerId = await store.get(sessionId);
		expect(volunteerId).toBe("vol-1");
	});

	test("returns null for unknown session", async () => {
		const result = await store.get("nonexistent");
		expect(result).toBeNull();
	});

	test("destroys a session", async () => {
		const sessionId = await store.create("vol-1");
		await store.destroy(sessionId);
		const result = await store.get(sessionId);
		expect(result).toBeNull();
	});

	test("returns null for expired session", async () => {
		const sessionId = await store.create("vol-1");
		// Manually expire the session
		await pool.withConnection(async (conn) => {
			await conn.command("UPDATE sessions SET expires_at = ? WHERE id = ?", [
				new Date(0).toISOString(),
				sessionId,
			]);
		});
		const result = await store.get(sessionId);
		expect(result).toBeNull();
	});

	test("cleanup removes expired sessions", async () => {
		const sessionId = await store.create("vol-1");
		await pool.withConnection(async (conn) => {
			await conn.command("UPDATE sessions SET expires_at = ? WHERE id = ?", [
				new Date(0).toISOString(),
				sessionId,
			]);
		});
		await store.cleanup();
		// Verify row is gone (not just returning null from get)
		const rows = await pool.withConnection(async (conn) => {
			return conn.query<{ id: string }>(
				"SELECT id FROM sessions WHERE id = ?",
				[sessionId],
			);
		});
		expect(rows).toHaveLength(0);
	});
});
