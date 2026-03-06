export type PaymentPreference = "bank" | "cash";

export type BankDetails = {
	sortCode: string;
	accountNumber: string;
};

export type Recipient = {
	id: string;
	phone: string;
	name: string;
	email?: string;
	paymentPreference: PaymentPreference;
	meetingPlace?: string;
	bankDetails?: BankDetails;
	notes?: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateRecipient = {
	volunteerId?: string;
	applicationId?: string;
	phone: string;
	name: string;
	email?: string;
	paymentPreference?: PaymentPreference;
	meetingPlace?: string;
	bankDetails?: BankDetails;
	notes?: string;
};

export type UpdateRecipient = {
	phone?: string;
	name?: string;
	email?: string | null;
	paymentPreference?: PaymentPreference;
	meetingPlace?: string | null;
	bankDetails?: BankDetails | null;
	notes?: string | null;
};

// Commands

import type { Command, Event } from "@event-driven-io/emmett";

export type CreateRecipientCommand = Command<
	"CreateRecipient",
	{
		id: string;
		volunteerId?: string;
		applicationId?: string;
		phone: string;
		name: string;
		email?: string;
		paymentPreference: PaymentPreference;
		meetingPlace?: string;
		bankDetails?: BankDetails;
		notes?: string;
		createdAt: string;
	}
>;

export type UpdateRecipientCommand = Command<
	"UpdateRecipient",
	{
		id: string;
		volunteerId: string;
		phone: string;
		name: string;
		email?: string;
		paymentPreference: PaymentPreference;
		meetingPlace?: string;
		bankDetails?: BankDetails;
		notes?: string;
		updatedAt: string;
	}
>;

export type DeleteRecipientCommand = Command<
	"DeleteRecipient",
	{
		id: string;
		volunteerId: string;
		deletedAt: string;
	}
>;

export type RecipientCommand =
	| CreateRecipientCommand
	| UpdateRecipientCommand
	| DeleteRecipientCommand;

// Events

export type RecipientCreated = Event<
	"RecipientCreated",
	{
		id: string;
		volunteerId?: string;
		applicationId?: string;
		phone: string;
		name: string;
		email?: string;
		paymentPreference: PaymentPreference;
		meetingPlace?: string;
		bankDetails?: BankDetails;
		notes?: string;
		createdAt: string;
	}
>;

export type RecipientUpdated = Event<
	"RecipientUpdated",
	{
		id: string;
		volunteerId: string;
		phone: string;
		name: string;
		email?: string;
		paymentPreference: PaymentPreference;
		meetingPlace?: string;
		bankDetails?: BankDetails;
		notes?: string;
		updatedAt: string;
	}
>;

export type RecipientDeleted = Event<
	"RecipientDeleted",
	{
		id: string;
		volunteerId: string;
		deletedAt: string;
	}
>;

export type RecipientEvent =
	| RecipientCreated
	| RecipientUpdated
	| RecipientDeleted;

export type RecipientEventType = RecipientEvent["type"];

// State

export type RecipientState =
	| { status: "initial" }
	| {
			status: "active";
			id: string;
			phone: string;
			name: string;
			email?: string;
			paymentPreference: PaymentPreference;
			meetingPlace?: string;
			bankDetails?: BankDetails;
			notes?: string;
			createdAt: string;
			updatedAt: string;
	  }
	| { status: "deleted" };
