# Grants Table & Volunteer Repository Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the narrow eligibility projection with a grants table tracking full lifecycle, add a volunteer repository, and wire everything together.

**Architecture:** Event-driven projection listens to application events + new grant events, maintains a `grants` read model in SQLite. Volunteer CRUD follows the same repository pattern as recipients. The grants projection replaces `eligibility.ts`.

**Tech Stack:** TypeScript, Bun, SQLite (via emmett-sqlite), emmett event sourcing framework.

---

### Task 1: Volunteer Domain Types

**Files:**
- Create: `src/domain/volunteer/types.ts`

**Step 1: Write the types**

```typescript
export type Volunteer = {
	id: string;
	name: string;
	email?: string;
	phone?: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateVolunteer = {
	name: string;
	email?: string;
	phone?: string;
};

export type UpdateVolunteer = {
	name?: string;
	email?: string | null;
	phone?: string | null;
};
```

**Step 2: Commit**

```bash
git add src/domain/volunteer/types.ts
git commit -m "Add Volunteer domain types"
```

---

### Task 2: Volunteer Repository Interface

**Files:**
- Create: `src/domain/volunteer/repository.ts`

**Step 1: Write the interface**

Follow the same shape as `src/domain/recipient/repository.ts`.

```typescript
import type { CreateVolunteer, UpdateVolunteer, Volunteer } from "./types.ts";

export interface VolunteerRepository {
	create(data: CreateVolunteer): Promise<Volunteer>;
	getById(id: string): Promise<Volunteer | null>;
	list(): Promise<Volunteer[]>;
	update(id: string, data: UpdateVolunteer): Promise<Volunteer>;
	delete(id: string): Promise<void>;
}
```

**Step 2: Commit**

```bash
git add src/domain/volunteer/repository.ts
git commit -m "Add VolunteerRepository interface"
```

---

### Task 3: SQLiteVolunteerRepository — Failing Tests

**Files:**
- Create: `test/integration/volunteerRepository.test.ts`

**Step 1: Write the failing tests**

Follow the same test structure as `test/integration/recipientRepository.test.ts`. Cover: create with required fields, create with all fields, getById (found + not found), list (populated + empty), update (single field, clear nullable, preserve unset, unknown id throws), delete (existing + idempotent).

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";

