export type ApplicationRow = {
	id: string;
	applicantId: string;
	monthCycle: string;
	status: string;
	rank: number | null;
	paymentPreference: string;
	name: string | null;
	phone: string | null;
	rejectReason: string | null;
	appliedAt: string | null;
	acceptedAt: string | null;
	selectedAt: string | null;
	rejectedAt: string | null;
	sortCode: string | null;
	accountNumber: string | null;
	poaRef: string | null;
};

export type ApplicationFilters = {
	status?: string;
	paymentPreference?: string;
};

export interface ApplicationRepository {
	getById(id: string): Promise<ApplicationRow | null>;
	listByMonth(
		monthCycle: string,
		filters?: ApplicationFilters,
	): Promise<ApplicationRow[]>;
	listDistinctMonths(): Promise<string[]>;
}
