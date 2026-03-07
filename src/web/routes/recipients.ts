import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createRecipient,
	deleteRecipient,
	updateRecipient,
} from "../../domain/recipient/commandHandlers.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import type { RecipientEvent } from "../../domain/recipient/types.ts";
import type { Recipient } from "../../domain/recipient/types.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import {
	historyPanel,
	type HistoryEntry,
} from "../pages/recipientHistoryPanel.ts";
import { createPanel, editPanel } from "../pages/recipientPanel.ts";
import { recipientRow, recipientsPage } from "../pages/recipients.ts";
import {
	patchElements,
	ServerSentEventGenerator,
	sseResponse,
} from "../sse.ts";

export function createRecipientRoutes(
	recipientRepo: RecipientRepository,
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const recipients = await recipientRepo.list();
			return new Response(recipientsPage(recipients), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async edit(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(editPanel(recipient)));
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
			const data = signalsToRecipientData(result.signals);
			if (!data) {
				return new Response("Name and phone are required", { status: 400 });
			}
			const { id } = await createRecipient(
				{ ...data, volunteerId },
				eventStore,
			);
			const recipients = await recipientRepo.list();
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(recipientsTableBody(recipients)),
				patchElements(editPanel(recipient)),
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
			const data = signalsToRecipientData(result.signals);
			if (!data) {
				return new Response("Name and phone are required", { status: 400 });
			}
			await updateRecipient(id, volunteerId, data, eventStore);
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			const recipients = await recipientRepo.list();
			return sseResponse(
				patchElements(editPanel(recipient)),
				patchElements(recipientsTableBody(recipients)),
			);
		},

		async handleDelete(id: string, volunteerId: string): Promise<Response> {
			await deleteRecipient(id, volunteerId, eventStore);
			const recipients = await recipientRepo.list();
			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(recipientsTableBody(recipients)),
			);
		},

		async history(id: string): Promise<Response> {
			const { events } = await eventStore.readStream<RecipientEvent>(
				`recipient-${id}`,
			);
			if (events.length === 0)
				return new Response("Not found", { status: 404 });

			const volunteerIds = new Set(
				events
					.map((e) =>
						"volunteerId" in e.data ? e.data.volunteerId : undefined,
					)
					.filter((vid): vid is string => !!vid),
			);

			const volunteerNames = new Map<string, string>();
			for (const vid of volunteerIds) {
				const vol = await volunteerRepo.getById(vid);
				if (vol) volunteerNames.set(vid, vol.name);
			}

			const entries: HistoryEntry[] = events.map((e) => {
				const volunteerId =
					"volunteerId" in e.data ? e.data.volunteerId : undefined;
				const timestamp =
					"createdAt" in e.data
						? e.data.createdAt
						: "updatedAt" in e.data
							? e.data.updatedAt
							: (e.data as { deletedAt: string }).deletedAt;
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

function signalsToRecipientData(signals: Record<string, unknown>): {
	name: string;
	phone: string;
	email?: string;
	paymentPreference: "bank" | "cash";
	meetingPlace?: string;
	bankDetails?: { sortCode: string; accountNumber: string };
	notes?: string;
} | null {
	const name = String(signals.name ?? "").trim();
	const phone = String(signals.phone ?? "").trim();
	if (!name || !phone) return null;
	if (!/^\d+$/.test(phone)) return null;

	const pref = signals.paymentPreference === "bank" ? "bank" : "cash";
	const sortCode = String(signals.sortCode ?? "").trim();
	const accountNumber = String(signals.accountNumber ?? "").trim();

	return {
		name,
		phone,
		email: String(signals.email ?? "").trim() || undefined,
		paymentPreference: pref,
		meetingPlace: String(signals.meetingPlace ?? "").trim() || undefined,
		bankDetails:
			pref === "bank" && sortCode && accountNumber
				? { sortCode, accountNumber }
				: undefined,
		notes: String(signals.notes ?? "").trim() || undefined,
	};
}

function recipientsTableBody(recipients: Recipient[]): string {
	if (recipients.length === 0) {
		return '<tbody id="recipient-rows"><tr><td colspan="4" class="text-center py-12 text-bark-muted">No recipients yet</td></tr></tbody>';
	}
	return `<tbody id="recipient-rows">${recipients.map(recipientRow).join("")}</tbody>`;
}
