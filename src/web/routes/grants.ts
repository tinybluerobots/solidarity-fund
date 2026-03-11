import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	acceptCashAlternative,
	approveProofOfAddress,
	assignVolunteer,
	declineCashAlternative,
	recordPayment,
	recordReimbursement,
	rejectProofOfAddress,
	releaseSlot,
	submitBankDetails,
} from "../../domain/grant/commandHandlers.ts";
import type { GrantRepository } from "../../domain/grant/repository.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type { DocumentStore } from "../../infrastructure/projections/documents.ts";
import { emptyPanel, grantPanel } from "../pages/grantPanel.ts";
import { grantsBoard, grantsPage } from "../pages/grants.ts";
import { patchElements, sseResponse } from "../sse.ts";

function currentMonthCycle(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export function createGrantRoutes(
	grantRepo: GrantRepository,
	volunteerRepo: VolunteerRepository,
	docStore: ReturnType<typeof DocumentStore>,
	eventStore: SQLiteEventStore,
) {
	async function refreshBoard(monthCycle: string) {
		const grants = await grantRepo.listByMonth(monthCycle);
		return grantsBoard(grants);
	}

	async function showPanel(grantId: string): Promise<string | null> {
		const grant = await grantRepo.getById(grantId);
		if (!grant) return null;
		const volunteers = await volunteerRepo.list();
		const docs = await docStore.getByEntityId(grantId);
		const hasDocument = docs.some((d) => d.type === "proof_of_address");
		return grantPanel(grant, volunteers, hasDocument);
	}

	async function refreshGrantResponse(grantId: string): Promise<Response> {
		const grant = await grantRepo.getById(grantId);
		if (!grant) return new Response("Not found", { status: 404 });
		const panel = await showPanel(grantId);
		if (!panel) return new Response("Not found", { status: 404 });
		const board = await refreshBoard(grant.monthCycle);
		return sseResponse(patchElements(panel), patchElements(board));
	}

	return {
		async list(month?: string): Promise<Response> {
			const months = await grantRepo.listDistinctMonths();
			const currentMonth = month ?? months[0] ?? currentMonthCycle();
			const grants = await grantRepo.listByMonth(currentMonth);
			return new Response(grantsPage(grants, months, currentMonth), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string): Promise<Response> {
			const panel = await showPanel(id);
			if (!panel) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(panel));
		},

		closePanel(): Response {
			return sseResponse(patchElements(emptyPanel()));
		},

		async handleAssignVolunteer(
			grantId: string,
			volunteerId: string,
		): Promise<Response> {
			await assignVolunteer(grantId, volunteerId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleSubmitBankDetails(
			grantId: string,
			req: Request,
		): Promise<Response> {
			const formData = await req.formData();
			const sortCode = formData.get("sortCode")?.toString() ?? "";
			const accountNumber = formData.get("accountNumber")?.toString() ?? "";
			const poaFile = formData.get("poa") as File | null;

			let proofOfAddressRef = "";
			if (poaFile && poaFile.size > 0) {
				const docId = crypto.randomUUID();
				const buffer = Buffer.from(await poaFile.arrayBuffer());
				await docStore.store({
					id: docId,
					entityId: grantId,
					type: "proof_of_address",
					data: buffer,
					mimeType: poaFile.type,
				});
				proofOfAddressRef = docId;
			}

			await submitBankDetails(
				grantId,
				{ sortCode, accountNumber, proofOfAddressRef },
				eventStore,
			);

			// Regular form POST — redirect back to grants page
			return Response.redirect("/grants", 303);
		},

		async handleApprovePoa(
			grantId: string,
			volunteerId: string,
		): Promise<Response> {
			await approveProofOfAddress(grantId, volunteerId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleRejectPoa(
			grantId: string,
			volunteerId: string,
		): Promise<Response> {
			await rejectProofOfAddress(
				grantId,
				"Proof of address rejected",
				volunteerId,
				eventStore,
			);
			return refreshGrantResponse(grantId);
		},

		async handleAcceptCash(grantId: string): Promise<Response> {
			await acceptCashAlternative(grantId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleDeclineCash(grantId: string): Promise<Response> {
			await declineCashAlternative(grantId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleRecordPayment(
			grantId: string,
			amount: number,
			method: "bank" | "cash",
			volunteerId: string,
		): Promise<Response> {
			await recordPayment(
				grantId,
				{ amount, method, paidBy: volunteerId },
				eventStore,
			);
			return refreshGrantResponse(grantId);
		},

		async handleRecordReimbursement(
			grantId: string,
			expenseReference: string,
			volunteerId: string,
		): Promise<Response> {
			await recordReimbursement(
				grantId,
				{ volunteerId, expenseReference },
				eventStore,
			);
			return refreshGrantResponse(grantId);
		},

		async handleRelease(
			grantId: string,
			reason: string,
			volunteerId: string,
		): Promise<Response> {
			await releaseSlot(grantId, reason, volunteerId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async serveDocument(docId: string): Promise<Response> {
			const doc = await docStore.getById(docId);
			if (!doc) return new Response("Not found", { status: 404 });
			return new Response(doc.data, {
				headers: {
					"Content-Type": doc.mimeType,
					"Content-Disposition": "inline",
				},
			});
		},
	};
}
