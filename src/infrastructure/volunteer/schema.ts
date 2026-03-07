export const VOLUNTEERS_TABLE_DDL = `
	CREATE TABLE IF NOT EXISTS volunteers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		phone TEXT,
		email TEXT,
		password_hash TEXT NOT NULL,
		is_admin INTEGER NOT NULL DEFAULT 0,
		is_disabled INTEGER NOT NULL DEFAULT 0,
		requires_password_reset INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)
`;
