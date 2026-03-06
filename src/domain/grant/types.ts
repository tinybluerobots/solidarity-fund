import type { Command, Event } from "@event-driven-io/emmett";
import type { PaymentPreference } from "../application/types.ts";

// Commands

export type CreateGrant = Command<
	"CreateGrant",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		rank: number;
		paymentPreference: PaymentPreference;
		createdAt: string;
	}
>;

export type AssignVolunteer = Command<
	"AssignVolunteer",
	{
		grantId: string;
		volunteerId: string;
		assignedAt: string;
	}
>;

export type SubmitBankDetails = Command<
	"SubmitBankDetails",
	{
		grantId: string;
		sortCode: string;
		accountNumber: string;
		proofOfAddressRef: string;
		submittedAt: string;
	}
>;

export type ApproveProofOfAddress = Command<
	"ApproveProofOfAddress",
	{
		grantId: string;
		verifiedBy: string;
		verifiedAt: string;
	}
>;

export type RejectProofOfAddress = Command<
	"RejectProofOfAddress",
	{
		grantId: string;
		reason: string;
		rejectedBy: string;
		rejectedAt: string;
	}
>;

export type AcceptCashAlternative = Command<
	"AcceptCashAlternative",
	{
		grantId: string;
		acceptedAt: string;
	}
>;

export type DeclineCashAlternative = Command<
	"DeclineCashAlternative",
	{
		grantId: string;
		declinedAt: string;
	}
>;

export type RecordPayment = Command<
	"RecordPayment",
	{
		grantId: string;
		amount: number;
		method: "bank" | "cash";
		paidBy: string;
		paidAt: string;
	}
>;

export type ReleaseSlot = Command<
	"ReleaseSlot",
	{
		grantId: string;
		reason: string;
		releasedBy: string;
		releasedAt: string;
	}
>;

export type GrantCommand =
	| CreateGrant
	| AssignVolunteer
	| SubmitBankDetails
	| ApproveProofOfAddress
	| RejectProofOfAddress
	| AcceptCashAlternative
	| DeclineCashAlternative
	| RecordPayment
	| ReleaseSlot;

// Events

export type GrantCreated = Event<
	"GrantCreated",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		rank: number;
		paymentPreference: PaymentPreference;
		createdAt: string;
	}
>;

export type VolunteerAssigned = Event<
	"VolunteerAssigned",
	{
		grantId: string;
		volunteerId: string;
		assignedAt: string;
	}
>;

export type BankDetailsSubmitted = Event<
	"BankDetailsSubmitted",
	{
		grantId: string;
		sortCode: string;
		accountNumber: string;
		proofOfAddressRef: string;
		submittedAt: string;
	}
>;

export type ProofOfAddressApproved = Event<
	"ProofOfAddressApproved",
	{
		grantId: string;
		verifiedBy: string;
		verifiedAt: string;
	}
>;

export type ProofOfAddressRejected = Event<
	"ProofOfAddressRejected",
	{
		grantId: string;
		reason: string;
		attempt: number;
		rejectedBy: string;
		rejectedAt: string;
	}
>;

export type CashAlternativeOffered = Event<
	"CashAlternativeOffered",
	{
		grantId: string;
		offeredAt: string;
	}
>;

export type CashAlternativeAccepted = Event<
	"CashAlternativeAccepted",
	{
		grantId: string;
		acceptedAt: string;
	}
>;

export type CashAlternativeDeclined = Event<
	"CashAlternativeDeclined",
	{
		grantId: string;
		declinedAt: string;
	}
>;

export type GrantPaid = Event<
	"GrantPaid",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		amount: number;
		method: "bank" | "cash";
		paidBy: string;
		paidAt: string;
	}
>;

export type SlotReleased = Event<
	"SlotReleased",
	{
		grantId: string;
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		reason: string;
		releasedBy: string;
		releasedAt: string;
	}
>;

export type GrantEvent =
	| GrantCreated
	| VolunteerAssigned
	| BankDetailsSubmitted
	| ProofOfAddressApproved
	| ProofOfAddressRejected
	| CashAlternativeOffered
	| CashAlternativeAccepted
	| CashAlternativeDeclined
	| GrantPaid
	| SlotReleased;

export type GrantEventType = GrantEvent["type"];

// State

type GrantCore = {
	grantId: string;
	applicationId: string;
	applicantId: string;
	monthCycle: string;
	rank: number;
	volunteerId?: string;
};

export type GrantState =
	| { status: "initial" }
	| (GrantCore & {
			status: "awaiting_bank_details";
			poaAttempts: number;
	  })
	| (GrantCore & {
			status: "bank_details_submitted";
			poaAttempts: number;
			sortCode: string;
			accountNumber: string;
			proofOfAddressRef: string;
	  })
	| (GrantCore & {
			status: "poa_approved";
			poaAttempts: number;
	  })
	| (GrantCore & {
			status: "offered_cash_alternative";
	  })
	| (GrantCore & {
			status: "awaiting_cash_handover";
	  })
	| (GrantCore & {
			status: "paid";
			amount: number;
			method: "bank" | "cash";
			paidAt: string;
	  })
	| (GrantCore & {
			status: "released";
			reason: string;
			releasedAt: string;
	  });
