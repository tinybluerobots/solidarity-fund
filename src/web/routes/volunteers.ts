import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createVolunteer,
	disableVolunteer,
	enableVolunteer,
	updateVolunteer,
} from "../../domain/volunteer/commandHandlers.ts";
import type {
	VolunteerCredentialsStore,
	VolunteerRepository,
} from "../../domain/volunteer/repository.ts";
import type {
	Volunteer,
	VolunteerEvent,
} from "../../domain/volunteer/types.ts";
import {
	isValidPhone,
	normalizePhone,
} from "../../domain/application/normalizePhone.ts";
import {
	type VolunteerHistoryEntry,
	volunteerHistoryPanel,
} from "../pages/volunteerHistoryPanel.ts";
import { createPanel, editPanel } from "../pages/volunteerPanel.ts";
import { volunteerRow, volunteersPage } from "../pages/volunteers.ts";
import {
	patchElements,
	ServerSentEventGenerator,
	sseResponse,
} from "../sse.ts";

export function createVolunteerRoutes(
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
	credentialsStore: VolunteerCredentialsStore,
) {
	return {
		async list(): Promise<Response> {
			const volunteers = await volunteerRepo.list();
			return new Response(volunteersPage(volunteers), {
				headers: { "Content-Type": "text/html" },
			});
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

		async handleCreate(
			req: Request,
			currentVolunteerId: string,
		): Promise<Response> {
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
			const { id } = await createVolunteer(data, eventStore, credentialsStore);
			const volunteers = await volunteerRepo.list();
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(volunteersTableBody(volunteers)),
				patchElements(editPanel(volunteer, currentVolunteerId)),
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
			const data = signalsToVolunteerUpdateData(result.signals);
			if (!data) {
				return new Response("Name is required", { status: 400 });
			}
			await updateVolunteer(id, data, eventStore, credentialsStore);
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements(editPanel(volunteer, currentVolunteerId)),
				patchElements(volunteersTableBody(volunteers)),
			);
		},

		async handleDisable(
			id: string,
			currentVolunteerId: string,
		): Promise<Response> {
			if (id === currentVolunteerId) {
				return new Response("Cannot disable yourself", { status: 400 });
			}
			await disableVolunteer(id, eventStore);
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements(editPanel(volunteer, currentVolunteerId)),
				patchElements(volunteersTableBody(volunteers)),
			);
		},

		async history(id: string): Promise<Response> {
			const { events } = await eventStore.readStream<VolunteerEvent>(
				`volunteer-${id}`,
			);
			if (events.length === 0)
				return sseResponse(patchElements(volunteerHistoryPanel([])));

			const entries: VolunteerHistoryEntry[] = events.map((e) => {
				const timestamp =
					e.type === "VolunteerCreated"
						? e.data.createdAt
						: e.type === "VolunteerUpdated"
							? e.data.updatedAt
							: e.type === "VolunteerDisabled"
								? e.data.disabledAt
								: e.type === "VolunteerEnabled"
									? e.data.enabledAt
									: e.data.changedAt;
				return { type: e.type, timestamp };
			});

			return sseResponse(patchElements(volunteerHistoryPanel(entries)));
		},

		async handleEnable(
			id: string,
			currentVolunteerId: string,
		): Promise<Response> {
			await enableVolunteer(id, eventStore);
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements(editPanel(volunteer, currentVolunteerId)),
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

	const phone = String(signals.phone ?? "").trim();
	if (phone && !isValidPhone(phone)) return null;

	return {
		name,
		phone: phone ? normalizePhone(phone) : undefined,
		email: String(signals.email ?? "").trim() || undefined,
		password,
		isAdmin: signals.isAdmin === true,
	};
}

function signalsToVolunteerUpdateData(signals: Record<string, unknown>): {
	name?: string;
	phone?: string | null;
	email?: string | null;
	password?: string;
	isAdmin?: boolean;
} | null {
	const name = String(signals.name ?? "").trim();
	if (!name) return null;

	const password = String(signals.password ?? "").trim() || undefined;
	const phone = String(signals.phone ?? "").trim();
	if (phone && !isValidPhone(phone)) return null;
	const email = String(signals.email ?? "").trim();

	return {
		name,
		phone: phone ? normalizePhone(phone) : null,
		email: email || null,
		password,
		isAdmin: signals.isAdmin === true,
	};
}

function volunteersTableBody(volunteers: Volunteer[]): string {
	if (volunteers.length === 0) {
		return '<tbody id="volunteer-rows"><tr><td colspan="5" class="text-center py-12 text-bark-muted">No volunteers yet</td></tr></tbody>';
	}
	return `<tbody id="volunteer-rows">${volunteers.map(volunteerRow).join("")}</tbody>`;
}
