import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createApplicant,
	deleteApplicant,
	updateApplicant,
} from "../../domain/applicant/commandHandlers.ts";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import type {
	Applicant,
	ApplicantEvent,
} from "../../domain/applicant/types.ts";
import {
	isValidPhone,
	normalizePhone,
} from "../../domain/application/normalizePhone.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import {
	type HistoryEntry,
	historyPanel,
} from "../pages/applicantHistoryPanel.ts";
import { createPanel, editPanel } from "../pages/applicantPanel.ts";
import { applicantRow, applicantsPage } from "../pages/applicants.ts";
import {
	patchElements,
	ServerSentEventGenerator,
	sseResponse,
} from "../sse.ts";

export function createApplicantRoutes(
	applicantRepo: ApplicantRepository,
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const applicants = await applicantRepo.list();
			return new Response(applicantsPage(applicants), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async edit(id: string): Promise<Response> {
			const applicant = await applicantRepo.getById(id);
			if (!applicant) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(editPanel(applicant)));
		},

		create(): Response {
			return sseResponse(patchElements(createPanel()));
		},

		closePanel(): Response {
			return sseResponse(patchElements('<div id="panel"></div>'));
		},

		async handleCreate(req: Request, volunteerId: string): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const data = signalsToApplicantData(result.signals);
			if (!data) {
				return new Response("Name and phone are required", { status: 400 });
			}
			const { id } = await createApplicant(
				{ ...data, volunteerId },
				eventStore,
			);
			const applicants = await applicantRepo.list();
			const applicant = await applicantRepo.getById(id);
			if (!applicant) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(applicantsTableBody(applicants)),
				patchElements(editPanel(applicant)),
			);
		},

		async handleUpdate(
			id: string,
			req: Request,
			volunteerId: string,
		): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const data = signalsToApplicantData(result.signals);
			if (!data) {
				return new Response("Name and phone are required", { status: 400 });
			}
			await updateApplicant(id, volunteerId, data, eventStore);
			const applicants = await applicantRepo.list();
			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(applicantsTableBody(applicants)),
			);
		},

		async handleDelete(id: string, volunteerId: string): Promise<Response> {
			await deleteApplicant(id, volunteerId, eventStore);
			const applicants = await applicantRepo.list();
			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(applicantsTableBody(applicants)),
			);
		},

		async handleUpdateNotes(id: string, req: Request): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const notes = String(result.signals.notes ?? "");
			await applicantRepo.updateNotes(id, notes);
			return sseResponse();
		},

		async history(id: string): Promise<Response> {
			const { events } = await eventStore.readStream<ApplicantEvent>(
				`applicant-${id}`,
			);
			if (events.length === 0)
				return sseResponse(patchElements(historyPanel([])));

			const volunteerIds = new Set(
				events
					.map((e) => e.data.volunteerId)
					.filter((vid): vid is string => !!vid),
			);

			const volunteerNames = new Map<string, string>();
			for (const vid of volunteerIds) {
				const vol = await volunteerRepo.getById(vid);
				if (vol) volunteerNames.set(vid, vol.name);
			}

			const entries: HistoryEntry[] = events.map((e) => {
				const volunteerId = e.data.volunteerId;
				const timestamp =
					e.type === "ApplicantCreated"
						? e.data.createdAt
						: e.type === "ApplicantUpdated"
							? e.data.updatedAt
							: e.data.deletedAt;
				return {
					type: e.type,
					volunteerName: volunteerId
						? (volunteerNames.get(volunteerId) ?? "unknown")
						: null,
					timestamp,
				};
			});

			return sseResponse(patchElements(historyPanel(entries)));
		},
	};
}

function signalsToApplicantData(signals: Record<string, unknown>): {
	name: string;
	phone: string;
	email?: string;
} | null {
	const name = String(signals.name ?? "").trim();
	const phone = String(signals.phone ?? "").trim();
	if (!name || !phone) return null;
	if (!isValidPhone(phone)) return null;

	return {
		name,
		phone: normalizePhone(phone),
		email: String(signals.email ?? "").trim() || undefined,
	};
}

function applicantsTableBody(applicants: Applicant[]): string {
	if (applicants.length === 0) {
		return '<tbody id="applicant-rows"><tr><td colspan="4" class="text-center py-12 text-bark-muted">No applicants yet</td></tr></tbody>';
	}
	return `<tbody id="applicant-rows">${applicants.map(applicantRow).join("")}</tbody>`;
}
