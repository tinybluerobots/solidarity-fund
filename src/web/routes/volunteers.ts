import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createVolunteer,
	deleteVolunteer,
	updateVolunteer,
} from "../../domain/volunteer/commandHandlers.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type { Volunteer } from "../../domain/volunteer/types.ts";
import { createPanel, editPanel, viewPanel } from "../pages/volunteerPanel.ts";
import { volunteerRow, volunteersPage } from "../pages/volunteers.ts";
import {
	patchElements,
	ServerSentEventGenerator,
	sseResponse,
} from "../sse.ts";

export function createVolunteerRoutes(
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const volunteers = await volunteerRepo.list();
			return new Response(volunteersPage(volunteers), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string, currentVolunteerId: string): Promise<Response> {
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(viewPanel(volunteer, currentVolunteerId)),
			);
		},

		async edit(id: string, currentVolunteerId: string): Promise<Response> {
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(editPanel(volunteer, currentVolunteerId)),
			);
		},

		create(): Response {
			return sseResponse(patchElements(createPanel()));
		},

		closePanel(): Response {
			return sseResponse(patchElements('<div id="panel"></div>'));
		},

		async handleCreate(req: Request): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const data = signalsToVolunteerCreateData(result.signals);
			if (!data) {
				return new Response("Name and password are required", {
					status: 400,
				});
			}
			const { id } = await createVolunteer(data, eventStore);
			const volunteers = await volunteerRepo.list();
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(volunteersTableBody(volunteers)),
				patchElements(viewPanel(volunteer, "")),
			);
		},

		async handleUpdate(
			id: string,
			req: Request,
			currentVolunteerId: string,
		): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const isSelf = id === currentVolunteerId;
			const data = signalsToVolunteerUpdateData(result.signals, isSelf);
			if (!data) {
				return new Response("Name is required", { status: 400 });
			}
			await updateVolunteer(id, data, eventStore);
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements(viewPanel(volunteer, currentVolunteerId)),
				patchElements(volunteersTableBody(volunteers)),
			);
		},

		async handleDelete(
			id: string,
			currentVolunteerId: string,
		): Promise<Response> {
			if (id === currentVolunteerId) {
				return new Response("Cannot delete yourself", { status: 400 });
			}
			await deleteVolunteer(id, eventStore);
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(volunteersTableBody(volunteers)),
			);
		},
	};
}

function signalsToVolunteerCreateData(signals: Record<string, unknown>): {
	name: string;
	phone?: string;
	email?: string;
	password: string;
	isAdmin?: boolean;
} | null {
	const name = String(signals.name ?? "").trim();
	const password = String(signals.password ?? "").trim();
	if (!name || !password) return null;

	return {
		name,
		phone: String(signals.phone ?? "").trim() || undefined,
		email: String(signals.email ?? "").trim() || undefined,
		password,
		isAdmin: signals.isAdmin === true,
	};
}

function signalsToVolunteerUpdateData(
	signals: Record<string, unknown>,
	_isSelf: boolean,
): {
	name?: string;
	phone?: string;
	email?: string;
	password?: string;
} | null {
	const name = String(signals.name ?? "").trim();
	if (!name) return null;

	const password = String(signals.password ?? "").trim() || undefined;

	return {
		name,
		phone: String(signals.phone ?? "").trim() || undefined,
		email: String(signals.email ?? "").trim() || undefined,
		password,
	};
}

function volunteersTableBody(volunteers: Volunteer[]): string {
	if (volunteers.length === 0) {
		return '<tbody id="volunteer-rows"><tr><td colspan="5" class="text-center py-12 text-bark-muted">No volunteers yet</td></tr></tbody>';
	}
	return `<tbody id="volunteer-rows">${volunteers.map(volunteerRow).join("")}</tbody>`;
}
