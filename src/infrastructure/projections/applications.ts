import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { ApplicationEvent } from "../../domain/application/types.ts";

export const applicationsProjection = sqliteProjection<ApplicationEvent>({
	canHandle: [
		"ApplicationSubmitted",
		"ApplicationAccepted",
		"ApplicationConfirmed",
		"ApplicationRejected",
		"ApplicationFlaggedForReview",
		"ApplicationSelected",
		"ApplicationNotSelected",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS applications (
				id TEXT PRIMARY KEY,
				applicant_id TEXT NOT NULL,
				month_cycle TEXT NOT NULL,
				status TEXT NOT NULL,
				rank INTEGER,
				payment_preference TEXT NOT NULL,
				name TEXT,
				phone TEXT,
				reject_reason TEXT,
				applied_at TEXT,
				accepted_at TEXT,
				selected_at TEXT,
				rejected_at TEXT,
				sort_code TEXT,
				account_number TEXT,
				poa_ref TEXT
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationSubmitted":
					await connection.command(
						`INSERT OR IGNORE INTO applications
						   (id, applicant_id, month_cycle, status, payment_preference, name, phone, applied_at, sort_code, account_number, poa_ref)
						 VALUES (?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?)`,
						[
							data.applicationId,
							data.applicantId,
							data.monthCycle,
							data.paymentPreference,
							data.identity.name,
							data.identity.phone,
							data.submittedAt,
							data.bankDetails?.sortCode ?? null,
							data.bankDetails?.accountNumber ?? null,
							data.bankDetails?.proofOfAddressRef ?? null,
						],
					);
					break;
				case "ApplicationAccepted":
					await connection.command(
						"UPDATE applications SET status = 'accepted', accepted_at = ? WHERE id = ?",
						[data.acceptedAt, data.applicationId],
					);
					break;
				case "ApplicationConfirmed":
					await connection.command(
						"UPDATE applications SET status = 'accepted', accepted_at = ? WHERE id = ?",
						[data.confirmedAt, data.applicationId],
					);
					break;
				case "ApplicationRejected":
					await connection.command(
						"UPDATE applications SET status = 'rejected', reject_reason = ?, rejected_at = ? WHERE id = ?",
						[data.reason, data.rejectedAt, data.applicationId],
					);
					break;
				case "ApplicationFlaggedForReview":
					await connection.command(
						"UPDATE applications SET status = 'flagged' WHERE id = ?",
						[data.applicationId],
					);
					break;
				case "ApplicationSelected":
					await connection.command(
						"UPDATE applications SET status = 'selected', rank = ?, selected_at = ? WHERE id = ?",
						[data.rank, data.selectedAt, data.applicationId],
					);
					break;
				case "ApplicationNotSelected":
					await connection.command(
						"UPDATE applications SET status = 'not_selected' WHERE id = ?",
						[data.applicationId],
					);
					break;
			}
		}
	},
});
