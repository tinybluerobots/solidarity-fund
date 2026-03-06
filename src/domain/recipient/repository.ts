import type { Recipient, CreateRecipient, UpdateRecipient } from "./types.ts";

export interface RecipientRepository {
	create(data: CreateRecipient): Promise<Recipient>;
	getById(id: string): Promise<Recipient | null>;
	getByPhone(phone: string): Promise<Recipient | null>;
	list(): Promise<Recipient[]>;
	update(id: string, data: UpdateRecipient): Promise<Recipient>;
	delete(id: string): Promise<void>;
}
