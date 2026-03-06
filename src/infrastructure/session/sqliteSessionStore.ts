import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface SessionStore {
	create(volunteerId: string): Promise<string>;
	get(sessionId: string): Promise<string | null>;
	destroy(sessionId: string): Promise<void>;
	cleanup(): Promise<void>;
}

export async function SQLiteSessionStore(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<SessionStore> {
	await pool.withConnection(async (conn) => {
		await conn.command(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				volunteer_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				expires_at TEXT NOT NULL
			)
		`);
	});

	return {
		async create(volunteerId: string): Promise<string> {
			const id = crypto.randomUUID();
			const now = new Date();
			const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MS);
			await pool.withConnection(async (conn) => {
				await conn.command(
					"INSERT INTO sessions (id, volunteer_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
					[id, volunteerId, now.toISOString(), expiresAt.toISOString()],
				);
			});
			return id;
		},

		async get(sessionId: string): Promise<string | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<{
					volunteer_id: string;
					expires_at: string;
				}>("SELECT volunteer_id, expires_at FROM sessions WHERE id = ?", [
					sessionId,
				]);
				const row = rows[0];
				if (!row) return null;
				if (new Date(row.expires_at) < new Date()) {
					await conn.command("DELETE FROM sessions WHERE id = ?", [sessionId]);
					return null;
				}
				return row.volunteer_id;
			});
		},

		async destroy(sessionId: string): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command("DELETE FROM sessions WHERE id = ?", [sessionId]);
			});
		},

		async cleanup(): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command("DELETE FROM sessions WHERE expires_at < ?", [
					new Date().toISOString(),
				]);
			});
		},
	};
}
