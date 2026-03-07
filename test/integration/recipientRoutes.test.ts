import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createRecipient } from "../../src/domain/recipient/commandHandlers";
import type { RecipientRepository } from "../../src/domain/recipient/repository";
import { createEventStore } from "../../src/infrastructure/eventStore";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository";
import { createRecipientRoutes } from "../../src/web/routes/recipients";

describe("recipient routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;
	let routes: ReturnType<typeof createRecipientRoutes>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
		routes = createRecipientRoutes(recipientRepo, eventStore);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("list", () => {
		test("returns HTML page with recipients", async () => {
			await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.list();
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Alice");
			expect(html).toContain("Recipients");
		});

		test("returns empty state when no recipients", async () => {
			const res = await routes.list();
			const html = await res.text();
			expect(html).toContain("No recipients yet");
		});
	});

	describe("detail", () => {
		test("returns SSE with view panel", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.detail(id);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
			const body = await res.text();
			expect(body).toContain("Alice");
			expect(body).toContain("datastar-patch-elements");
		});

		test("returns 404 for unknown id", async () => {
			const res = await routes.detail("nonexistent");
			expect(res.status).toBe(404);
		});
	});

	describe("edit", () => {
		test("returns SSE with edit form", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.edit(id);
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain('value="Alice"');
		});
	});

	describe("create form", () => {
		test("returns SSE with empty form", () => {
			const res = routes.create();
			// create() is sync, not async
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
		});
	});

	describe("handleCreate", () => {
		test("creates recipient and returns SSE", async () => {
			const form = new FormData();
			form.set("name", "Charlie");
			form.set("phone", "07700900099");
			form.set("paymentPreference", "cash");

			const res = await routes.handleCreate(form, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const created = await recipientRepo.getByPhone("07700900099");
			expect(created).not.toBeNull();
			expect(created!.name).toBe("Charlie");
		});
	});

	describe("handleUpdate", () => {
		test("updates recipient and returns SSE", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);

			const form = new FormData();
			form.set("name", "Alicia");
			form.set("phone", "07700900001");
			form.set("paymentPreference", "cash");

			const res = await routes.handleUpdate(id, form, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await recipientRepo.getById(id);
			expect(updated!.name).toBe("Alicia");
		});
	});

	describe("handleDelete", () => {
		test("deletes recipient and returns SSE", async () => {
			const { id } = await createRecipient(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const res = await routes.handleDelete(id, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const deleted = await recipientRepo.getById(id);
			expect(deleted).toBeNull();
		});
	});
});
