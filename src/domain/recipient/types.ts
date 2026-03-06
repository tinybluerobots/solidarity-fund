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
