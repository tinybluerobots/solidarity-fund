import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationSelected } from "../application/types.ts";
import { decide, evolve, initialState } from "./decider.ts";
import type { GrantEvent } from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, GrantEvent>({
	evolve,
	initialState,
});

export async function processApplicationSelected(
	event: ApplicationSelected,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<void> {
	const { applicationId, applicantId, monthCycle, rank, selectedAt } =
		event.data;

	const rows = await pool.withConnection(async (conn) =>
		conn.query<{ payment_preference: string }>(
			"SELECT payment_preference FROM applications WHERE id = ?",
			[applicationId],
		),
	);

	const paymentPreference =
		(rows[0]?.payment_preference as "bank" | "cash") ?? "cash";

	const streamId = `grant-${applicationId}`;
	try {
		await handle(eventStore, streamId, (state) =>
			decide(
				{
					type: "CreateGrant",
					data: {
						grantId: applicationId,
						applicationId,
						applicantId,
						monthCycle,
						rank,
						paymentPreference,
						createdAt: selectedAt,
					},
				},
				state,
			),
		);
	} catch (e) {
		if (!(e instanceof IllegalStateError)) throw e;
	}
}
