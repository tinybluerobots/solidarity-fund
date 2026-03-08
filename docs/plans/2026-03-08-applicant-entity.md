# Applicant Entity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename Recipient → Applicant. Create/match Applicant on apply. Identity on Applicant, per-application choices on Application.

**Architecture:** Event-sourced Applicant aggregate with deterministic composite key (`applicant-${normalizedPhone}-${normalizedName}`). Applicant holds identity (phone, name, email). Application holds per-submission choices (paymentPreference, meetingPlace, bankDetails). Identity resolution queries Applicant instead of Recipient.

**Tech Stack:** Bun, emmett (event sourcing), SQLite, Datastar (SSE-based UI)

---

### Task 1: Create Applicant domain types

**Files:**
- Create: `src/domain/applicant/types.ts`

**Step 1: Write the failing test**

Create `test/unit/applicantDecider.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ApplicantCommand } from "../../src/domain/applicant/types.ts";

describe("Applicant types", () => {
	test("CreateApplicant command has required fields", () => {
		const cmd: ApplicantCommand = {
			type: "CreateApplicant",
			data: {
				id: "applicant-07700900001-alice",
				phone: "07700900001",
				name: "Alice",
				createdAt: "2026-03-01T00:00:00Z",
			},
		};
		expect(cmd.type).toBe("CreateApplicant");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applicantDecider.test.ts`
Expected: FAIL — module not found

**Step 3: Write the types**

Create `src/domain/applicant/types.ts`:

```ts
import type { Command, Event } from "@event-driven-io/emmett";

export type Applicant = {
	id: string;
	phone: string;
	name: string;
	email?: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateApplicant = {
	phone: string;
	name: string;
	email?: string;
};

export type UpdateApplicant = {
	phone?: string;
	name?: string;
	email?: string | null;
};

// Commands

export type CreateApplicantCommand = Command<
	"CreateApplicant",
	{
		id: string;
		volunteerId?: string;
		applicationId?: string;
		phone: string;
		name: string;
		email?: string;
		createdAt: string;
	}
>;

export type UpdateApplicantCommand = Command<
	"UpdateApplicant",
	{
		id: string;
		volunteerId: string;
		phone: string;
		name: string;
		email?: string;
		updatedAt: string;
	}
>;

export type DeleteApplicantCommand = Command<
	"DeleteApplicant",
	{
		id: string;
		volunteerId: string;
		deletedAt: string;
	}
>;

export type ApplicantCommand =
	| CreateApplicantCommand
	| UpdateApplicantCommand
	| DeleteApplicantCommand;

// Events

export type ApplicantCreated = Event<
	"ApplicantCreated",
	{
		id: string;
		volunteerId?: string;
		applicationId?: string;
		phone: string;
		name: string;
		email?: string;
		createdAt: string;
	}
>;

export type ApplicantUpdated = Event<
	"ApplicantUpdated",
	{
		id: string;
		volunteerId: string;
		phone: string;
		name: string;
		email?: string;
		updatedAt: string;
	}
>;

export type ApplicantDeleted = Event<
	"ApplicantDeleted",
	{
		id: string;
		volunteerId: string;
		deletedAt: string;
	}
>;

export type ApplicantEvent =
	| ApplicantCreated
	| ApplicantUpdated
	| ApplicantDeleted;

export type ApplicantEventType = ApplicantEvent["type"];

// State

export type ApplicantState =
	| { status: "initial" }
	| {
			status: "active";
			id: string;
			phone: string;
			name: string;
			email?: string;
			createdAt: string;
			updatedAt: string;
	  }
	| { status: "deleted" };
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/applicantDecider.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add src/domain/applicant/types.ts test/unit/applicantDecider.test.ts
git commit -m "feat: add Applicant domain types"
```

---

### Task 2: Create Applicant decider

**Files:**
- Create: `src/domain/applicant/decider.ts`
- Modify: `test/unit/applicantDecider.test.ts`

