import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createRecipient,
	deleteRecipient,
	updateRecipient,
} from "../../domain/recipient/commandHandlers.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import type { Recipient } from "../../domain/recipient/types.ts";
import { createPanel, editPanel, viewPanel } from "../pages/recipientPanel.ts";
import { recipientRow, recipientsPage } from "../pages/recipients.ts";
import { patchElements, sseResponse } from "../sse.ts";

export function createRecipientRoutes(
	recipientRepo: RecipientRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const recipients = await recipientRepo.list();
			return new Response(recipientsPage(recipients), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(viewPanel(recipient)));
		},

		async edit(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(editPanel(recipient)));
		},

		create(): Response {
			return sseResponse(patchElements(createPanel()));
		},

		async handleCreate(form: FormData, volunteerId: string): Promise<Response> {
			const data = formToRecipientData(form);
			const { id } = await createRecipient(
				{ ...data, volunteerId },
				eventStore,
			);
			const recipients = await recipientRepo.list();
			const recipient = await recipientRepo.getById(id);
			return sseResponse(
				patchElements(recipientsTableBody(recipients)),
				patchElements(viewPanel(recipient!)),
			);
		},

		async handleUpdate(
			id: string,
			form: FormData,
			volunteerId: string,
		): Promise<Response> {
			const data = formToRecipientData(form);
			await updateRecipient(id, volunteerId, data, eventStore);
			const recipient = await recipientRepo.getById(id);
			const recipients = await recipientRepo.list();
			return sseResponse(
				patchElements(viewPanel(recipient!)),
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
	};
}

function formToRecipientData(form: FormData) {
	const pref = (form.get("paymentPreference") as string) || "cash";
	const sortCode = form.get("sortCode") as string | null;
	const accountNumber = form.get("accountNumber") as string | null;
	return {
		name: form.get("name") as string,
		phone: form.get("phone") as string,
		email: (form.get("email") as string) || undefined,
		paymentPreference: pref as "bank" | "cash",
		meetingPlace: (form.get("meetingPlace") as string) || undefined,
		bankDetails:
			pref === "bank" && sortCode && accountNumber
				? { sortCode, accountNumber }
				: undefined,
		notes: (form.get("notes") as string) || undefined,
	};
}

function recipientsTableBody(recipients: Recipient[]): string {
	if (recipients.length === 0) {
		return '<tbody id="recipient-rows"><tr><td colspan="4" class="text-center py-12 text-bark-muted">No recipients yet</td></tr></tbody>';
	}
	return `<tbody id="recipient-rows">${recipients.map(recipientRow).join("")}</tbody>`;
}
