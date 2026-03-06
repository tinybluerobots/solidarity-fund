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

export type UpdateRecipient = Partial<Omit<CreateRecipient, "phone">> & {
	phone?: string;
};
