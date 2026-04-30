import type { SQLiteConnection } from "@event-driven-io/emmett-sqlite";

export const OUTBOX_MESSAGES_TABLE_DDL = `
	CREATE TABLE IF NOT EXISTS outbox_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_stream TEXT NOT NULL,
		event_position INTEGER NOT NULL,
		event_type TEXT NOT NULL,
		channel TEXT NOT NULL,
		recipient TEXT NOT NULL,
		body TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		created_at TEXT NOT NULL,
		sent_at TEXT,
		error TEXT,
		message_id TEXT,
		UNIQUE(event_stream, event_position, channel)
	)
`;

export async function initOutboxSchema(conn: SQLiteConnection): Promise<void> {
	await conn.command(OUTBOX_MESSAGES_TABLE_DDL);
}
