import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { createApplicant } from "../applicant/commandHandlers.ts";
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
	confirmedApplicantId?: string,
): Promise<{ events: ApplicationEvent[] }> {
	const command: ReviewApplication = {
		type: "ReviewApplication",
		data: {
			applicationId,
			volunteerId,
			decision,
			eligibility,
			reviewedAt: new Date().toISOString(),
			confirmedApplicantId,
		},
	};

	const streamId = `application-${applicationId}`;
	const { newEvents } = await handle(eventStore, streamId, (state) =>
		decide(command, state),
	);

	// When confirming a flagged application with a new identity,
	// create the applicant record so it appears in the applicants list.
	if (decision === "confirm" && confirmedApplicantId) {
		try {
			const { events } =
				await eventStore.readStream<ApplicationEvent>(streamId);
			const submitted = events.find((e) => e.type === "ApplicationSubmitted");
			if (submitted) {
				await createApplicant(
					{
						phone: submitted.data.identity.phone,
						name: submitted.data.identity.name,
						email: submitted.data.identity.email,
						volunteerId,
					},
					eventStore,
				);
			}
		} catch {
			// Applicant already exists (race condition) — safe to ignore
		}
	}

	return { events: newEvents };
}
