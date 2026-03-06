import type { Volunteer } from "./types.ts";

export interface VolunteerRepository {
	getById(id: string): Promise<Volunteer | null>;
	getByName(name: string): Promise<Volunteer | null>;
	list(): Promise<Volunteer[]>;
	verifyPassword(id: string, password: string): Promise<boolean>;
}
