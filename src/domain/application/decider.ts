import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	ApplicationEvent,
	ApplicationState,
	IdentityResolution,
	SubmitApplication,
} from "./types.ts";

export const initialState = (): ApplicationState => ({ status: "initial" });

function resolveApplicantId(
	resolution: IdentityResolution,
	phone: string,
): string {
	switch (resolution.type) {
		case "new":
			return `applicant-${phone}`;
		case "matched":
		case "flagged":
			return resolution.applicantId;
	}
}

export function decide(
	command: SubmitApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(
			`Application already submitted (status: ${state.status})`,
		);
	}

	const { data } = command;
	const applicantId = resolveApplicantId(
		data.identityResolution,
		data.identity.phone,
	);
	const now = data.submittedAt;

	const submitted: ApplicationEvent = {
		type: "ApplicationSubmitted",
		data: {
			applicationId: data.applicationId,
			applicantId,
			identity: data.identity,
			paymentPreference: data.paymentPreference,
			meetingDetails: data.meetingDetails,
			monthCycle: data.monthCycle,
			submittedAt: now,
		},
	};

	// Flagged identity — skip eligibility, route to volunteer review
	if (data.identityResolution.type === "flagged") {
		return [
			submitted,
			{
				type: "ApplicationFlaggedForReview",
				data: {
					applicationId: data.applicationId,
					applicantId,
					reason: data.identityResolution.reason,
					monthCycle: data.monthCycle,
					flaggedAt: now,
				},
			},
		];
	}

	// Eligible — accepted
	if (data.eligibility.status === "eligible") {
		return [
			submitted,
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: data.applicationId,
					applicantId,
					monthCycle: data.monthCycle,
					acceptedAt: now,
				},
			},
		];
	}

	// Not eligible — rejected
	const detail =
		data.eligibility.status === "cooldown"
			? `Last grant in ${data.eligibility.lastGrantMonth}`
			: "Already applied this month";

	return [
		submitted,
		{
			type: "ApplicationRejected",
			data: {
				applicationId: data.applicationId,
				applicantId,
				reason: data.eligibility.status,
				detail,
				monthCycle: data.monthCycle,
				rejectedAt: now,
			},
		},
	];
}

export function evolve(
	state: ApplicationState,
	event: ApplicationEvent,
): ApplicationState {
	switch (event.type) {
		case "ApplicationSubmitted":
			return {
				status: "submitted",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				monthCycle: event.data.monthCycle,
			};
		case "ApplicationAccepted":
			return {
				status: "accepted",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				monthCycle: event.data.monthCycle,
			};
		case "ApplicationRejected":
			return {
				status: "rejected",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				reason: event.data.reason,
			};
		case "ApplicationFlaggedForReview":
			return {
				status: "flagged",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				reason: event.data.reason,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
