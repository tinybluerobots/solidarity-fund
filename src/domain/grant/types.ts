import type { Event } from "@event-driven-io/emmett";

export type GrantStatus =
	| "applied"
	| "accepted"
	| "rejected"
	| "paid"
	| "payment_failed";

export type GrantVolunteerAssigned = Event<
	"GrantVolunteerAssigned",
	{
		grantId: string;
		recipientId: string;
		volunteerId: string;
		assignedAt: string;
	}
>;

export type GrantPaid = Event<
	"GrantPaid",
	{
		grantId: string;
		recipientId: string;
		monthCycle: string;
		paidAt: string;
	}
>;

export type GrantPaymentFailed = Event<
	"GrantPaymentFailed",
	{
		grantId: string;
		recipientId: string;
		monthCycle: string;
		reason: string;
		failedAt: string;
	}
>;

export type GrantEvent =
	| GrantVolunteerAssigned
	| GrantPaid
	| GrantPaymentFailed;

export type GrantEventType = GrantEvent["type"];
