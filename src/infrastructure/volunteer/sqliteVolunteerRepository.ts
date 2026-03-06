import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type { Volunteer } from "../../domain/volunteer/types.ts";

type VolunteerRow = {
	id: string;
	name: string;
	phone: string | null;
	email: string | null;
	password_hash: string;
	created_at: string;
	updated_at: string;
};

function rowToVolunteer(row: VolunteerRow): Volunteer {
	return {
		id: row.id,
		name: row.name,
		phone: row.phone ?? undefined,
		email: row.email ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function SQLiteVolunteerRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<VolunteerRepository> {
	await pool.withConnection(async (conn) => {
		await conn.command(`
			CREATE TABLE IF NOT EXISTS volunteers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				phone TEXT,
				email TEXT,
				password_hash TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	});

	return {
		async getById(id: string): Promise<Volunteer | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<VolunteerRow>(
					"SELECT * FROM volunteers WHERE id = ?",
					[id],
				);
				const row = rows[0];
				return row ? rowToVolunteer(row) : null;
			});
		},

		async getByName(name: string): Promise<Volunteer | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<VolunteerRow>(
					"SELECT * FROM volunteers WHERE name = ? COLLATE NOCASE",
					[name],
				);
				const row = rows[0];
				return row ? rowToVolunteer(row) : null;
			});
		},

		async list(): Promise<Volunteer[]> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<VolunteerRow>(
					"SELECT * FROM volunteers ORDER BY created_at DESC",
				);
				return rows.map(rowToVolunteer);
			});
		},

		async verifyPassword(id: string, password: string): Promise<boolean> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<Pick<VolunteerRow, "password_hash">>(
					"SELECT password_hash FROM volunteers WHERE id = ?",
					[id],
				);
				const row = rows[0];
				if (!row) return false;
				return Bun.password.verify(password, row.password_hash);
			});
		},
	};
}
