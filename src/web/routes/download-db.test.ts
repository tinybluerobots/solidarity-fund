import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { dbDownloadResponse } from "./download-db.ts";

const testDbPath = `/tmp/test-download-${Date.now()}.db`;
const db = new Database(testDbPath);
db.run("CREATE TABLE test (id INTEGER)");
db.run("INSERT INTO test VALUES (1)");
db.close();

afterAll(async () => {
	await Bun.$`rm -f ${testDbPath}`;
});

describe("dbDownloadResponse", () => {
	it("returns response with correct headers and valid sqlite data", () => {
		const response = dbDownloadResponse(testDbPath);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/x-sqlite3");
		expect(response.headers.get("Content-Disposition")).toMatch(
			/^attachment; filename="solidarity-fund-\d{4}-\d{2}-\d{2}\.sqlite"$/,
		);
	});

	it("returns a valid sqlite file", async () => {
		const response = dbDownloadResponse(testDbPath);
		const body = await response.arrayBuffer();
		const header = new TextDecoder().decode(new Uint8Array(body).slice(0, 15));
		expect(header).toBe("SQLite format 3");
	});

	it("throws if file does not exist", () => {
		expect(() => dbDownloadResponse("/tmp/nonexistent.db")).toThrow();
	});
});
