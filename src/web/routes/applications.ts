import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import { reviewApplication } from "../../domain/application/reviewApplication.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import { reviewPanel, viewPanel } from "../pages/applicationPanel.ts";
import {
	applicationsPage,
	applicationsTableBody,
} from "../pages/applications.ts";
import { patchElements, sseResponse } from "../sse.ts";

function currentMonthCycle(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export function createApplicationRoutes(
	appRepo: ApplicationRepository,
	_recipientRepo: RecipientRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async list(month?: string): Promise<Response> {
			const months = await appRepo.listDistinctMonths();
			const currentMonth = month ?? months[0] ?? currentMonthCycle();
			const applications = await appRepo.listByMonth(currentMonth);
			return new Response(
				applicationsPage(applications, months, currentMonth),
				{
					headers: { "Content-Type": "text/html" },
				},
			);
		},

		async detail(id: string): Promise<Response> {
			const app = await appRepo.getById(id);
			if (!app) return new Response("Not found", { status: 404 });
			const panel =
				app.status === "flagged" ? reviewPanel(app) : viewPanel(app);
			return sseResponse(patchElements(panel));
		},

		async handleReview(
			applicationId: string,
			decision: "confirm" | "reject",
			volunteerId: string,
		): Promise<Response> {
			const app = await appRepo.getById(applicationId);
			if (!app) return new Response("Not found", { status: 404 });

			const eligibility =
				decision === "confirm"
					? await checkEligibility(app.applicantId, app.monthCycle, pool)
					: ({ status: "eligible" } as const);

			await reviewApplication(
				applicationId,
				volunteerId,
				decision,
				eligibility,
				eventStore,
			);

			const updated = await appRepo.getById(applicationId);
			if (!updated) return new Response("Not found", { status: 404 });

			const applications = await appRepo.listByMonth(app.monthCycle);
			return sseResponse(
				patchElements(viewPanel(updated)),
				patchElements(applicationsTableBody(applications)),
			);
		},

		closePanel(): Response {
			return sseResponse(patchElements('<div id="panel"></div>'));
		},
	};
}