describe("VolunteerRepository", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: VolunteerRepository;

	beforeEach(async () => {
		pool = SQLiteConnectionPool({ fileName: ":memory:" });
		repo = await SQLiteVolunteerRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("create", () => {
		test("creates a volunteer with required fields", async () => {
			const volunteer = await repo.create({ name: "Vera" });

			expect(volunteer.id).toBeString();
			expect(volunteer.name).toBe("Vera");
			expect(volunteer.email).toBeUndefined();
			expect(volunteer.phone).toBeUndefined();
			expect(volunteer.createdAt).toBeString();
			expect(volunteer.updatedAt).toBeString();
		});

		test("creates a volunteer with all fields", async () => {
			const volunteer = await repo.create({
				name: "Vera",
				email: "vera@example.com",
				phone: "07700900099",
			});

			expect(volunteer.email).toBe("vera@example.com");
			expect(volunteer.phone).toBe("07700900099");
		});
	});

	describe("getById", () => {
		test("returns volunteer by id", async () => {
			const created = await repo.create({ name: "Vera" });
			const found = await repo.getById(created.id);

			expect(found).not.toBeNull();
			expect(found!.name).toBe("Vera");
		});

		test("returns null for unknown id", async () => {
			const found = await repo.getById("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("list", () => {
		test("returns all volunteers", async () => {
			await repo.create({ name: "Vera" });
			await repo.create({ name: "Victor" });
			const all = await repo.list();

			expect(all).toHaveLength(2);
		});

		test("returns empty array when no volunteers", async () => {
			const all = await repo.list();
			expect(all).toHaveLength(0);
		});
	});

	describe("update", () => {
		test("updates name", async () => {
			const created = await repo.create({ name: "Vera" });
			await new Promise((r) => setTimeout(r, 5));
			const updated = await repo.update(created.id, { name: "Victoria" });

			expect(updated.name).toBe("Victoria");
			expect(updated.updatedAt).not.toBe(created.updatedAt);
		});

		test("preserves optional fields when not provided in update", async () => {
			const created = await repo.create({
				name: "Vera",
				email: "vera@example.com",
			});
			const updated = await repo.update(created.id, { name: "Victoria" });

			expect(updated.email).toBe("vera@example.com");
		});

		test("clears optional fields when set to null", async () => {
			const created = await repo.create({
				name: "Vera",
				email: "vera@example.com",
				phone: "07700900099",
			});
			const updated = await repo.update(created.id, {
				email: null,
				phone: null,
			});

			expect(updated.email).toBeUndefined();
			expect(updated.phone).toBeUndefined();
		});

		test("throws for unknown id", async () => {
			await expect(
				repo.update("nonexistent", { name: "Vera" }),
			).rejects.toThrow(/not found/i);
		});
	});

	describe("delete", () => {
		test("deletes a volunteer", async () => {
			const created = await repo.create({ name: "Vera" });
			await repo.delete(created.id);
			const found = await repo.getById(created.id);

			expect(found).toBeNull();
		});

		test("is idempotent for unknown id", async () => {
			await expect(repo.delete("nonexistent")).resolves.toBeUndefined();
		});
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/integration/volunteerRepository.test.ts`
Expected: FAIL — cannot resolve `sqliteVolunteerRepository.ts`

**Step 3: Commit**

```bash
git add test/integration/volunteerRepository.test.ts
git commit -m "Add failing VolunteerRepository tests"
```

---

### Task 4: SQLiteVolunteerRepository — Implementation

**Files:**
- Create: `src/infrastructure/volunteer/sqliteVolunteerRepository.ts`

**Step 1: Write the implementation**

Follow the same pattern as `src/infrastructure/recipient/sqliteRecipientRepository.ts`. Key differences: no phone uniqueness constraint, no bank details, no payment preference.

```typescript
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type {
	CreateVolunteer,
	UpdateVolunteer,
	Volunteer,
} from "../../domain/volunteer/types.ts";

type VolunteerRow = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	created_at: string;
	updated_at: string;
};

function rowToVolunteer(row: VolunteerRow): Volunteer {
	return {
		id: row.id,
		name: row.name,
		email: row.email ?? undefined,
		phone: row.phone ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function SQLiteVolunteerRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<VolunteerRepository> {
	await pool.withConnection(async (conn) => {
		await conn.command(`
			CREATE TABLE IF NOT EXISTS volunteers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT,
				phone TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	});

	return {
		async create(data: CreateVolunteer): Promise<Volunteer> {
			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			await pool.withConnection(async (conn) => {
				await conn.command(
					`INSERT INTO volunteers (id, name, email, phone, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[id, data.name, data.email ?? null, data.phone ?? null, now, now],
				);
			});
			return {
				id,
				name: data.name,
				email: data.email,
				phone: data.phone,
				createdAt: now,
				updatedAt: now,
			};
		},

		async getById(id: string): Promise<Volunteer | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<VolunteerRow>(
					"SELECT * FROM volunteers WHERE id = ?",
					[id],
				);
				return rows.length > 0 ? rowToVolunteer(rows[0]!) : null;
			});
		},

		async list(): Promise<Volunteer[]> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<VolunteerRow>(
					"SELECT * FROM volunteers ORDER BY created_at DESC",
				);
				return rows.map(rowToVolunteer);
			});
		},

		async update(id: string, data: UpdateVolunteer): Promise<Volunteer> {
			const existing = await this.getById(id);
			if (!existing) throw new Error(`Volunteer not found: ${id}`);

			const now = new Date().toISOString();
			const merged: Volunteer = {
				id,
				name: data.name ?? existing.name,
				email: data.email === null ? undefined : (data.email ?? existing.email),
				phone: data.phone === null ? undefined : (data.phone ?? existing.phone),
				createdAt: existing.createdAt,
				updatedAt: now,
			};

			await pool.withConnection(async (conn) => {
				await conn.command(
					`UPDATE volunteers SET name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?`,
					[merged.name, merged.email ?? null, merged.phone ?? null, now, id],
				);
			});
			return merged;
		},

		async delete(id: string): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command("DELETE FROM volunteers WHERE id = ?", [id]);
			});
		},
	};
}
```

**Step 2: Run tests to verify they pass**

Run: `bun test test/integration/volunteerRepository.test.ts`
Expected: All pass

**Step 3: Commit**

```bash
git add src/infrastructure/volunteer/sqliteVolunteerRepository.ts
git commit -m "Add SQLiteVolunteerRepository implementation"
```

---

### Task 5: Grant Domain Types (New Events)

**Files:**
- Create: `src/domain/grant/types.ts`

**Step 1: Write the grant event types**

```typescript
import type { Event } from "@event-driven-io/emmett";

