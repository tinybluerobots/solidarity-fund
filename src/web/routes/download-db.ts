import { Database } from "bun:sqlite";

export function dbDownloadResponse(dbPath: string): Response {
	const db = new Database(dbPath, { readonly: true });
	try {
		const data = db.serialize();
		const date = new Date().toISOString().slice(0, 10);
		return new Response(data, {
			headers: {
				"Content-Type": "application/x-sqlite3",
				"Content-Disposition": `attachment; filename="solidarity-fund-${date}.sqlite"`,
			},
		});
	} finally {
		db.close();
	}
}