**Step 1: Add failing tests to `test/unit/applicantDecider.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "../../src/domain/applicant/decider.ts";
import type { ApplicantCommand, ApplicantState } from "../../src/domain/applicant/types.ts";

describe("Applicant decider", () => {
	describe("decide", () => {
		test("creates applicant from initial state", () => {
			const events = decide(
				{
					type: "CreateApplicant",
					data: {
						id: "applicant-07700900001-alice",
						phone: "07700900001",
						name: "Alice",
						createdAt: "2026-03-01T00:00:00Z",
					},
				},
				initialState(),
			);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("ApplicantCreated");
			expect(events[0].data.phone).toBe("07700900001");
		});

		test("rejects create when already exists", () => {
			const active: ApplicantState = {
				status: "active",
				id: "applicant-07700900001-alice",
				phone: "07700900001",
				name: "Alice",
				createdAt: "2026-03-01T00:00:00Z",
				updatedAt: "2026-03-01T00:00:00Z",
			};
			expect(() =>
				decide(
					{
						type: "CreateApplicant",
						data: {
							id: "applicant-07700900001-alice",
							phone: "07700900001",
							name: "Alice",
							createdAt: "2026-03-01T00:00:00Z",
						},
					},
					active,
				),
			).toThrow(IllegalStateError);
		});

		test("updates active applicant", () => {
			const active: ApplicantState = {
				status: "active",
				id: "applicant-07700900001-alice",
				phone: "07700900001",
				name: "Alice",
				createdAt: "2026-03-01T00:00:00Z",
				updatedAt: "2026-03-01T00:00:00Z",
			};
			const events = decide(
				{
					type: "UpdateApplicant",
					data: {
						id: "applicant-07700900001-alice",
						volunteerId: "v-1",
						phone: "07700900001",
						name: "Alicia",
						updatedAt: "2026-03-02T00:00:00Z",
					},
				},
				active,
			);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("ApplicantUpdated");
		});

		test("rejects update on initial state", () => {
			expect(() =>
				decide(
					{
						type: "UpdateApplicant",
						data: {
							id: "x",
							volunteerId: "v-1",
							phone: "07700900001",
							name: "Alice",
							updatedAt: "2026-03-01T00:00:00Z",
						},
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});

		test("deletes active applicant", () => {
			const active: ApplicantState = {
				status: "active",
				id: "applicant-07700900001-alice",
				phone: "07700900001",
				name: "Alice",
				createdAt: "2026-03-01T00:00:00Z",
				updatedAt: "2026-03-01T00:00:00Z",
			};
			const events = decide(
				{
					type: "DeleteApplicant",
					data: {
						id: "applicant-07700900001-alice",
						volunteerId: "v-1",
						deletedAt: "2026-03-02T00:00:00Z",
					},
				},
				active,
			);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe("ApplicantDeleted");
		});
	});

	describe("evolve", () => {
		test("ApplicantCreated transitions to active", () => {
			const state = evolve(initialState(), {
				type: "ApplicantCreated",
				data: {
					id: "applicant-07700900001-alice",
					phone: "07700900001",
					name: "Alice",
					createdAt: "2026-03-01T00:00:00Z",
				},
			});
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.phone).toBe("07700900001");
				expect(state.name).toBe("Alice");
			}
		});

		test("ApplicantUpdated changes fields", () => {
			const active: ApplicantState = {
				status: "active",
				id: "applicant-07700900001-alice",
				phone: "07700900001",
				name: "Alice",
				createdAt: "2026-03-01T00:00:00Z",
				updatedAt: "2026-03-01T00:00:00Z",
			};
			const state = evolve(active, {
				type: "ApplicantUpdated",
				data: {
					id: "applicant-07700900001-alice",
					volunteerId: "v-1",
					phone: "07700900001",
					name: "Alicia",
					updatedAt: "2026-03-02T00:00:00Z",
				},
			});
			if (state.status === "active") {
				expect(state.name).toBe("Alicia");
				expect(state.createdAt).toBe("2026-03-01T00:00:00Z");
			}
		});

		test("ApplicantDeleted transitions to deleted", () => {
			const active: ApplicantState = {
				status: "active",
				id: "applicant-07700900001-alice",
				phone: "07700900001",
				name: "Alice",
				createdAt: "2026-03-01T00:00:00Z",
				updatedAt: "2026-03-01T00:00:00Z",
			};
			const state = evolve(active, {
				type: "ApplicantDeleted",
				data: {
					id: "applicant-07700900001-alice",
					volunteerId: "v-1",
					deletedAt: "2026-03-02T00:00:00Z",
				},
			});
			expect(state.status).toBe("deleted");
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applicantDecider.test.ts`
Expected: FAIL — cannot find decider module

