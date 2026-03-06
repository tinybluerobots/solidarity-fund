import { IllegalStateError } from "@event-driven-io/emmett";
import { toApplicantId } from "./applicantId.ts";
import type {
	ApplicationEvent,
	ApplicationState,
	IdentityResolution,
	RejectFromLottery,
	ReviewApplication,
	SelectApplication,
	SubmitApplication,
} from "./types.ts";

export type ApplicationCommand =
	| SubmitApplication
	| ReviewApplication
	| SelectApplication
	| RejectFromLottery;

export const initialState = (): ApplicationState => ({ status: "initial" });

function resolveApplicantId(
	resolution: IdentityResolution,
	phone: string,
): string {
	switch (resolution.type) {
		case "new":
			return toApplicantId(phone);
		case "matched":
		case "flagged":
			return resolution.applicantId;
	}
}

export function decide(
	command: ApplicationCommand,
	state: ApplicationState,
): ApplicationEvent[] {
	switch (command.type) {
		case "SubmitApplication":
			return decideSubmit(command, state);
		case "ReviewApplication":
			return decideReview(command, state);
		case "SelectApplication":
			return decideSelect(command, state);
		case "RejectFromLottery":
			return decideRejectFromLottery(command, state);
	}
}

function decideSubmit(
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

function decideReview(
	command: ReviewApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "flagged") {
		throw new IllegalStateError(
			`Cannot review application in ${state.status} state`,
		);
	}

	const { data } = command;

	if (data.decision === "reject") {
		return [
			{
				type: "ApplicationRejected",
				data: {
					applicationId: state.applicationId,
					applicantId: state.applicantId,
					reason: "identity_mismatch",
					detail: "Rejected by volunteer review",
					volunteerId: data.volunteerId,
					monthCycle: state.monthCycle,
					rejectedAt: data.reviewedAt,
				},
			},
		];
	}

	// Confirmed — still need eligibility check
	if (data.eligibility.status === "eligible") {
		return [
			{
				type: "ApplicationConfirmed",
				data: {
					applicationId: state.applicationId,
					applicantId: state.applicantId,
					volunteerId: data.volunteerId,
					monthCycle: state.monthCycle,
					confirmedAt: data.reviewedAt,
				},
			},
		];
	}

	const detail =
		data.eligibility.status === "cooldown"
			? `Last grant in ${data.eligibility.lastGrantMonth}`
			: "Already applied this month";

	return [
		{
			type: "ApplicationRejected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				reason: data.eligibility.status,
				detail,
				volunteerId: data.volunteerId,
				monthCycle: state.monthCycle,
				rejectedAt: data.reviewedAt,
			},
		},
	];
}

function decideSelect(
	command: SelectApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "accepted" && state.status !== "confirmed") {
		throw new IllegalStateError(
			`Cannot select application in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationSelected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				rank: command.data.rank,
				selectedAt: command.data.selectedAt,
			},
		},
	];
}

function decideRejectFromLottery(
	command: RejectFromLottery,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "accepted" && state.status !== "confirmed") {
		throw new IllegalStateError(
			`Cannot reject application from lottery in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationNotSelected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				notSelectedAt: command.data.rejectedAt,
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
		case "ApplicationConfirmed":
			return {
				status: "confirmed",
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
				monthCycle: event.data.monthCycle,
				reason: event.data.reason,
			};
		case "ApplicationSelected":
			return {
				status: "selected",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				monthCycle: event.data.monthCycle,
				rank: event.data.rank,
			};
		case "ApplicationNotSelected":
			return {
				status: "not_selected",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				monthCycle: event.data.monthCycle,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
