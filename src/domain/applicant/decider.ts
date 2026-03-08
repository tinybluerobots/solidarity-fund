import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	ApplicantCommand,
	ApplicantEvent,
	ApplicantState,
} from "./types.ts";

export const initialState = (): ApplicantState => ({ status: "initial" });

export function decide(
	command: ApplicantCommand,
	state: ApplicantState,
): ApplicantEvent[] {
	switch (command.type) {
		case "CreateApplicant": {
			if (state.status !== "initial") {
				throw new IllegalStateError("Applicant already exists");
			}
			return [
				{
					type: "ApplicantCreated",
					data: command.data,
				},
			];
		}
		case "UpdateApplicant": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot update applicant in ${state.status} state`,
				);
			}
			return [
				{
					type: "ApplicantUpdated",
					data: command.data,
				},
			];
		}
		case "DeleteApplicant": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot delete applicant in ${state.status} state`,
				);
			}
			return [
				{
					type: "ApplicantDeleted",
					data: command.data,
				},
			];
		}
	}
}

export function evolve(
	state: ApplicantState,
	event: ApplicantEvent,
): ApplicantState {
	switch (event.type) {
		case "ApplicantCreated":
			return {
				status: "active",
				id: event.data.id,
				phone: event.data.phone,
				name: event.data.name,
				email: event.data.email,
				createdAt: event.data.createdAt,
				updatedAt: event.data.createdAt,
			};
		case "ApplicantUpdated":
			if (state.status !== "active") return state;
			return {
				status: "active",
				id: event.data.id,
				phone: event.data.phone,
				name: event.data.name,
				email: event.data.email,
				createdAt: state.createdAt,
				updatedAt: event.data.updatedAt,
			};
		case "ApplicantDeleted":
			return { status: "deleted" };
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
