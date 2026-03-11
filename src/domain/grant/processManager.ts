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
		conn.query<{
			payment_preference: string;
			sort_code: string | null;
			account_number: string | null;
			poa_ref: string | null;
		}>(
			"SELECT payment_preference, sort_code, account_number, poa_ref FROM applications WHERE id = ?",
			[applicationId],
		),
	);

	if (!rows[0]) {
		throw new Error(`Application ${applicationId} not found in projection`);
	}
	const pref = rows[0].payment_preference;
	if (pref !== "bank" && pref !== "cash") {
		throw new Error(`Invalid payment_preference: ${pref}`);
	}
	const paymentPreference = pref;

	const { sort_code, account_number, poa_ref } = rows[0];
	const bankDetails =
		sort_code && account_number && poa_ref
			? {
					sortCode: sort_code,
					accountNumber: account_number,
					proofOfAddressRef: poa_ref,
				}
			: undefined;

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
						bankDetails,
					},
				},
				state,
			),
		);
	} catch (e) {
		if (!(e instanceof IllegalStateError)) throw e;
	}
}