**Step 3: Implement decider**

Create `src/domain/applicant/decider.ts`:

```ts
import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	ApplicantCommand,
	ApplicantEvent,
	ApplicantState,
} from "./types.ts";

export const initialState = (): ApplicantState => ({ status: "initial" });

export function decide(
	command: ApplicantCommand,
	state: ApplicantState,
): ApplicantEvent[] {
	switch (command.type) {
		case "CreateApplicant": {
			if (state.status !== "initial") {
				throw new IllegalStateError("Applicant already exists");
			}
			return [{ type: "ApplicantCreated", data: command.data }];
		}
		case "UpdateApplicant": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot update applicant in ${state.status} state`,
				);
			}
			return [{ type: "ApplicantUpdated", data: command.data }];
		}
		case "DeleteApplicant": {
			if (state.status !== "active") {
				throw new IllegalStateError(
					`Cannot delete applicant in ${state.status} state`,
				);
			}
			return [{ type: "ApplicantDeleted", data: command.data }];
		}
	}
}

export function evolve(
	state: ApplicantState,
	event: ApplicantEvent,
): ApplicantState {
	switch (event.type) {
		case "ApplicantCreated":
			return {
				status: "active",
				id: event.data.id,
				phone: event.data.phone,
				name: event.data.name,
				email: event.data.email,
				createdAt: event.data.createdAt,
				updatedAt: event.data.createdAt,
			};
		case "ApplicantUpdated":
			if (state.status !== "active") return state;
			return {
				status: "active",
				id: event.data.id,
				phone: event.data.phone,
				name: event.data.name,
				email: event.data.email,
				createdAt: state.createdAt,
				updatedAt: event.data.updatedAt,
			};
		case "ApplicantDeleted":
			return { status: "deleted" };
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/applicantDecider.test.ts`
Expected: PASS

**Step 5: Commit**

```
git add src/domain/applicant/decider.ts test/unit/applicantDecider.test.ts
git commit -m "feat: add Applicant decider"
```

---

### Task 3: Create Applicant repository, command handlers, and applicantId generator

**Files:**
- Create: `src/domain/applicant/repository.ts`
- Create: `src/domain/applicant/commandHandlers.ts`
- Modify: `src/domain/application/applicantId.ts` — update to use phone+name composite key

**Step 1: Write the failing test**

Create `test/integration/applicantRepository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	createApplicant,
	deleteApplicant,
	updateApplicant,
} from "../../src/domain/applicant/commandHandlers.ts";
import type { ApplicantRepository } from "../../src/domain/applicant/repository.ts";
import type { ApplicantEvent } from "../../src/domain/applicant/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteApplicantRepository } from "../../src/infrastructure/applicant/sqliteApplicantRepository.ts";

describe("Applicant (event-sourced)", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: ApplicantRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		repo = await SQLiteApplicantRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("create", () => {
		test("creates an applicant with required fields", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const found = await repo.getById(id);
			expect(found).not.toBeNull();
			expect(found!.phone).toBe("07700900001");
			expect(found!.name).toBe("Alice");
		});

		test("creates an applicant with email", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice", email: "alice@example.com" },
				eventStore,
			);
			const found = await repo.getById(id);
			expect(found!.email).toBe("alice@example.com");
		});

		test("rejects duplicate phone+name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			let threw = false;
			try {
				await createApplicant(
					{ phone: "07700900001", name: "Alice" },
					eventStore,
				);
			} catch {
				threw = true;
			}
			expect(threw).toBe(true);
		});

		test("allows same phone with different name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Bob" },
				eventStore,
			);
			const found = await repo.getById(id);
			expect(found!.name).toBe("Bob");
		});
	});

	describe("getById", () => {
		test("returns null for unknown id", async () => {
			const found = await repo.getById("nonexistent");
			expect(found).toBeNull();
		});
	});

	describe("getByPhone", () => {
		test("returns all applicants with matching phone", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await createApplicant(
				{ phone: "07700900001", name: "Bob" },
				eventStore,
			);
			const found = await repo.getByPhone("07700900001");
			expect(found).toHaveLength(2);
		});

		test("returns empty for unknown phone", async () => {
			const found = await repo.getByPhone("00000000000");
			expect(found).toHaveLength(0);
		});
	});

	describe("getByPhoneAndName", () => {
		test("returns exact match", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const found = await repo.getByPhoneAndName("07700900001", "Alice");
			expect(found).not.toBeNull();
			expect(found!.name).toBe("Alice");
		});

		test("returns null for phone match with different name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const found = await repo.getByPhoneAndName("07700900001", "Bob");
			expect(found).toBeNull();
		});
	});

	describe("list", () => {
		test("returns all applicants", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await createApplicant(
				{ phone: "07700900002", name: "Bob" },
				eventStore,
			);
			const all = await repo.list();
			expect(all).toHaveLength(2);
		});
	});

	describe("update", () => {
		test("updates email", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await updateApplicant(
				id,
				"v-1",
				{ email: "alice@example.com" },
				eventStore,
			);
			const found = await repo.getById(id);
			expect(found!.email).toBe("alice@example.com");
		});
	});

	describe("delete", () => {
		test("deletes an applicant", async () => {
			const { id } = await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				eventStore,
			);
			await deleteApplicant(id, "v-1", eventStore);
			const found = await repo.getById(id);
			expect(found).toBeNull();
		});
	});

	describe("audit trail", () => {
		test("create stores volunteerId in event", async () => {
			const { id } = await createApplicant(
				{ volunteerId: "v-1", phone: "07700900001", name: "Alice" },
				eventStore,
			);
			const { events } = await eventStore.readStream<ApplicantEvent>(
				`applicant-${id}`,
			);
			const created = events.find((e) => e.type === "ApplicantCreated");
			expect(created!.data.volunteerId).toBe("v-1");
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/applicantRepository.test.ts`
Expected: FAIL — modules not found

**Step 3: Update applicantId generator**

Modify `src/domain/application/applicantId.ts`:

```ts
import { normalizeName } from "./normalizeName.ts";

export function toApplicantId(phone: string, name: string): string {
	return `applicant-${phone}-${normalizeName(name)}`;
}
```

**Step 4: Create repository interface**

Create `src/domain/applicant/repository.ts`:

```ts
import type { Applicant } from "./types.ts";

export interface ApplicantRepository {
	getById(id: string): Promise<Applicant | null>;
	getByPhone(phone: string): Promise<Applicant[]>;
	getByPhoneAndName(phone: string, name: string): Promise<Applicant | null>;
	list(): Promise<Applicant[]>;
}
```

**Step 5: Create command handlers**

Create `src/domain/applicant/commandHandlers.ts`:

```ts
import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { normalizeName } from "../application/normalizeName.ts";
import { toApplicantId } from "../application/applicantId.ts";
import { decide, evolve, initialState } from "./decider.ts";
import type {
	ApplicantEvent,
	ApplicantState,
	CreateApplicant,
	UpdateApplicant,
} from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, ApplicantEvent>({
	evolve,
	initialState,
});

function streamId(id: string): string {
	return `applicant-${id}`;
}

export async function createApplicant(
	data: CreateApplicant & { volunteerId?: string; applicationId?: string },
	eventStore: SQLiteEventStore,
): Promise<{ id: string }> {
	const id = toApplicantId(data.phone, data.name);
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (_state) =>
		decide(
			{
				type: "CreateApplicant",
				data: {
					id,
					volunteerId: data.volunteerId,
					applicationId: data.applicationId,
					phone: data.phone,
					name: data.name,
					email: data.email,
					createdAt: now,
				},
			},
			initialState(),
		),
	);

	return { id };
}

export async function updateApplicant(
	id: string,
	volunteerId: string,
	data: UpdateApplicant,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state: ApplicantState) => {
		if (state.status !== "active") {
			throw new IllegalStateError(
				`Cannot update applicant in ${state.status} state`,
			);
		}

		const merged = {
			id,
			volunteerId,
			phone: data.phone ?? state.phone,
			name: data.name ?? state.name,
			email: data.email === null ? undefined : (data.email ?? state.email),
			updatedAt: now,
		};

		return decide({ type: "UpdateApplicant", data: merged }, state);
	});
}

export async function deleteApplicant(
	id: string,
	volunteerId: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide(
			{ type: "DeleteApplicant", data: { id, volunteerId, deletedAt: now } },
			state,
		),
	);
}
```

**Step 6: Create projection and SQLite repository**

Create `src/infrastructure/projections/applicant.ts`:

```ts
import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { ApplicantEvent } from "../../domain/applicant/types.ts";