export type GrantStatus =
	| "applied"
	| "accepted"
	| "rejected"
	| "paid"
	| "payment_failed";

export type GrantVolunteerAssigned = Event<
	"GrantVolunteerAssigned",
	{
		grantId: string;
		recipientId: string;
		volunteerId: string;
		assignedAt: string;
	}
>;

export type GrantPaid = Event<
	"GrantPaid",
	{
		grantId: string;
		recipientId: string;
		monthCycle: string;
		paidAt: string;
	}
>;

export type GrantPaymentFailed = Event<
	"GrantPaymentFailed",
	{
		grantId: string;
		recipientId: string;
		monthCycle: string;
		reason: string;
		failedAt: string;
	}
>;

export type GrantEvent =
	| GrantVolunteerAssigned
	| GrantPaid
	| GrantPaymentFailed;

export type GrantEventType = GrantEvent["type"];
```

**Step 2: Commit**

```bash
git add src/domain/grant/types.ts
git commit -m "Add grant domain event types"
```

---

### Task 6: Grants Projection — Failing Tests

**Files:**
- Create: `test/integration/grantsProjection.test.ts`

**Step 1: Write the failing tests**

The grants projection is an inline event store projection. Test it by writing events to the event store and querying the `grants` table directly. The projection needs to handle events from both the application domain (`ApplicationSubmitted`, `ApplicationAccepted`, `ApplicationRejected`) and the grant domain (`GrantVolunteerAssigned`, `GrantPaid`, `GrantPaymentFailed`).

Note: `ApplicationSubmitted` contains `applicantId` (phone-derived), not `recipientId`. The projection needs to map from `applicantId` to `recipientId`. Since the projection runs inline with the event store and shares the same SQLite connection pool, it can query the `recipients` table. Use the recipient lookup by checking `recipients` for matching applicant-derived IDs, or store `recipientId` directly.

**Important design consideration:** The `ApplicationSubmitted` event only has `applicantId` (derived from phone). The projection needs `recipient_id` for the grants table FK. Two options:
- (a) Look up the recipient by phone in the projection handler (requires joining data)
- (b) Use `applicantId` as the `recipient_id` in the grants table (simpler but not a true FK to `recipients.id`)

Since the design doc says `recipient_id` is an FK to `recipients`, and identity resolution already knows the recipient, the cleanest approach is to use `applicantId` as the lookup key. The existing events use `applicantId` which is `applicant-{phone}`. The recipient's `id` is a UUID. These don't match.

**Resolution:** The projection should query `recipients` by phone (extracted from `applicantId`) to get the `recipient.id`. Or we accept that `applicantId` is the FK for now. Given the design says FK to recipients, we should look up by phone. But the projection only has access to the connection within the event store transaction, not the pool.

**Pragmatic approach:** Use `applicantId` as the `recipient_id` column value for now. This is the stable identifier derived from the phone. The `recipients` table uses UUIDs. A future migration can reconcile these. The UNIQUE constraint still works: one grant per applicant per month.

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

type GrantRow = {
	id: string;
	recipient_id: string;
	application_id: string;
	month_cycle: string;
	status: string;
	volunteer_id: string | null;
	reject_reason: string | null;
	payment_fail_reason: string | null;
	applied_at: string | null;
	accepted_at: string | null;
	rejected_at: string | null;
	paid_at: string | null;
};

describe("grantsProjection", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
	});

	afterEach(async () => {
		await pool.close();
	});

	async function queryGrants(): Promise<GrantRow[]> {
		return pool.withConnection(async (conn) => {
			return conn.query<GrantRow>("SELECT * FROM grants");
		});
	}

	test("ApplicationSubmitted creates grant with status applied", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);

		const grants = await queryGrants();
		expect(grants).toHaveLength(1);
		expect(grants[0]!.id).toBe("app-1");
		expect(grants[0]!.recipient_id).toBe("applicant-07700900001");
		expect(grants[0]!.status).toBe("applied");
		expect(grants[0]!.applied_at).toBe("2026-03-01T00:00:00.000Z");
	});

	test("ApplicationAccepted updates grant to accepted", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		const grants = await queryGrants();
		expect(grants).toHaveLength(1);
		expect(grants[0]!.status).toBe("accepted");
		expect(grants[0]!.accepted_at).toBe("2026-03-01T00:00:01.000Z");
	});

	test("ApplicationRejected updates grant to rejected with reason", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationRejected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					reason: "cooldown",
					detail: "Last grant in 2026-01",
					monthCycle: "2026-03",
					rejectedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		const grants = await queryGrants();
		expect(grants).toHaveLength(1);
		expect(grants[0]!.status).toBe("rejected");
		expect(grants[0]!.reject_reason).toBe("cooldown");
		expect(grants[0]!.rejected_at).toBe("2026-03-01T00:00:01.000Z");
	});

	test("GrantPaid updates grant to paid", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		await eventStore.appendToStream("grant-applicant-07700900001", [
			{
				type: "GrantPaid",
				data: {
					grantId: "app-1",
					recipientId: "applicant-07700900001",
					monthCycle: "2026-03",
					paidAt: "2026-03-15T00:00:00.000Z",
				},
			},
		]);

		const grants = await queryGrants();
		expect(grants).toHaveLength(1);
		expect(grants[0]!.status).toBe("paid");
		expect(grants[0]!.paid_at).toBe("2026-03-15T00:00:00.000Z");
	});

	test("GrantPaymentFailed updates grant to payment_failed", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		await eventStore.appendToStream("grant-applicant-07700900001", [
			{
				type: "GrantPaymentFailed",
				data: {
					grantId: "app-1",
					recipientId: "applicant-07700900001",
					monthCycle: "2026-03",
					reason: "Invalid bank details",
					failedAt: "2026-03-15T00:00:00.000Z",
				},
			},
		]);

		const grants = await queryGrants();
		expect(grants).toHaveLength(1);
		expect(grants[0]!.status).toBe("payment_failed");
		expect(grants[0]!.payment_fail_reason).toBe("Invalid bank details");
	});

	test("GrantVolunteerAssigned sets volunteer_id", async () => {
		await eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T00:00:00.000Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T00:00:01.000Z",
				},
			},
		]);

		await eventStore.appendToStream("grant-applicant-07700900001", [
			{
				type: "GrantVolunteerAssigned",
				data: {
					grantId: "app-1",
					recipientId: "applicant-07700900001",
					volunteerId: "vol-1",
					assignedAt: "2026-03-02T00:00:00.000Z",
				},
			},
		]);

		const grants = await queryGrants();
		expect(grants).toHaveLength(1);
		expect(grants[0]!.volunteer_id).toBe("vol-1");
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test test/integration/grantsProjection.test.ts`
Expected: FAIL — projection doesn't exist yet, table doesn't exist

