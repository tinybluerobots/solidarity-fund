# Database Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admin volunteers to download a full copy of the SQLite database file as a backup.

**Architecture:** Add a `GET /download-db` route to server.ts. Pass `dbPath` through to `startServer`. Use `pool.withConnection` to run a WAL checkpoint, then serve the file via `Bun.file()`. Admin-only auth check follows existing pattern.

**Tech Stack:** Bun, SQLite WAL checkpoint, existing auth system

---

### Task 1: Pass dbPath into startServer

**Files:**
- Modify: `src/web/index.ts:37` (add dbPath arg)
- Modify: `src/web/server.ts:111` (accept dbPath param)

- [ ] **Step 1: Add dbPath parameter to startServer signature**

In `src/web/server.ts`, add `dbPath: string` as the last parameter before `port`:

```typescript
export async function startServer(
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
	applicantRepo: ApplicantRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	dbPath: string,
	port = 3000,
) {
```

- [ ] **Step 2: Pass dbPath from index.ts**

In `src/web/index.ts`, change the `startServer` call to include `dbPath`:

```typescript
const server = await startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
	dbPath,
	port,
);
```

- [ ] **Step 3: Verify the app still starts**

Run: `bun run src/web/index.ts`
Expected: Server starts without errors. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add src/web/index.ts src/web/server.ts
git commit -m "refactor: pass dbPath into startServer for download route"
```

---

### Task 2: Add GET /download-db admin route

**Files:**
- Modify: `src/web/server.ts:266-273` (add route alongside `/logs`)

- [ ] **Step 1: Write the failing test**

Create `src/web/routes/download-db.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { dbDownloadResponse } from "./download-db.ts";

describe("dbDownloadResponse", () => {
	it("returns response with correct headers", async () => {
		// Create a temp SQLite file
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

		// Cleanup
		const { unlinkSync } = await import("node:fs");
		unlinkSync(tmpPath);
	});

	it("returns 500 if file does not exist", async () => {
		const response = await dbDownloadResponse("/tmp/nonexistent.db");
		expect(response.status).toBe(500);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/web/routes/download-db.test.ts`
Expected: FAIL — module `./download-db.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `src/web/routes/download-db.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/web/routes/download-db.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into server.ts**

Add import at top of `src/web/server.ts`:

```typescript
import { dbDownloadResponse } from "./routes/download-db.ts";
```

Add the route in the `routes` object, after the `/logs` route:

```typescript
"/download-db": {
	GET: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		if (!volunteer.isAdmin)
			return new Response("Forbidden", { status: 403 });
		return dbDownloadResponse(dbPath);
	},
},
```

- [ ] **Step 6: Verify the app starts and route is accessible**

Run: `bun run src/web/index.ts`
Expected: Server starts. Ctrl+C to stop.

- [ ] **Step 7: Run all tests**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 8: Lint and format**

Run: `bunx biome check --write`

- [ ] **Step 9: Commit**

```bash
git add src/web/routes/download-db.ts src/web/routes/download-db.test.ts src/web/server.ts
git commit -m "feat: add admin-only database download route"
```
