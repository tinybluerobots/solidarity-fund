import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	createRecipient,
	deleteRecipient,
	updateRecipient,
} from "../../src/domain/recipient/commandHandlers.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import type { RecipientEvent } from "../../src/domain/recipient/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";

describe("Recipient (event-sourced)", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: RecipientRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		repo = await SQLiteRecipientRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("create", () => {
		test("creates a recipient with required fields", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.phone).toBe("07700900001");
			expect(found!.name).toBe("Alice");
			expect(found!.paymentPreference).toBe("cash");
			expect(found!.createdAt).toBeString();
			expect(found!.updatedAt).toBeString();
		});

		test("creates a recipient with all fields", async () => {
			const { id } = await createRecipient(
				{
					phone: "07700900001",
					name: "Alice",
					email: "alice@example.com",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
					notes: "Prefers morning meetings",
				},
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.email).toBe("alice@example.com");
			expect(found!.paymentPreference).toBe("bank");
			expect(found!.meetingPlace).toBe("Mill Road");
			expect(found!.bankDetails).toEqual({
				sortCode: "12-34-56",
				accountNumber: "12345678",
			});
			expect(found!.notes).toBe("Prefers morning meetings");
		});

		test("rejects duplicate phone number", async () => {
			await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await expect(
				createRecipient({ phone: "07700900001", name: "Bob" }, eventStore),
			).rejects.toThrow();
		});
	});

	describe("getById", () => {
		test("returns recipient by id", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const found = await repo.getById(id);

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
			await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
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
			await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await createRecipient({ phone: "07700900002", name: "Bob" }, eventStore);
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
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await new Promise((r) => setTimeout(r, 5));
			await updateRecipient(id, "v-1", { name: "Alicia" }, eventStore);

			const found = await repo.getById(id);
			expect(found!.name).toBe("Alicia");
			expect(found!.phone).toBe("07700900001");
		});

		test("updates bank details", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await updateRecipient(
				id,
				"v-1",
				{ bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" } },
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found!.bankDetails).toEqual({
				sortCode: "12-34-56",
				accountNumber: "12345678",
			});
		});

		test("preserves optional fields when not provided in update", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice", notes: "Some note" },
				eventStore,
			);
			await updateRecipient(id, "v-1", { name: "Alicia" }, eventStore);

			const found = await repo.getById(id);
			expect(found!.notes).toBe("Some note");
		});

		test("clears optional fields when set to null", async () => {
			const { id } = await createRecipient(
				{
					phone: "07700900001",
					name: "Alice",
					notes: "Some note",
					email: "alice@example.com",
				},
				eventStore,
			);
			await updateRecipient(
				id,
				"v-1",
				{ notes: null, email: null },
				eventStore,
			);

			const found = await repo.getById(id);
			expect(found!.notes).toBeUndefined();
			expect(found!.email).toBeUndefined();
		});
	});

	describe("delete", () => {
		test("deletes a recipient", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await deleteRecipient(id, "v-1", eventStore);
			const found = await repo.getById(id);

			expect(found).toBeNull();
		});
	});

	describe("audit trail", () => {
		test("create stores volunteerId in event", async () => {
			const { id } = await createRecipient(
				{ volunteerId: "v-1", phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const { events } = await eventStore.readStream<RecipientEvent>(
				`recipient-${id}`,
			);
			const created = events.find((e) => e.type === "RecipientCreated");
			expect(created).toBeDefined();
			expect(created!.data.volunteerId).toBe("v-1");
		});

		test("create without volunteerId stores undefined", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const { events } = await eventStore.readStream<RecipientEvent>(
				`recipient-${id}`,
			);
			const created = events.find((e) => e.type === "RecipientCreated");
			expect(created!.data.volunteerId).toBeUndefined();
		});

		test("update stores volunteerId in event", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await updateRecipient(id, "v-2", { name: "Alicia" }, eventStore);

			const { events } = await eventStore.readStream<RecipientEvent>(
				`recipient-${id}`,
			);
			const updated = events.find((e) => e.type === "RecipientUpdated");
			expect(updated).toBeDefined();
			expect(updated!.data.volunteerId).toBe("v-2");
		});

		test("delete stores volunteerId in event", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await deleteRecipient(id, "v-3", eventStore);

			const { events } = await eventStore.readStream<RecipientEvent>(
				`recipient-${id}`,
			);
			const deleted = events.find((e) => e.type === "RecipientDeleted");
			expect(deleted).toBeDefined();
			expect(deleted!.data.volunteerId).toBe("v-3");
		});
	});
});
