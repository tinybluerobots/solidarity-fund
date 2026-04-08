import { describe, expect, it } from "bun:test";
import { dbDownloadResponse } from "./download-db.ts";

describe("dbDownloadResponse", () => {
	it("returns response with correct headers", async () => {
		const tmpPath = `/tmp/test-download-${Date.now()}.db`;
		await Bun.write(tmpPath, "fake-sqlite-data");

		const response = await dbDownloadResponse(tmpPath);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/x-sqlite3");
		expect(response.headers.get("Content-Disposition")).toMatch(
			/^attachment; filename="solidarity-fund-\d{4}-\d{2}-\d{2}\.sqlite"$/,
		);

		const body = await response.text();
		expect(body).toBe("fake-sqlite-data");

		const { unlinkSync } = await import("node:fs");
		unlinkSync(tmpPath);
	});

	it("returns 500 if file does not exist", async () => {
		const response = await dbDownloadResponse("/tmp/nonexistent.db");
		expect(response.status).toBe(500);
	});
});