**Step 3: Commit**

```bash
git add test/integration/grantsProjection.test.ts
git commit -m "Add failing grants projection tests"
```

---

### Task 7: Grants Projection — Implementation

**Files:**
- Create: `src/infrastructure/projections/grants.ts`
- Modify: `src/infrastructure/eventStore.ts`
- Delete: `src/infrastructure/projections/eligibility.ts`

**Step 1: Write the grants projection**

The projection needs to handle both `ApplicationEvent` types and `GrantEvent` types. Use a union type for `canHandle`. Reference the existing `eligibility.ts` for the emmett `sqliteProjection` pattern.

```typescript
import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { ApplicationEvent } from "../../domain/application/types.ts";
import type { GrantEvent } from "../../domain/grant/types.ts";

type ProjectionEvent = ApplicationEvent | GrantEvent;

export const grantsProjection = sqliteProjection<ProjectionEvent>({
	canHandle: [
		"ApplicationSubmitted",
		"ApplicationAccepted",
		"ApplicationRejected",
		"GrantVolunteerAssigned",
		"GrantPaid",
		"GrantPaymentFailed",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS grants (
				id TEXT PRIMARY KEY,
				recipient_id TEXT NOT NULL,
				application_id TEXT NOT NULL,
				month_cycle TEXT NOT NULL,
				status TEXT NOT NULL,
				volunteer_id TEXT,
				reject_reason TEXT,
				payment_fail_reason TEXT,
				applied_at TEXT,
				accepted_at TEXT,
				rejected_at TEXT,
				paid_at TEXT,
				UNIQUE(recipient_id, month_cycle)
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationSubmitted":
					await connection.command(
						`INSERT OR IGNORE INTO grants (id, recipient_id, application_id, month_cycle, status, applied_at)
						 VALUES (?, ?, ?, ?, 'applied', ?)`,
						[
							data.applicationId,
							data.applicantId,
							data.applicationId,
							data.monthCycle,
							data.submittedAt,
						],
					);
					break;
				case "ApplicationAccepted":
					await connection.command(
						`UPDATE grants SET status = 'accepted', accepted_at = ? WHERE id = ?`,
						[data.acceptedAt, data.applicationId],
					);
					break;
				case "ApplicationRejected":
					await connection.command(
						`UPDATE grants SET status = 'rejected', reject_reason = ?, rejected_at = ? WHERE id = ?`,
						[data.reason, data.rejectedAt, data.applicationId],
					);
					break;
				case "GrantVolunteerAssigned":
					await connection.command(
						`UPDATE grants SET volunteer_id = ? WHERE id = ?`,
						[data.volunteerId, data.grantId],
					);
					break;
				case "GrantPaid":
					await connection.command(
						`UPDATE grants SET status = 'paid', paid_at = ? WHERE id = ?`,
						[data.paidAt, data.grantId],
					);
					break;
				case "GrantPaymentFailed":
					await connection.command(
						`UPDATE grants SET status = 'payment_failed', payment_fail_reason = ? WHERE id = ?`,
						[data.reason, data.grantId],
					);
					break;
			}
		}
	},
});
```

