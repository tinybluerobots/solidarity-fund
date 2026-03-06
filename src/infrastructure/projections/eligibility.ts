import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type {
	ApplicationEvent,
	ApplicationEventType,
} from "../../domain/application/types.ts";

export const eligibilityProjection = sqliteProjection<ApplicationEvent>({
	canHandle: ["ApplicationAccepted" satisfies ApplicationEventType],

	init: async ({ context: { connection } }) => {
		await connection.command(`
      CREATE TABLE IF NOT EXISTS applications_this_month (
        applicant_id TEXT NOT NULL,
        application_id TEXT NOT NULL,
        month_cycle TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        PRIMARY KEY (applicant_id, month_cycle)
      )
    `);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			if (type !== "ApplicationAccepted") continue;
			await connection.command(
				`INSERT OR IGNORE INTO applications_this_month (applicant_id, application_id, month_cycle, accepted_at)
         VALUES (?, ?, ?, ?)`,
				[
					data.applicantId,
					data.applicationId,
					data.monthCycle,
					data.acceptedAt,
				],
			);
		}
	},
});
