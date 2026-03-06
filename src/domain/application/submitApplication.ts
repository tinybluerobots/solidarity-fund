import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { createRecipient } from "../recipient/commandHandlers.ts";
import type { RecipientRepository } from "../recipient/repository.ts";
import { decide, evolve, initialState } from "./decider.ts";
import { resolveIdentity } from "./resolveIdentity.ts";
import type {
	ApplicationEvent,
	EligibilityResult,
	PaymentPreference,
	SubmitApplication,
} from "./types.ts";

export type ApplicationFormData = {
	applicationId: string;
	phone: string;
	name: string;
	email?: string;
	paymentPreference: PaymentPreference;
	meetingPlace: string;
	monthCycle: string;
	eligibility: EligibilityResult;
};

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

export async function submitApplication(
	form: ApplicationFormData,
	eventStore: SQLiteEventStore,
	recipientRepo: RecipientRepository,
): Promise<{ streamId: string; events: ApplicationEvent[] }> {
	const identityResolution = await resolveIdentity(
		form.phone,
		form.name,
		recipientRepo,
	);

	const command: SubmitApplication = {
		type: "SubmitApplication",
		data: {
			applicationId: form.applicationId,
			identity: {
				phone: form.phone,
				name: form.name,
				email: form.email,
			},
			paymentPreference: form.paymentPreference,
			meetingDetails: { place: form.meetingPlace },
			monthCycle: form.monthCycle,
			identityResolution,
			eligibility: form.eligibility,
			submittedAt: new Date().toISOString(),
		},
	};

	const streamId = `application-${form.applicationId}`;
	const { newEvents } = await handle(eventStore, streamId, (state) =>
		decide(command, state),
	);

	if (identityResolution.type === "new") {
		try {
			await createRecipient(
				{
					applicationId: form.applicationId,
					phone: form.phone,
					name: form.name,
					email: form.email,
					paymentPreference: form.paymentPreference,
					meetingPlace: form.meetingPlace,
				},
				eventStore,
			);
		} catch {
			// Recipient already exists (race condition) — safe to ignore
		}
	}

	return { streamId, events: newEvents };
}
