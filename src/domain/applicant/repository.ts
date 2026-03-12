import type { Applicant } from "./types.ts";

export interface ApplicantRepository {
	getById(id: string): Promise<Applicant | null>;
	getByPhone(phone: string): Promise<Applicant[]>;
	getByPhoneAndName(phone: string, name: string): Promise<Applicant | null>;
	list(): Promise<Applicant[]>;
	updateNotes(id: string, notes: string): Promise<void>;
}