export const applicantProjection = sqliteProjection<ApplicantEvent>({
	canHandle: ["ApplicantCreated", "ApplicantUpdated", "ApplicantDeleted"],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS applicants (
				id TEXT PRIMARY KEY,
				phone TEXT NOT NULL,
				name TEXT NOT NULL,
				email TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const event of events) {
			switch (event.type) {
				case "ApplicantCreated": {
					const d = event.data;
					await connection.command(
						`INSERT OR IGNORE INTO applicants (id, phone, name, email, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?)`,
						[d.id, d.phone, d.name, d.email ?? null, d.createdAt, d.createdAt],
					);
					break;
				}
				case "ApplicantUpdated": {
					const d = event.data;
					await connection.command(
						`UPDATE applicants SET phone = ?, name = ?, email = ?, updated_at = ? WHERE id = ?`,
						[d.phone, d.name, d.email ?? null, d.updatedAt, d.id],
					);
					break;
				}
				case "ApplicantDeleted": {
					await connection.command("DELETE FROM applicants WHERE id = ?", [
						event.data.id,
					]);
					break;
				}
			}
		}
	},
});
```

Create `src/infrastructure/applicant/sqliteApplicantRepository.ts`:

```ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import type { Applicant } from "../../domain/applicant/types.ts";

type ApplicantRow = {
	id: string;
	phone: string;
	name: string;
	email: string | null;
	created_at: string;
	updated_at: string;
};

