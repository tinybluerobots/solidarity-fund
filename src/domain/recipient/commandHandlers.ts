import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type {
	CreateRecipient,
	RecipientEvent,
	RecipientState,
	UpdateRecipient,
} from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, RecipientEvent>({
	evolve,
	initialState,
});

function streamId(id: string): string {
	return `recipient-${id}`;
}

export async function createRecipient(
	data: CreateRecipient,
	eventStore: SQLiteEventStore,
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (_state) =>
		decide(
			{
				type: "CreateRecipient",
				data: {
					id,
					volunteerId: data.volunteerId,
					applicationId: data.applicationId,
					phone: data.phone,
					name: data.name,
					email: data.email,
					paymentPreference: data.paymentPreference ?? "cash",
					meetingPlace: data.meetingPlace,
					bankDetails: data.bankDetails,
					notes: data.notes,
					createdAt: now,
				},
			},
			initialState(),
		),
	);

	return { id };
}

export async function updateRecipient(
	id: string,
	volunteerId: string,
	data: UpdateRecipient,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state: RecipientState) => {
		if (state.status !== "active") {
			throw new IllegalStateError(
				`Cannot update recipient in ${state.status} state`,
			);
		}

		const merged = {
			id,
			volunteerId,
			phone: data.phone ?? state.phone,
			name: data.name ?? state.name,
			email: data.email === null ? undefined : (data.email ?? state.email),
			paymentPreference: data.paymentPreference ?? state.paymentPreference,
			meetingPlace:
				data.meetingPlace === null
					? undefined
					: (data.meetingPlace ?? state.meetingPlace),
			bankDetails:
				data.bankDetails === null
					? undefined
					: (data.bankDetails ?? state.bankDetails),
			notes: data.notes === null ? undefined : (data.notes ?? state.notes),
			updatedAt: now,
		};

		return decide({ type: "UpdateRecipient", data: merged }, state);
	});
}

export async function deleteRecipient(
	id: string,
	volunteerId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide(
			{ type: "DeleteRecipient", data: { id, volunteerId, deletedAt: now } },
			state,
		),
	);
}
