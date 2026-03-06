import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import type {
	CreateRecipient,
	Recipient,
	UpdateRecipient,
} from "../../domain/recipient/types.ts";

type RecipientRow = {
	id: string;
	phone: string;
	name: string;
	email: string | null;
	payment_preference: string;
	meeting_place: string | null;
	bank_sort_code: string | null;
	bank_account_number: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
};

function rowToRecipient(row: RecipientRow): Recipient {
	return {
		id: row.id,
		phone: row.phone,
		name: row.name,
		email: row.email ?? undefined,
		paymentPreference: row.payment_preference as Recipient["paymentPreference"],
		meetingPlace: row.meeting_place ?? undefined,
		bankDetails:
			row.bank_sort_code && row.bank_account_number
				? { sortCode: row.bank_sort_code, accountNumber: row.bank_account_number }
				: undefined,
		notes: row.notes ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function SQLiteRecipientRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<RecipientRepository> {
	await pool.withConnection(async (conn) => {
		await conn.command(`
			CREATE TABLE IF NOT EXISTS recipients (
				id TEXT PRIMARY KEY,
				phone TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				email TEXT,
				payment_preference TEXT NOT NULL DEFAULT 'cash',
				meeting_place TEXT,
				bank_sort_code TEXT,
				bank_account_number TEXT,
				notes TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	});

	return {
		async create(data: CreateRecipient): Promise<Recipient> {
			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			await pool.withConnection(async (conn) => {
				await conn.command(
					`INSERT INTO recipients (id, phone, name, email, payment_preference, meeting_place, bank_sort_code, bank_account_number, notes, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						id,
						data.phone,
						data.name,
						data.email ?? null,
						data.paymentPreference ?? "cash",
						data.meetingPlace ?? null,
						data.bankDetails?.sortCode ?? null,
						data.bankDetails?.accountNumber ?? null,
						data.notes ?? null,
						now,
						now,
					],
				);
			});
			return (await this.getById(id))!;
		},

		async getById(id: string): Promise<Recipient | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<RecipientRow>(
					"SELECT * FROM recipients WHERE id = ?",
					[id],
				);
				return rows.length > 0 ? rowToRecipient(rows[0]!) : null;
			});
		},

		async getByPhone(phone: string): Promise<Recipient | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<RecipientRow>(
					"SELECT * FROM recipients WHERE phone = ?",
					[phone],
				);
				return rows.length > 0 ? rowToRecipient(rows[0]!) : null;
			});
		},

		async list(): Promise<Recipient[]> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<RecipientRow>(
					"SELECT * FROM recipients ORDER BY created_at DESC",
				);
				return rows.map(rowToRecipient);
			});
		},

		async update(id: string, data: UpdateRecipient): Promise<Recipient> {
			const existing = await this.getById(id);
			if (!existing) throw new Error(`Recipient not found: ${id}`);

			const now = new Date().toISOString();
			await pool.withConnection(async (conn) => {
				await conn.command(
					`UPDATE recipients SET
						phone = ?, name = ?, email = ?, payment_preference = ?,
						meeting_place = ?, bank_sort_code = ?, bank_account_number = ?,
						notes = ?, updated_at = ?
					WHERE id = ?`,
					[
						data.phone ?? existing.phone,
						data.name ?? existing.name,
						data.email !== undefined ? data.email : (existing.email ?? null),
						data.paymentPreference ?? existing.paymentPreference,
						data.meetingPlace !== undefined ? data.meetingPlace : (existing.meetingPlace ?? null),
						data.bankDetails !== undefined
							? (data.bankDetails?.sortCode ?? null)
							: (existing.bankDetails?.sortCode ?? null),
						data.bankDetails !== undefined
							? (data.bankDetails?.accountNumber ?? null)
							: (existing.bankDetails?.accountNumber ?? null),
						data.notes !== undefined ? data.notes : (existing.notes ?? null),
						now,
						id,
					],
				);
			});
			return (await this.getById(id))!;
		},

		async delete(id: string): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command("DELETE FROM recipients WHERE id = ?", [id]);
			});
		},
	};
}
