import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "./decider.ts";
import type {
	CreateVolunteer,
	UpdateVolunteer,
	VolunteerEvent,
	VolunteerState,
} from "./types.ts";

export async function changePassword(
	id: string,
	newPassword: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const passwordHash = await Bun.password.hash(newPassword);
	const now = new Date().toISOString();
	await handle(eventStore, streamId(id), (state) =>
		decide(
			{ type: "ChangePassword", data: { id, passwordHash, changedAt: now } },
			state,
		),
	);
}

const handle = CommandHandler<ReturnType<typeof initialState>, VolunteerEvent>({
	evolve,
	initialState,
});

function streamId(id: string): string {
	return `volunteer-${id}`;
}

export async function createVolunteer(
	data: CreateVolunteer & { requiresPasswordReset?: boolean },
	eventStore: SQLiteEventStore,
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const passwordHash = await Bun.password.hash(data.password);

	await handle(eventStore, streamId(id), (_state) =>
		decide(
			{
				type: "CreateVolunteer",
				data: {
					id,
					name: data.name,
					phone: data.phone,
					email: data.email,
					passwordHash,
					isAdmin: data.isAdmin,
					requiresPasswordReset: data.requiresPasswordReset ?? true,
					createdAt: now,
				},
			},
			initialState(),
		),
	);

	return { id };
}

export async function updateVolunteer(
	id: string,
	data: UpdateVolunteer,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();
	const passwordHash = data.password
		? await Bun.password.hash(data.password)
		: undefined;

	await handle(eventStore, streamId(id), (state: VolunteerState) => {
		if (state.status !== "active") {
			throw new IllegalStateError(
				`Cannot update volunteer in ${state.status} state`,
			);
		}

		const merged = {
			id,
			name: data.name ?? state.name,
			phone: data.phone === null ? undefined : (data.phone ?? state.phone),
			email: data.email === null ? undefined : (data.email ?? state.email),
			passwordHash: passwordHash ?? state.passwordHash,
			isAdmin: data.isAdmin ?? state.isAdmin,
			updatedAt: now,
		};

		return decide({ type: "UpdateVolunteer", data: merged }, state);
	});
}

export async function disableVolunteer(
	id: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide({ type: "DisableVolunteer", data: { id, disabledAt: now } }, state),
	);
}

export async function enableVolunteer(
	id: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide({ type: "EnableVolunteer", data: { id, enabledAt: now } }, state),
	);
}
