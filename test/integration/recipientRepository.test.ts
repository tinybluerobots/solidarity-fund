import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";

describe("RecipientRepository", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: RecipientRepository;

	beforeEach(async () => {
		pool = SQLiteConnectionPool({ fileName: ":memory:" });
		repo = await SQLiteRecipientRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("create", () => {
		test("creates a recipient with required fields", async () => {
			const recipient = await repo.create({
				phone: "07700900001",
				name: "Alice",
			});

			expect(recipient.id).toBeString();
			expect(recipient.phone).toBe("07700900001");
			expect(recipient.name).toBe("Alice");
			expect(recipient.paymentPreference).toBe("cash");
			expect(recipient.createdAt).toBeString();
			expect(recipient.updatedAt).toBeString();
		});

		test("creates a recipient with all fields", async () => {
			const recipient = await repo.create({
				phone: "07700900001",
				name: "Alice",
				email: "alice@example.com",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
				notes: "Prefers morning meetings",
			});

			expect(recipient.email).toBe("alice@example.com");
			expect(recipient.paymentPreference).toBe("bank");
			expect(recipient.meetingPlace).toBe("Mill Road");
			expect(recipient.bankDetails).toEqual({
				sortCode: "12-34-56",
				accountNumber: "12345678",
			});
			expect(recipient.notes).toBe("Prefers morning meetings");
		});

		test("rejects duplicate phone number", async () => {
			await repo.create({ phone: "07700900001", name: "Alice" });
			await expect(
				repo.create({ phone: "07700900001", name: "Bob" }),
			).rejects.toThrow();
		});
	});

	describe("getById", () => {
		test("returns recipient by id", async () => {
			const created = await repo.create({
				phone: "07700900001",
				name: "Alice",
			});
			const found = await repo.getById(created.id);

			expect(found).not.toBeNull();
			expect(found!.phone).toBe("07700900001");
		});

		test("returns null for unknown id", async () => {
			const found = await repo.getById("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("getByPhone", () => {
		test("returns recipient by phone", async () => {
			await repo.create({ phone: "07700900001", name: "Alice" });
			const found = await repo.getByPhone("07700900001");

			expect(found).not.toBeNull();
			expect(found!.name).toBe("Alice");
		});

		test("returns null for unknown phone", async () => {
			const found = await repo.getByPhone("00000000000");
			expect(found).toBeNull();
		});
	});

	describe("list", () => {
		test("returns all recipients", async () => {
			await repo.create({ phone: "07700900001", name: "Alice" });
			await repo.create({ phone: "07700900002", name: "Bob" });
			const all = await repo.list();

			expect(all).toHaveLength(2);
		});

		test("returns empty array when no recipients", async () => {
			const all = await repo.list();
			expect(all).toHaveLength(0);
		});
	});

	describe("update", () => {
		test("updates name", async () => {
			const created = await repo.create({ phone: "07700900001", name: "Alice" });
			await new Promise((r) => setTimeout(r, 5));
			const updated = await repo.update(created.id, { name: "Alicia" });

			expect(updated.name).toBe("Alicia");
			expect(updated.phone).toBe("07700900001");
			expect(updated.updatedAt).not.toBe(created.updatedAt);
		});

		test("updates bank details", async () => {
			const created = await repo.create({ phone: "07700900001", name: "Alice" });
			const updated = await repo.update(created.id, {
				bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
			});

			expect(updated.bankDetails).toEqual({
				sortCode: "12-34-56",
				accountNumber: "12345678",
			});
		});

		test("preserves optional fields when not provided in update", async () => {
			const created = await repo.create({
				phone: "07700900001",
				name: "Alice",
				notes: "Some note",
			});
			const updated = await repo.update(created.id, { name: "Alicia" });

			expect(updated.notes).toBe("Some note");
		});

		test("clears optional fields when set to null", async () => {
			const created = await repo.create({
				phone: "07700900001",
				name: "Alice",
				notes: "Some note",
				email: "alice@example.com",
			});
			const updated = await repo.update(created.id, { notes: null, email: null });

			expect(updated.notes).toBeUndefined();
			expect(updated.email).toBeUndefined();
		});

		test("throws for unknown id", async () => {
			await expect(
				repo.update("nonexistent", { name: "Alice" }),
			).rejects.toThrow(/not found/i);
		});
	});

	describe("delete", () => {
		test("deletes a recipient", async () => {
			const created = await repo.create({ phone: "07700900001", name: "Alice" });
			await repo.delete(created.id);
			const found = await repo.getById(created.id);

			expect(found).toBeNull();
		});

		test("is idempotent for unknown id", async () => {
			await expect(repo.delete("nonexistent")).resolves.toBeUndefined();
		});
	});
});
