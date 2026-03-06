import type { Command, Event } from "@event-driven-io/emmett";

// Value Objects

export type PaymentPreference = "bank" | "cash";

export type MeetingDetails = {
	place: string;
};

export type ApplicantIdentity = {
	phone: string;
	name: string;
	email?: string;
};

export type IdentityResolution =
	| { type: "new" }
	| { type: "matched"; applicantId: string }
	| { type: "flagged"; applicantId: string; reason: string };

export type EligibilityResult =
	| { status: "eligible" }
	| { status: "cooldown"; lastGrantMonth: string }
	| { status: "duplicate" };

// Commands

export type SubmitApplication = Command<
	"SubmitApplication",
	{
		applicationId: string;
		identity: ApplicantIdentity;
		paymentPreference: PaymentPreference;
		meetingDetails: MeetingDetails;
		monthCycle: string;
		identityResolution: IdentityResolution;
		eligibility: EligibilityResult;
		submittedAt: string;
	}
>;

// Events

export type ApplicationSubmitted = Event<
	"ApplicationSubmitted",
	{
		applicationId: string;
		applicantId: string;
		identity: ApplicantIdentity;
		paymentPreference: PaymentPreference;
		meetingDetails: MeetingDetails;
		monthCycle: string;
		submittedAt: string;
	}
>;

export type ApplicationAccepted = Event<
	"ApplicationAccepted",
	{
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		acceptedAt: string;
	}
>;

export type ApplicationRejected = Event<
	"ApplicationRejected",
	{
		applicationId: string;
		applicantId: string;
		reason: "cooldown" | "duplicate";
		detail: string;
		monthCycle: string;
		rejectedAt: string;
	}
>;

export type ApplicationFlaggedForReview = Event<
	"ApplicationFlaggedForReview",
	{
		applicationId: string;
		applicantId: string;
		reason: string;
		monthCycle: string;
		flaggedAt: string;
	}
>;

export type ApplicationEvent =
	| ApplicationSubmitted
	| ApplicationAccepted
	| ApplicationRejected
	| ApplicationFlaggedForReview;

export type ApplicationEventType = ApplicationEvent["type"];

// State

export type ApplicationState =
	| { status: "initial" }
	| {
			status: "submitted";
			applicationId: string;
			applicantId: string;
			monthCycle: string;
	  }
	| {
			status: "accepted";
			applicationId: string;
			applicantId: string;
			monthCycle: string;
	  }
	| {
			status: "rejected";
			applicationId: string;
			applicantId: string;
			reason: string;
	  }
	| {
			status: "flagged";
			applicationId: string;
			applicantId: string;
			reason: string;
	  };
