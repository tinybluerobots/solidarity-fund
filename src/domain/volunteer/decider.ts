import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	VolunteerCommand,
	VolunteerEvent,
	VolunteerState,
} from "./types.ts";

export const initialState = (): VolunteerState => ({ status: "initial" });

export function decide(
	command: VolunteerCommand,
	state: VolunteerState,
): VolunteerEvent[] {
	switch (command.type) {
		case "CreateVolunteer": {
			if (state.status !== "initial") {
				throw new IllegalStateError("Volunteer already exists");
			}
			return [
				{
					type: "VolunteerCreated",
					data: command.data,
				},
			];
		}
		case "UpdateVolunteer": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot update volunteer in ${state.status} state`,
				);
			}
			return [
				{
					type: "VolunteerUpdated",
					data: command.data,
				},
			];
		}
		case "DeleteVolunteer": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot delete volunteer in ${state.status} state`,
				);
			}
			return [
				{
					type: "VolunteerDeleted",
					data: command.data,
				},
			];
		}
		case "ChangePassword": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot change password in ${state.status} state`,
				);
			}
			return [
				{
					type: "PasswordChanged",
					data: command.data,
				},
			];
		}
	}
}

export function evolve(
	state: VolunteerState,
	event: VolunteerEvent,
): VolunteerState {
	switch (event.type) {
		case "VolunteerCreated":
			return {
				status: "active",
				id: event.data.id,
				name: event.data.name,
				phone: event.data.phone,
				email: event.data.email,
				passwordHash: event.data.passwordHash,
				isAdmin: event.data.isAdmin ?? false,
				requiresPasswordReset: event.data.requiresPasswordReset ?? false,
				createdAt: event.data.createdAt,
				updatedAt: event.data.createdAt,
			};
		case "VolunteerUpdated":
			if (state.status !== "active") return state;
			return {
				...state,
				name: event.data.name,
				phone: event.data.phone,
				email: event.data.email,
				passwordHash: event.data.passwordHash,
				updatedAt: event.data.updatedAt,
			};
		case "VolunteerDeleted":
			return { status: "deleted" };
		case "PasswordChanged":
			if (state.status !== "active") return state;
			return {
				...state,
				passwordHash: event.data.passwordHash,
				requiresPasswordReset: false,
				updatedAt: event.data.changedAt,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
