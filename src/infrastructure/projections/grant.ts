import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { GrantEvent } from "../../domain/grant/types.ts";

export const grantProjection = sqliteProjection<GrantEvent>({
	canHandle: [
		"GrantCreated",
		"VolunteerAssigned",
		"BankDetailsSubmitted",
		"ProofOfAddressApproved",
		"ProofOfAddressRejected",
		"CashAlternativeOffered",
		"CashAlternativeAccepted",
		"CashAlternativeDeclined",
		"GrantPaid",
		"SlotReleased",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS grants (
				id TEXT PRIMARY KEY,
				application_id TEXT NOT NULL,
				applicant_id TEXT NOT NULL,
				month_cycle TEXT NOT NULL,
				rank INTEGER NOT NULL,
				status TEXT NOT NULL,
				payment_preference TEXT NOT NULL,
				volunteer_id TEXT,
				poa_attempts INTEGER NOT NULL DEFAULT 0,
				amount INTEGER,
				payment_method TEXT,
				paid_by TEXT,
				paid_at TEXT,
				released_reason TEXT,
				released_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "GrantCreated": {
					const status =
						data.paymentPreference === "bank"
							? "awaiting_bank_details"
							: "awaiting_cash_handover";
					await connection.command(
						`INSERT OR IGNORE INTO grants (id, application_id, applicant_id, month_cycle, rank, status, payment_preference, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							data.grantId,
							data.applicationId,
							data.applicantId,
							data.monthCycle,
							data.rank,
							status,
							data.paymentPreference,
							data.createdAt,
							data.createdAt,
						],
					);
					break;
				}
				case "VolunteerAssigned":
					await connection.command(
						"UPDATE grants SET volunteer_id = ?, updated_at = ? WHERE id = ?",
						[data.volunteerId, data.assignedAt, data.grantId],
					);
					break;
				case "BankDetailsSubmitted":
					await connection.command(
						"UPDATE grants SET status = 'bank_details_submitted', poa_attempts = poa_attempts + 1, updated_at = ? WHERE id = ?",
						[data.submittedAt, data.grantId],
					);
					break;
				case "ProofOfAddressApproved":
					await connection.command(
						"UPDATE grants SET status = 'poa_approved', updated_at = ? WHERE id = ?",
						[data.verifiedAt, data.grantId],
					);
					break;
				case "ProofOfAddressRejected":
					await connection.command(
						"UPDATE grants SET status = 'awaiting_bank_details', updated_at = ? WHERE id = ?",
						[data.rejectedAt, data.grantId],
					);
					break;
				case "CashAlternativeOffered":
					await connection.command(
						"UPDATE grants SET status = 'offered_cash_alternative', updated_at = ? WHERE id = ?",
						[data.offeredAt, data.grantId],
					);
					break;
				case "CashAlternativeAccepted":
					await connection.command(
						"UPDATE grants SET status = 'awaiting_cash_handover', updated_at = ? WHERE id = ?",
						[data.acceptedAt, data.grantId],
					);
					break;
				case "CashAlternativeDeclined":
					break;
				case "GrantPaid":
					await connection.command(
						"UPDATE grants SET status = 'paid', amount = ?, payment_method = ?, paid_by = ?, paid_at = ?, updated_at = ? WHERE id = ?",
						[
							data.amount,
							data.method,
							data.paidBy,
							data.paidAt,
							data.paidAt,
							data.grantId,
						],
					);
					break;
				case "SlotReleased":
					await connection.command(
						"UPDATE grants SET status = 'released', released_reason = ?, released_at = ?, updated_at = ? WHERE id = ?",
						[data.reason, data.releasedAt, data.releasedAt, data.grantId],
					);
					break;
			}
		}
	},
});