**Step 2: Update eventStore.ts — swap projection**

In `src/infrastructure/eventStore.ts`:
- Change import from `eligibilityProjection` to `grantsProjection`
- Replace in the `projections` array

```typescript
import { inlineProjections } from "@event-driven-io/emmett";
import {
	getSQLiteEventStore,
	SQLiteConnectionPool,
	type SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { grantsProjection } from "./projections/grants.ts";

export type EventStoreWithPool = {
	store: SQLiteEventStore;
	pool: ReturnType<typeof SQLiteConnectionPool>;
};

export function createEventStore(fileName: string): EventStoreWithPool {
	const pool = SQLiteConnectionPool({ fileName });
	const store = getSQLiteEventStore({
		fileName: undefined,
		pool,
		schema: { autoMigration: "CreateOrUpdate" },
		projections: inlineProjections([grantsProjection]),
	});
	return { store, pool };
}
```

**Step 3: Delete `src/infrastructure/projections/eligibility.ts`**

```bash
rm src/infrastructure/projections/eligibility.ts
```

**Step 4: Run all tests**

Run: `bun test`
Expected: All tests pass (grants projection tests + existing submitApplication tests)

**Step 5: Commit**

```bash
git add src/infrastructure/projections/grants.ts src/infrastructure/eventStore.ts
git rm src/infrastructure/projections/eligibility.ts
git commit -m "Replace eligibility projection with grants projection"
```

---

### Task 8: Run Full Test Suite & Lint

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Lint and format**

Run: `bunx biome check --write`

**Step 3: Fix any issues and commit if needed**

---

### Task 9: Code Review

Dispatch a `typescript-pro` agent to review all changed files for type safety, unsound casts, and idiomatic TypeScript patterns.