function rowToApplicant(row: ApplicantRow): Applicant {
	return {
		id: row.id,
		phone: row.phone,
		name: row.name,
		email: row.email ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function SQLiteApplicantRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<ApplicantRepository> {
	return {
		async getById(id: string): Promise<Applicant | null> {
			return pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants WHERE id = ? LIMIT 1",
					[id],
				);
				return rows[0] ? rowToApplicant(rows[0]) : null;
			});
		},

		async getByPhone(phone: string): Promise<Applicant[]> {
			return pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants WHERE phone = ? ORDER BY name",
					[phone],
				);
				return rows.map(rowToApplicant);
			});
		},

		async getByPhoneAndName(
			phone: string,
			name: string,
		): Promise<Applicant | null> {
			return pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants WHERE phone = ? AND name = ? LIMIT 1",
					[phone, name],
				);
				return rows[0] ? rowToApplicant(rows[0]) : null;
			});
		},

		async list(): Promise<Applicant[]> {
			return pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants ORDER BY name",
				);
				return rows.map(rowToApplicant);
			});
		},
	};
}
```

**Step 7: Register projection in event store**

Modify `src/infrastructure/eventStore.ts` — add import for `applicantProjection` from `./projections/applicant.ts` and add it to the `inlineProjections` array. Remove the `recipientProjection` import and usage.

**Step 8: Run test to verify it passes**

Run: `bun test test/integration/applicantRepository.test.ts`
Expected: PASS

**Step 9: Commit**

```
git add src/domain/applicant/ src/domain/application/applicantId.ts src/infrastructure/applicant/ src/infrastructure/projections/applicant.ts src/infrastructure/eventStore.ts test/integration/applicantRepository.test.ts
git commit -m "feat: add Applicant repository, command handlers, and projection"
```

---

### Task 4: Update toApplicantId callers and identity resolution

**Files:**
- Modify: `src/domain/application/resolveIdentity.ts` — use ApplicantRepository instead of RecipientRepository
- Modify: `src/domain/application/submitApplication.ts` — create Applicant instead of Recipient
- Modify: `src/domain/application/decider.ts` — update resolveApplicantId to accept name
- Modify: `src/domain/application/types.ts` — update IdentityResolution for phone+name matching
- Modify: `src/web/routes/apply.ts` — pass ApplicantRepository
- Modify: all callers of `toApplicantId(phone)` → `toApplicantId(phone, name)`

**Step 1: Write/update failing tests**

Update `test/integration/applicationRoutes.test.ts`: replace `RecipientRepository` with `ApplicantRepository`, `SQLiteRecipientRepository` with `SQLiteApplicantRepository`, `recipientRepo` with `applicantRepo`. Update `submitApplication` calls to pass `applicantRepo`.

Update existing tests in `test/unit/resolveIdentity.test.ts` (if exists) or create new ones to test against `ApplicantRepository`.

**Step 2: Run tests to verify they fail**

Run: `bun test test/integration/applicationRoutes.test.ts`
Expected: FAIL — type mismatches

**Step 3: Update resolveIdentity**

Modify `src/domain/application/resolveIdentity.ts`:

```ts
import type { ApplicantRepository } from "../applicant/repository.ts";
import { toApplicantId } from "./applicantId.ts";
import type { IdentityResolution } from "./types.ts";

