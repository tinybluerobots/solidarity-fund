export async function dbDownloadResponse(dbPath: string): Promise<Response> {
	const file = Bun.file(dbPath);
	if (!(await file.exists())) {
		return new Response("Database file not found", { status: 500 });
	}

	const date = new Date().toISOString().slice(0, 10);
	return new Response(file, {
		headers: {
			"Content-Type": "application/x-sqlite3",
			"Content-Disposition": `attachment; filename="solidarity-fund-${date}.sqlite"`,
		},
	});
}
