import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createOutboxStore } from "../../src/infrastructure/outbox/store";
import type { OutboxMessageInput } from "../../src/infrastructure/outbox/types";

function makeMsg(
	overrides: Partial<OutboxMessageInput> = {},
): OutboxMessageInput {
	return {
		eventStream: "application-abc",
		eventPosition: 1n,
		eventType: "ApplicationAccepted",
		channel: "sms",
		recipient: "+447777777777",
		body: "test message",
		createdAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("OutboxStore", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let store: ReturnType<typeof createOutboxStore>;

	beforeEach(async () => {
		pool = SQLiteConnectionPool({ fileName: ":memory:" });
		store = createOutboxStore(pool);
		await store.init();
	});

	afterEach(async () => {
		await pool.close();
	});

	test("records a message", async () => {
		const recorded = await pool.withConnection(async (conn) => {
			return store.recordMessage(conn, makeMsg());
		});

		expect(recorded).toBe(true);

		const pending = await pool.withConnection(async (conn) => {
			return store.getPendingMessages(conn, 10);
		});

		expect(pending).toHaveLength(1);
		expect(pending[0].eventStream).toBe("application-abc");
		expect(pending[0].status).toBe("pending");
	});

	test("deduplication via INSERT OR IGNORE", async () => {
		const msg = makeMsg();

		const first = await pool.withConnection(async (conn) => {
			return store.recordMessage(conn, msg);
		});
		expect(first).toBe(true);

		const second = await pool.withConnection(async (conn) => {
			return store.recordMessage(conn, msg);
		});
		expect(second).toBe(false);

		const pending = await pool.withConnection(async (conn) => {
			return store.getPendingMessages(conn, 10);
		});
		expect(pending).toHaveLength(1);
	});

	test("getPendingMessages respects limit", async () => {
		for (let i = 1; i <= 5; i++) {
			await pool.withConnection(async (conn) => {
				await store.recordMessage(conn, makeMsg({ eventPosition: BigInt(i) }));
			});
		}

		const pending = await pool.withConnection(async (conn) => {
			return store.getPendingMessages(conn, 2);
		});

		expect(pending).toHaveLength(2);
	});

	test("markSending transitions from pending", async () => {
		const id = await pool.withConnection(async (conn) => {
			await store.recordMessage(conn, makeMsg());
			const pending = await store.getPendingMessages(conn, 1);
			return pending[0].id;
		});

		const marked = await pool.withConnection(async (conn) => {
			return store.markSending(conn, id);
		});
		expect(marked).toBe(true);

		const pending = await pool.withConnection(async (conn) => {
			return store.getPendingMessages(conn, 10);
		});
		expect(pending).toHaveLength(0);
	});

	test("markSending is idempotent against non-pending", async () => {
		const id = await pool.withConnection(async (conn) => {
			await store.recordMessage(conn, makeMsg());
			const pending = await store.getPendingMessages(conn, 1);
			await store.markSending(conn, pending[0].id);
			return pending[0].id;
		});

		const marked = await pool.withConnection(async (conn) => {
			return store.markSending(conn, id);
		});
		expect(marked).toBe(false);
	});

	test("markSent sets status and sent_at and messageId", async () => {
		const id = await pool.withConnection(async (conn) => {
			await store.recordMessage(conn, makeMsg());
			const pending = await store.getPendingMessages(conn, 1);
			await store.markSending(conn, pending[0].id);
			return pending[0].id;
		});

		await pool.withConnection(async (conn) => {
			await store.markSent(conn, id, "ext-123");
		});

		const row = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{
				status: string;
				message_id: string | null;
				sent_at: string | null;
			}>(
				"SELECT status, message_id, sent_at FROM outbox_messages WHERE id = ?",
				[id],
			);
			return rows[0];
		});

		expect(row.status).toBe("sent");
		expect(row.message_id).toBe("ext-123");
		expect(row.sent_at).not.toBeNull();
	});

	test("markFailed sets status and error", async () => {
		const id = await pool.withConnection(async (conn) => {
			await store.recordMessage(conn, makeMsg());
			const pending = await store.getPendingMessages(conn, 1);
			await store.markSending(conn, pending[0].id);
			return pending[0].id;
		});

		await pool.withConnection(async (conn) => {
			await store.markFailed(conn, id, "network timeout");
		});

		const row = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{
				status: string;
				error: string | null;
			}>("SELECT status, error FROM outbox_messages WHERE id = ?", [id]);
			return rows[0];
		});

		expect(row.status).toBe("failed");
		expect(row.error).toBe("network timeout");
	});

	test("messages are ordered by created_at", async () => {
		await pool.withConnection(async (conn) => {
			await store.recordMessage(
				conn,
				makeMsg({ eventPosition: 1n, createdAt: "2025-01-02T00:00:00Z" }),
			);
			await store.recordMessage(
				conn,
				makeMsg({ eventPosition: 2n, createdAt: "2025-01-01T00:00:00Z" }),
			);
		});

		const pending = await pool.withConnection(async (conn) => {
			return store.getPendingMessages(conn, 10);
		});

		expect(pending).toHaveLength(2);
		expect(pending[0].eventPosition).toBe(2n);
		expect(pending[1].eventPosition).toBe(1n);
	});
});
