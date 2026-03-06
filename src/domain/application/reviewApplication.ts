import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type {
	ApplicationEvent,
	EligibilityResult,
	ReviewApplication,
} from "./types.ts";

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

export async function reviewApplication(
	applicationId: string,
	volunteerId: string,
	decision: "confirm" | "reject",
	eligibility: EligibilityResult,
	eventStore: SQLiteEventStore,
): Promise<{ events: ApplicationEvent[] }> {
	const command: ReviewApplication = {
		type: "ReviewApplication",
		data: {
			applicationId,
			volunteerId,
			decision,
			eligibility,
			reviewedAt: new Date().toISOString(),
		},
	};

	const streamId = `application-${applicationId}`;
	const { newEvents } = await handle(eventStore, streamId, (state) =>
		decide(command, state),
	);

	return { events: newEvents };
}
