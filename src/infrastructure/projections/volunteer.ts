import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { VolunteerEvent } from "../../domain/volunteer/types.ts";
import { VOLUNTEERS_TABLE_DDL } from "../volunteer/schema.ts";

export const volunteerProjection = sqliteProjection<VolunteerEvent>({
	canHandle: [
		"VolunteerCreated",
		"VolunteerUpdated",
		"VolunteerDeleted",
		"PasswordChanged",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(VOLUNTEERS_TABLE_DDL);
	},

	handle: async (events, { connection }) => {
		for (const event of events) {
			switch (event.type) {
				case "VolunteerCreated": {
					const d = event.data;
					await connection.command(
						`INSERT INTO volunteers (id, name, phone, email, password_hash, is_admin, requires_password_reset, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							d.id,
							d.name,
							d.phone ?? null,
							d.email ?? null,
							d.passwordHash,
							d.isAdmin ? 1 : 0,
							d.requiresPasswordReset ? 1 : 0,
							d.createdAt,
							d.createdAt,
						],
					);
					break;
				}
				case "VolunteerUpdated": {
					const d = event.data;
					await connection.command(
						`UPDATE volunteers SET
							name = ?, phone = ?, email = ?, password_hash = ?, updated_at = ?
						WHERE id = ?`,
						[
							d.name,
							d.phone ?? null,
							d.email ?? null,
							d.passwordHash,
							d.updatedAt,
							d.id,
						],
					);
					break;
				}
				case "PasswordChanged": {
					const d = event.data;
					await connection.command(
						`UPDATE volunteers SET password_hash = ?, requires_password_reset = 0, updated_at = ? WHERE id = ?`,
						[d.passwordHash, d.changedAt, d.id],
					);
					break;
				}
				case "VolunteerDeleted": {
					await connection.command("DELETE FROM volunteers WHERE id = ?", [
						event.data.id,
					]);
					break;
				}
			}
		}
	},
});