export async function resolveIdentity(
	phone: string,
	name: string,
	applicantRepo: ApplicantRepository,
): Promise<IdentityResolution> {
	const exactMatch = await applicantRepo.getByPhoneAndName(phone, name);

	if (exactMatch) {
		return { type: "matched", applicantId: exactMatch.id };
	}

	const phoneMatches = await applicantRepo.getByPhone(phone);

	if (phoneMatches.length === 0) {
		return { type: "new" };
	}

	return {
		type: "flagged",
		applicantId: phoneMatches[0].id,
		reason: "Phone matches but name differs",
	};
}
```

**Step 4: Update submitApplication**

Modify `src/domain/application/submitApplication.ts`:
- Replace `RecipientRepository` import with `ApplicantRepository`
- Replace `createRecipient` import with `createApplicant` from `../applicant/commandHandlers.ts`
- Update function signature: `applicantRepo: ApplicantRepository` instead of `recipientRepo: RecipientRepository`
- In the "new" identity branch, call `createApplicant` instead of `createRecipient` (only phone, name, email — no payment/meeting fields)

**Step 5: Update decider resolveApplicantId**

Modify `src/domain/application/decider.ts`:
- Update `resolveApplicantId` to use `toApplicantId(phone, name)` — it now needs both phone and name from the identity
- Update the call site to pass `data.identity.name`

**Step 6: Update all other `toApplicantId(phone)` callers**

Search for `toApplicantId(` across the codebase. Each caller needs to pass name as second argument. Key locations:
- `src/web/routes/apply.ts` — the HTTP handler calls `toApplicantId(phone)` for eligibility check. It has access to `name` from the form, so update to `toApplicantId(phone, name)`.
- `src/domain/application/checkEligibility.ts` — receives `applicantId` as parameter (already resolved), no change needed.

**Step 7: Run tests to verify they pass**

Run: `bun test test/unit test/integration`
Expected: PASS (some recipient tests will still fail — we address those in the next task)

**Step 8: Commit**

```
git add src/domain/application/ src/domain/applicant/ src/web/routes/apply.ts
git commit -m "feat: wire Applicant into identity resolution and application submission"
```

---

### Task 5: Update web layer — rename /recipients to /applicants

**Files:**
- Rename: `src/web/pages/recipients.ts` → `src/web/pages/applicants.ts`
- Rename: `src/web/pages/recipientPanel.ts` → `src/web/pages/applicantPanel.ts`
- Rename: `src/web/pages/recipientHistoryPanel.ts` → `src/web/pages/applicantHistoryPanel.ts`
- Rename: `src/web/routes/recipients.ts` → `src/web/routes/applicants-admin.ts`
- Modify: `src/web/server.ts` — update all route registrations from /recipients to /applicants
- Modify: `src/web/index.ts` — swap RecipientRepository for ApplicantRepository
- Modify: `src/web/pages/applicationPanel.ts` — update link from /recipients to /applicants
- Modify: `src/web/pages/dashboard.ts` — update nav link if present

**Step 1: Rename and update page files**

In each renamed file:
- Replace `Recipient` type imports with `Applicant` from `../../domain/applicant/types.ts`
- Replace `recipient` references in HTML (ids, data attributes, URLs) with `applicant`
- Remove bankDetails, meetingPlace, notes, paymentPreference fields from the edit panel form (these now live on Application)
- Keep: phone, name, email fields in the edit form

**Step 2: Rename and update route file**

In `src/web/routes/applicants-admin.ts`:
- Replace `RecipientRepository` with `ApplicantRepository`
- Replace `createRecipient/updateRecipient/deleteRecipient` imports from applicant command handlers
- Update `signalsToRecipientData` → `signalsToApplicantData` (only phone, name, email)
- Update all route paths from `/recipients` to `/applicants`
- Update event stream prefix from `recipient-` to `applicant-`

**Step 3: Update server.ts**

- Replace all `/recipients` routes with `/applicants`
- Replace `recipientRepo` with `applicantRepo`
- Update `createRecipientRoutes` → `createApplicantRoutes`
- Update `recipientRoutes` → `applicantRoutes`
- In applicationRoutes creation, pass `applicantRepo` instead of `recipientRepo`

**Step 4: Update index.ts**

- Replace `SQLiteRecipientRepository` with `SQLiteApplicantRepository`
- Replace `recipientRepo` with `applicantRepo`

**Step 5: Update applicationPanel.ts**

- Change link from `/recipients/${id}/edit` to `/applicants/${id}/edit`
- Update parameter name from `recipientId` to `applicantId`

**Step 6: Update dashboard.ts (if it has a Recipients nav link)**

- Check for "Recipients" text and update to "Applicants"

**Step 7: Run tests**

Run: `bun test test/unit test/integration`
Expected: Some tests will fail due to renamed files — fix in next task

**Step 8: Commit**

```
git add -A
git commit -m "feat: rename recipients to applicants in web layer"
```

---

### Task 6: Update and rename all tests

**Files:**
- Rename: `test/unit/recipientDecider.test.ts` → `test/unit/applicantDecider.test.ts` (already created in Task 2, delete old)
- Rename: `test/unit/recipientPanel.test.ts` → `test/unit/applicantPanel.test.ts`
- Rename: `test/unit/recipientsPage.test.ts` → `test/unit/applicantsPage.test.ts`
- Rename: `test/unit/recipientHistoryPanel.test.ts` → `test/unit/applicantHistoryPanel.test.ts`
- Rename: `test/integration/recipientRepository.test.ts` → (delete, replaced by `test/integration/applicantRepository.test.ts` from Task 3)
- Rename: `test/integration/recipientRoutes.test.ts` → `test/integration/applicantRoutes.test.ts`
- Modify: `test/integration/applicationRoutes.test.ts` — update to use ApplicantRepository

**Step 1: Update each test file**

For each renamed test file:
- Update imports to point to new applicant modules
- Replace `Recipient` types with `Applicant`
- Replace `recipientRepo` with `applicantRepo`
- Remove bankDetails/notes/paymentPreference/meetingPlace assertions from panel/page tests
- Update URL assertions from `/recipients` to `/applicants`
- Update event type assertions from `RecipientCreated` to `ApplicantCreated` etc.

**Step 2: Run full test suite**

Run: `bun test test/unit test/integration`
Expected: PASS

**Step 3: Commit**

```
git add -A
git commit -m "test: rename recipient tests to applicant"
```

---

### Task 7: Delete old Recipient files

**Files:**
- Delete: `src/domain/recipient/` (entire directory)
- Delete: `src/infrastructure/recipient/` (entire directory)
- Delete: `src/infrastructure/projections/recipient.ts`
- Delete: any remaining `test/**/recipient*` test files

**Step 1: Verify no remaining imports reference old files**

Search for any remaining `from.*recipient` imports in `src/` and `test/`.

**Step 2: Delete files**

Remove all listed files/directories.

**Step 3: Run full test suite**

Run: `bun test test/unit test/integration`
Expected: PASS

**Step 4: Run linter**

Run: `bunx biome check --write`

**Step 5: Commit**

```
git add -A
git commit -m "chore: remove old Recipient entity files"
```

---

### Task 8: Update e2e tests

**Files:**
- Modify: `test/e2e/createRecipient.test.ts` → rename to `test/e2e/createApplicant.test.ts`
- Update all e2e tests that reference `/recipients` routes

**Step 1: Update e2e test files**

Update URLs, selectors, and assertions to use `/applicants` instead of `/recipients`.

**Step 2: Run e2e tests**

Run: `bunx playwright test`

**Step 3: Commit**

```
git add -A
git commit -m "test: update e2e tests for applicant rename"
```
