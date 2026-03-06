# Lottery System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lottery phase between application acceptance and grant creation, so winners are randomly drawn from a pool of accepted applications.

**Architecture:** Lottery aggregate (one stream per month) owns the draw. A process manager listens for `LotteryDrawn` and dispatches `SelectApplication`/`RejectFromLottery` commands to individual application streams. An applications projection replaces the grants projection for eligibility and pool queries.

**Tech Stack:** TypeScript, emmett/emmett-sqlite event sourcing, bun:test, SQLite

**Design doc:** `docs/plans/2026-03-06-lottery-design.md`

---

### Task 1: Seeded Shuffle (pure function)

**Files:**
- Create: `src/domain/lottery/seededShuffle.ts`
- Test: `test/unit/seededShuffle.test.ts`

**Step 1: Write the failing test**

```ts
// test/unit/seededShuffle.test.ts
import { describe, expect, test } from "bun:test";
import { seededShuffle } from "../../src/domain/lottery/seededShuffle.ts";

describe("seededShuffle", () => {
	test("returns same order for same seed", () => {
		const items = ["a", "b", "c", "d", "e"];
		const result1 = seededShuffle(items, "seed-1");
		const result2 = seededShuffle(items, "seed-1");
		expect(result1).toEqual(result2);
	});

	test("returns different order for different seed", () => {
		const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
		const result1 = seededShuffle(items, "seed-1");
		const result2 = seededShuffle(items, "seed-2");
		expect(result1).not.toEqual(result2);
	});

	test("contains all original items", () => {
		const items = ["a", "b", "c", "d", "e"];
		const result = seededShuffle(items, "any-seed");
		expect(result.sort()).toEqual(["a", "b", "c", "d", "e"]);
	});

	test("does not mutate input array", () => {
		const items = ["a", "b", "c"];
		const original = [...items];
		seededShuffle(items, "seed-1");
		expect(items).toEqual(original);
	});

	test("empty array returns empty", () => {
		expect(seededShuffle([], "seed")).toEqual([]);
	});

	test("single item returns same item", () => {
		expect(seededShuffle(["x"], "seed")).toEqual(["x"]);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/seededShuffle.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```ts
// src/domain/lottery/seededShuffle.ts

// Mulberry32 PRNG — deterministic 32-bit generator
function mulberry32(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Convert string seed to 32-bit integer via simple hash
function hashSeed(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		const char = seed.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return hash;
}

// Fisher-Yates shuffle with seeded PRNG
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
	const arr = [...items];
	const rng = mulberry32(hashSeed(seed));
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[arr[i], arr[j]] = [arr[j]!, arr[i]!];
	}
	return arr;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/seededShuffle.test.ts`
Expected: 6 passing

**Step 5: Commit**

```bash
git add src/domain/lottery/seededShuffle.ts test/unit/seededShuffle.test.ts
git commit -m "Add seeded shuffle for deterministic lottery draws"
```

---

### Task 2: Lottery Aggregate Types

**Files:**
- Create: `src/domain/lottery/types.ts`

**Step 1: Write the types**

```ts
// src/domain/lottery/types.ts
import type { Command, Event } from "@event-driven-io/emmett";

// Value Objects

export type LotteryApplicant = {
	applicationId: string;
	applicantId: string;
};

export type LotterySelection = LotteryApplicant & {
	rank: number;
};

// Commands

export type CloseApplicationWindow = Command<
	"CloseApplicationWindow",
	{
		monthCycle: string;
		closedAt: string;
	}
>;

export type DrawLottery = Command<
	"DrawLottery",
	{
		monthCycle: string;
		volunteerId: string;
		availableBalance: number;
		reserve: number;
		grantAmount: number;
		applicantPool: LotteryApplicant[];
		seed: string;
		drawnAt: string;
	}
>;

export type LotteryCommand = CloseApplicationWindow | DrawLottery;

// Events

export type ApplicationWindowClosed = Event<
	"ApplicationWindowClosed",
	{
		monthCycle: string;
		closedAt: string;
	}
>;

export type LotteryDrawn = Event<
	"LotteryDrawn",
	{
		monthCycle: string;
		volunteerId: string;
		seed: string;
		slots: number;
		availableBalance: number;
		reserve: number;
		grantAmount: number;
		selected: LotterySelection[];
		notSelected: LotteryApplicant[];
		drawnAt: string;
	}
>;

export type LotteryEvent = ApplicationWindowClosed | LotteryDrawn;

export type LotteryEventType = LotteryEvent["type"];

// State

export type LotteryState =
	| { status: "initial" }
	| { status: "windowClosed"; monthCycle: string }
	| {
			status: "drawn";
			monthCycle: string;
			selected: LotterySelection[];
			notSelected: LotteryApplicant[];
	  };
```

**Step 2: Commit**

```bash
git add src/domain/lottery/types.ts
git commit -m "Add lottery aggregate types"
```

---

### Task 3: Lottery Decider

**Files:**
- Create: `src/domain/lottery/decider.ts`
- Test: `test/unit/lotteryDecider.test.ts`

**Step 1: Write the failing tests**

```ts
// test/unit/lotteryDecider.test.ts
import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "../../src/domain/lottery/decider.ts";
import type {
	CloseApplicationWindow,
	DrawLottery,
	LotteryApplicant,
	LotteryState,
} from "../../src/domain/lottery/types.ts";

function makePool(n: number): LotteryApplicant[] {
	return Array.from({ length: n }, (_, i) => ({
		applicationId: `app-${i + 1}`,
		applicantId: `applicant-${i + 1}`,
	}));
}

function closeCommand(monthCycle = "2026-03"): CloseApplicationWindow {
	return {
		type: "CloseApplicationWindow",
		data: { monthCycle, closedAt: "2026-03-31T23:59:59Z" },
	};
}

function drawCommand(
	overrides: Partial<DrawLottery["data"]> = {},
): DrawLottery {
	return {
		type: "DrawLottery",
		data: {
			monthCycle: "2026-03",
			volunteerId: "vol-1",
			availableBalance: 200,
			reserve: 0,
			grantAmount: 40,
			applicantPool: makePool(10),
			seed: "test-seed",
			drawnAt: "2026-04-01T10:00:00Z",
			...overrides,
		},
	};
}

describe("lottery decider", () => {
	describe("CloseApplicationWindow", () => {
		test("initial → ApplicationWindowClosed", () => {
			const events = decide(closeCommand(), initialState());
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicationWindowClosed");
			expect(events[0]!.data.monthCycle).toBe("2026-03");
		});

		test("cannot close already-closed window", () => {
			const state = evolve(initialState(), {
				type: "ApplicationWindowClosed",
				data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
			});
			expect(() => decide(closeCommand(), state)).toThrow(IllegalStateError);
		});
	});

	describe("DrawLottery", () => {
		test("cannot draw from initial state", () => {
			expect(() => decide(drawCommand(), initialState())).toThrow(
				IllegalStateError,
			);
		});

		test("windowClosed → LotteryDrawn with correct slot count", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			// balance=200, reserve=0, grant=40 → 5 slots
			const events = decide(drawCommand(), state);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("LotteryDrawn");
			expect(events[0]!.data.slots).toBe(5);
			expect(events[0]!.data.selected).toHaveLength(5);
			expect(events[0]!.data.notSelected).toHaveLength(5);
		});

		test("selected entries have rank 1..N", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(drawCommand(), state);
			const ranks = events[0]!.data.selected.map(
				(s: { rank: number }) => s.rank,
			);
			expect(ranks).toEqual([1, 2, 3, 4, 5]);
		});

		test("slots capped by pool size", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			// balance=1000 → 25 slots, but only 3 in pool
			const events = decide(
				drawCommand({
					availableBalance: 1000,
					applicantPool: makePool(3),
				}),
				state,
			);
			expect(events[0]!.data.selected).toHaveLength(3);
			expect(events[0]!.data.notSelected).toHaveLength(0);
			expect(events[0]!.data.slots).toBe(3);
		});

		test("reserve reduces available slots", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			// balance=200, reserve=80 → (200-80)/40 = 3 slots
			const events = decide(
				drawCommand({ availableBalance: 200, reserve: 80 }),
				state,
			);
			expect(events[0]!.data.slots).toBe(3);
			expect(events[0]!.data.selected).toHaveLength(3);
		});

		test("zero slots when balance <= reserve", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(
				drawCommand({ availableBalance: 50, reserve: 50 }),
				state,
			);
			expect(events[0]!.data.slots).toBe(0);
			expect(events[0]!.data.selected).toHaveLength(0);
			expect(events[0]!.data.notSelected).toHaveLength(10);
		});

		test("empty pool → LotteryDrawn with no selections", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(
				drawCommand({ applicantPool: [] }),
				state,
			);
			expect(events[0]!.data.selected).toHaveLength(0);
			expect(events[0]!.data.notSelected).toHaveLength(0);
		});

		test("cannot draw twice", () => {
			const closed: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(drawCommand(), closed);
			const drawn = evolve(closed, events[0]!);
			expect(() => decide(drawCommand(), drawn)).toThrow(IllegalStateError);
		});

		test("draw is deterministic for same seed", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const cmd = drawCommand();
			const events1 = decide(cmd, state);
			const events2 = decide(cmd, state);
			expect(events1[0]!.data.selected).toEqual(events2[0]!.data.selected);
		});
	});

	describe("evolve", () => {
		test("ApplicationWindowClosed → windowClosed", () => {
			const state = evolve(initialState(), {
				type: "ApplicationWindowClosed",
				data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
			});
			expect(state).toEqual({
				status: "windowClosed",
				monthCycle: "2026-03",
			});
		});

		test("LotteryDrawn → drawn with selections", () => {
			const state = evolve(
				{ status: "windowClosed", monthCycle: "2026-03" },
				{
					type: "LotteryDrawn",
					data: {
						monthCycle: "2026-03",
						volunteerId: "vol-1",
						seed: "s",
						slots: 1,
						availableBalance: 40,
						reserve: 0,
						grantAmount: 40,
						selected: [
							{ applicationId: "app-1", applicantId: "a-1", rank: 1 },
						],
						notSelected: [{ applicationId: "app-2", applicantId: "a-2" }],
						drawnAt: "2026-04-01T10:00:00Z",
					},
				},
			);
			expect(state.status).toBe("drawn");
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/lotteryDecider.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```ts
// src/domain/lottery/decider.ts
import { IllegalStateError } from "@event-driven-io/emmett";
import { seededShuffle } from "./seededShuffle.ts";
import type {
	CloseApplicationWindow,
	DrawLottery,
	LotteryCommand,
	LotteryEvent,
	LotteryState,
} from "./types.ts";

export const initialState = (): LotteryState => ({ status: "initial" });

export function decide(
	command: LotteryCommand,
	state: LotteryState,
): LotteryEvent[] {
	switch (command.type) {
		case "CloseApplicationWindow":
			return decideClose(command, state);
		case "DrawLottery":
			return decideDraw(command, state);
	}
}

function decideClose(
	command: CloseApplicationWindow,
	state: LotteryState,
): LotteryEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(
			`Cannot close window in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationWindowClosed",
			data: {
				monthCycle: command.data.monthCycle,
				closedAt: command.data.closedAt,
			},
		},
	];
}

function decideDraw(
	command: DrawLottery,
	state: LotteryState,
): LotteryEvent[] {
	if (state.status !== "windowClosed") {
		throw new IllegalStateError(
			`Cannot draw lottery in ${state.status} state`,
		);
	}

	const { data } = command;
	const maxSlots = Math.max(
		0,
		Math.floor((data.availableBalance - data.reserve) / data.grantAmount),
	);
	const slots = Math.min(maxSlots, data.applicantPool.length);

	const shuffled = seededShuffle(data.applicantPool, data.seed);
	const selected = shuffled.slice(0, slots).map((a, i) => ({
		...a,
		rank: i + 1,
	}));
	const notSelected = shuffled.slice(slots);

	return [
		{
			type: "LotteryDrawn",
			data: {
				monthCycle: data.monthCycle,
				volunteerId: data.volunteerId,
				seed: data.seed,
				slots,
				availableBalance: data.availableBalance,
				reserve: data.reserve,
				grantAmount: data.grantAmount,
				selected,
				notSelected,
				drawnAt: data.drawnAt,
			},
		},
	];
}

export function evolve(
	state: LotteryState,
	event: LotteryEvent,
): LotteryState {
	switch (event.type) {
		case "ApplicationWindowClosed":
			return {
				status: "windowClosed",
				monthCycle: event.data.monthCycle,
			};
		case "LotteryDrawn":
			return {
				status: "drawn",
				monthCycle: event.data.monthCycle,
				selected: event.data.selected,
				notSelected: event.data.notSelected,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/lotteryDecider.test.ts`
Expected: All passing

**Step 5: Commit**

```bash
git add src/domain/lottery/decider.ts test/unit/lotteryDecider.test.ts
git commit -m "Add lottery decider with draw logic"
```

---

### Task 4: Application Selection Types + Decider Changes

**Files:**
- Modify: `src/domain/application/types.ts`
- Modify: `src/domain/application/decider.ts`
- Test: `test/unit/applicationSelection.test.ts`

**Step 1: Write the failing tests**

```ts
// test/unit/applicationSelection.test.ts
import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "../../src/domain/application/decider.ts";
import type { ApplicationState } from "../../src/domain/application/types.ts";

function acceptedState(monthCycle = "2026-03"): ApplicationState {
	return {
		status: "accepted",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle,
	};
}

function confirmedState(monthCycle = "2026-03"): ApplicationState {
	return {
		status: "confirmed",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle,
	};
}

describe("application selection", () => {
	test("accepted → SelectApplication → ApplicationSelected", () => {
		const events = decide(
			{
				type: "SelectApplication",
				data: {
					applicationId: "app-1",
					lotteryMonthCycle: "2026-03",
					rank: 1,
					selectedAt: "2026-04-01T10:00:00Z",
				},
			},
			acceptedState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationSelected");
		expect(events[0]!.data).toMatchObject({
			applicationId: "app-1",
			applicantId: "applicant-1",
			rank: 1,
		});
	});

	test("confirmed → SelectApplication → ApplicationSelected", () => {
		const events = decide(
			{
				type: "SelectApplication",
				data: {
					applicationId: "app-1",
					lotteryMonthCycle: "2026-03",
					rank: 2,
					selectedAt: "2026-04-01T10:00:00Z",
				},
			},
			confirmedState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationSelected");
	});

	test("accepted → RejectFromLottery → ApplicationNotSelected", () => {
		const events = decide(
			{
				type: "RejectFromLottery",
				data: {
					applicationId: "app-1",
					lotteryMonthCycle: "2026-03",
					rejectedAt: "2026-04-01T10:00:00Z",
				},
			},
			acceptedState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationNotSelected");
	});

	test("cannot select from initial state", () => {
		expect(() =>
			decide(
				{
					type: "SelectApplication",
					data: {
						applicationId: "app-1",
						lotteryMonthCycle: "2026-03",
						rank: 1,
						selectedAt: "2026-04-01T10:00:00Z",
					},
				},
				initialState(),
			),
		).toThrow(IllegalStateError);
	});

	test("cannot select already-selected application", () => {
		const selected: ApplicationState = {
			status: "selected",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			rank: 1,
		};
		expect(() =>
			decide(
				{
					type: "SelectApplication",
					data: {
						applicationId: "app-1",
						lotteryMonthCycle: "2026-03",
						rank: 1,
						selectedAt: "2026-04-01T10:00:00Z",
					},
				},
				selected,
			),
		).toThrow(IllegalStateError);
	});

	test("evolve: ApplicationSelected → selected state", () => {
		const state = evolve(acceptedState(), {
			type: "ApplicationSelected",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				rank: 1,
				selectedAt: "2026-04-01T10:00:00Z",
			},
		});
		expect(state).toEqual({
			status: "selected",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			rank: 1,
		});
	});

	test("evolve: ApplicationNotSelected → not_selected state", () => {
		const state = evolve(acceptedState(), {
			type: "ApplicationNotSelected",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				notSelectedAt: "2026-04-01T10:00:00Z",
			},
		});
		expect(state).toEqual({
			status: "not_selected",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/applicationSelection.test.ts`
Expected: FAIL — types don't exist

**Step 3: Add types to `src/domain/application/types.ts`**

Add to the Commands section:

```ts
export type SelectApplication = Command<
	"SelectApplication",
	{
		applicationId: string;
		lotteryMonthCycle: string;
		rank: number;
		selectedAt: string;
	}
>;

export type RejectFromLottery = Command<
	"RejectFromLottery",
	{
		applicationId: string;
		lotteryMonthCycle: string;
		rejectedAt: string;
	}
>;
```

Add to the Events section:

```ts
export type ApplicationSelected = Event<
	"ApplicationSelected",
	{
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		rank: number;
		selectedAt: string;
	}
>;

export type ApplicationNotSelected = Event<
	"ApplicationNotSelected",
	{
		applicationId: string;
		applicantId: string;
		monthCycle: string;
		notSelectedAt: string;
	}
>;
```

Add to `ApplicationEvent` union:

```ts
export type ApplicationEvent =
	| ApplicationSubmitted
	| ApplicationAccepted
	| ApplicationConfirmed
	| ApplicationRejected
	| ApplicationFlaggedForReview
	| ApplicationSelected
	| ApplicationNotSelected;
```

Add to `ApplicationState` union:

```ts
	| {
			status: "selected";
			applicationId: string;
			applicantId: string;
			monthCycle: string;
			rank: number;
	  }
	| {
			status: "not_selected";
			applicationId: string;
			applicantId: string;
			monthCycle: string;
	  };
```

**Step 4: Update decider at `src/domain/application/decider.ts`**

Add `SelectApplication` and `RejectFromLottery` to the `ApplicationCommand` type and the `decide` switch.

Add `decideSelect` and `decideRejectFromLottery` functions:

```ts
function decideSelect(
	command: SelectApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "accepted" && state.status !== "confirmed") {
		throw new IllegalStateError(
			`Cannot select application in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationSelected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				rank: command.data.rank,
				selectedAt: command.data.selectedAt,
			},
		},
	];
}

function decideRejectFromLottery(
	command: RejectFromLottery,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "accepted" && state.status !== "confirmed") {
		throw new IllegalStateError(
			`Cannot reject application from lottery in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationNotSelected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				monthCycle: state.monthCycle,
				notSelectedAt: command.data.rejectedAt,
			},
		},
	];
}
```

Add evolve cases:

```ts
case "ApplicationSelected":
	return {
		status: "selected",
		applicationId: event.data.applicationId,
		applicantId: event.data.applicantId,
		monthCycle: event.data.monthCycle,
		rank: event.data.rank,
	};
case "ApplicationNotSelected":
	return {
		status: "not_selected",
		applicationId: event.data.applicationId,
		applicantId: event.data.applicantId,
		monthCycle: event.data.monthCycle,
	};
```

**Step 5: Run tests**

Run: `bun test test/unit/applicationSelection.test.ts`
Expected: All passing

Run: `bun test` (full suite — make sure nothing broke)
Expected: All passing

**Step 6: Commit**

```bash
git add src/domain/application/types.ts src/domain/application/decider.ts test/unit/applicationSelection.test.ts
git commit -m "Add application selection commands and events for lottery"
```

---

### Task 5: Applications Projection (replaces grants)

**Files:**
- Create: `src/infrastructure/projections/applications.ts`
- Delete: `src/infrastructure/projections/grants.ts`
- Modify: `src/infrastructure/eventStore.ts`
- Test: `test/integration/applicationsProjection.test.ts`

**Step 1: Write the failing tests**

```ts
// test/integration/applicationsProjection.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

type ApplicationRow = {
	id: string;
	applicant_id: string;
	month_cycle: string;
	status: string;
	rank: number | null;
	payment_preference: string;
	reject_reason: string | null;
	applied_at: string | null;
	accepted_at: string | null;
	selected_at: string | null;
	rejected_at: string | null;
};

describe("applicationsProjection", () => {
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

	async function queryApps(): Promise<ApplicationRow[]> {
		return pool.withConnection(async (conn) =>
			conn.query<ApplicationRow>("SELECT * FROM applications"),
		);
	}

	test("ApplicationSubmitted creates row with status applied", async () => {
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

		const apps = await queryApps();
		expect(apps).toHaveLength(1);
		expect(apps[0]!.status).toBe("applied");
		expect(apps[0]!.payment_preference).toBe("bank");
	});

	test("ApplicationAccepted updates to accepted", async () => {
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

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("accepted");
		expect(apps[0]!.accepted_at).toBe("2026-03-01T00:00:01.000Z");
	});

	test("ApplicationSelected updates to selected with rank", async () => {
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
			{
				type: "ApplicationSelected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					rank: 1,
					selectedAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("selected");
		expect(apps[0]!.rank).toBe(1);
		expect(apps[0]!.selected_at).toBe("2026-04-01T10:00:00Z");
	});

	test("ApplicationNotSelected updates to not_selected", async () => {
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
			{
				type: "ApplicationNotSelected",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					notSelectedAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("not_selected");
	});

	test("ApplicationRejected updates to rejected with reason", async () => {
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

		const apps = await queryApps();
		expect(apps[0]!.status).toBe("rejected");
		expect(apps[0]!.reject_reason).toBe("cooldown");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/applicationsProjection.test.ts`
Expected: FAIL — module not found / table not found

**Step 3: Create `src/infrastructure/projections/applications.ts`**

```ts
// src/infrastructure/projections/applications.ts
import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { ApplicationEvent } from "../../domain/application/types.ts";

export const applicationsProjection = sqliteProjection<ApplicationEvent>({
	canHandle: [
		"ApplicationSubmitted",
		"ApplicationAccepted",
		"ApplicationConfirmed",
		"ApplicationRejected",
		"ApplicationFlaggedForReview",
		"ApplicationSelected",
		"ApplicationNotSelected",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS applications (
				id TEXT PRIMARY KEY,
				applicant_id TEXT NOT NULL,
				month_cycle TEXT NOT NULL,
				status TEXT NOT NULL,
				rank INTEGER,
				payment_preference TEXT NOT NULL,
				reject_reason TEXT,
				applied_at TEXT,
				accepted_at TEXT,
				selected_at TEXT,
				rejected_at TEXT,
				UNIQUE(applicant_id, month_cycle)
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationSubmitted":
					await connection.command(
						`INSERT OR IGNORE INTO applications (id, applicant_id, month_cycle, status, payment_preference, applied_at)
						 VALUES (?, ?, ?, 'applied', ?, ?)`,
						[
							data.applicationId,
							data.applicantId,
							data.monthCycle,
							data.paymentPreference,
							data.submittedAt,
						],
					);
					break;
				case "ApplicationAccepted":
					await connection.command(
						"UPDATE applications SET status = 'accepted', accepted_at = ? WHERE id = ?",
						[data.acceptedAt, data.applicationId],
					);
					break;
				case "ApplicationConfirmed":
					await connection.command(
						"UPDATE applications SET status = 'accepted', accepted_at = ? WHERE id = ?",
						[data.confirmedAt, data.applicationId],
					);
					break;
				case "ApplicationRejected":
					await connection.command(
						"UPDATE applications SET status = 'rejected', reject_reason = ?, rejected_at = ? WHERE id = ?",
						[data.reason, data.rejectedAt, data.applicationId],
					);
					break;
				case "ApplicationFlaggedForReview":
					await connection.command(
						"UPDATE applications SET status = 'flagged' WHERE id = ?",
						[data.applicationId],
					);
					break;
				case "ApplicationSelected":
					await connection.command(
						"UPDATE applications SET status = 'selected', rank = ?, selected_at = ? WHERE id = ?",
						[data.rank, data.selectedAt, data.applicationId],
					);
					break;
				case "ApplicationNotSelected":
					await connection.command(
						"UPDATE applications SET status = 'not_selected' WHERE id = ?",
						[data.applicationId],
					);
					break;
			}
		}
	},
});
```

**Step 4: Update `src/infrastructure/eventStore.ts`**

Replace the grants import/usage with applications:

```ts
// Replace:
import { grantsProjection } from "./projections/grants.ts";
// With:
import { applicationsProjection } from "./projections/applications.ts";

// In projections array, replace grantsProjection with applicationsProjection
```

**Step 5: Delete `src/infrastructure/projections/grants.ts`**

```bash
rm src/infrastructure/projections/grants.ts
```

**Step 6: Run tests**

Run: `bun test test/integration/applicationsProjection.test.ts`
Expected: All passing

**Step 7: Commit**

```bash
git add src/infrastructure/projections/applications.ts src/infrastructure/eventStore.ts test/integration/applicationsProjection.test.ts
git rm src/infrastructure/projections/grants.ts
git commit -m "Replace grants projection with applications projection"
```

---

### Task 6: Update Eligibility Checks

**Files:**
- Modify: `src/domain/application/checkEligibility.ts`
- Modify: `test/integration/checkEligibility.test.ts`
- Modify: `test/integration/submitApplication.test.ts`

**Step 1: Update `checkEligibility.ts`**

The query changes from `grants` table to `applications` table. Cooldown now checks for `selected` status (not `accepted`/`paid`). Duplicate checks for any application in current month.

```ts
// src/domain/application/checkEligibility.ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { EligibilityResult } from "./types.ts";

const COOLDOWN_MONTHS = 3;

function monthsAgo(monthCycle: string, n: number): string {
	const [year, month] = monthCycle.split("-").map(Number) as [number, number];
	const date = new Date(year, month - 1 - n, 1);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export async function checkEligibility(
	applicantId: string,
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<EligibilityResult> {
	return pool.withConnection(async (conn) => {
		const tables = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='applications'",
		);
		if (tables.length === 0) {
			return { status: "eligible" } as const;
		}

		// Check for duplicate: any application this month (any status except rejected)
		const dupes = await conn.query<{ id: string }>(
			`SELECT id FROM applications
			 WHERE applicant_id = ?
			   AND month_cycle = ?
			   AND status != 'rejected'
			 LIMIT 1`,
			[applicantId, monthCycle],
		);
		if (dupes.length > 0) {
			return { status: "duplicate" } as const;
		}

		// Check cooldown: selected in last 3 months
		const rows = await conn.query<{ month_cycle: string }>(
			`SELECT month_cycle FROM applications
			 WHERE applicant_id = ?
			   AND status = 'selected'
			   AND month_cycle >= ?
			 ORDER BY month_cycle DESC
			 LIMIT 1`,
			[applicantId, monthsAgo(monthCycle, COOLDOWN_MONTHS)],
		);

		if (rows.length === 0 || !rows[0]) {
			return { status: "eligible" } as const;
		}

		return {
			status: "cooldown",
			lastGrantMonth: rows[0].month_cycle,
		} as const;
	});
}
```

**Step 2: Update `test/integration/checkEligibility.test.ts`**

The helper `submitAndAccept` stays roughly the same. But cooldown now requires `selected` status, not just `accepted`. Update the helper to also append `ApplicationSelected` events for cooldown tests. Update query references from `grants` to `applications`.

Key changes:
- `submitAndAccept` → rename to `submitAcceptAndSelect` for tests that need cooldown
- Keep a `submitAndAccept` that only goes to accepted (for duplicate checks)
- The `payment_failed` test becomes irrelevant (no payment status in applications table) — remove or replace with a test that `not_selected` doesn't trigger cooldown

**Step 3: Update `test/integration/submitApplication.test.ts`**

- Change any query from `grants` table to `applications` table
- The "confirmed application creates grant in projection" test → becomes "confirmed application creates accepted row in applications projection"
- Eligibility e2e tests: `accepted` no longer triggers cooldown (only `selected` does). The duplicate check now looks at `applications` not `grants`. Update expectations accordingly.

**Important behavioral change:** After this task, an `accepted` application no longer blocks future applications via cooldown. Only `selected` does. The duplicate check (same month) still works since it queries `applications` where `status != 'rejected'`.

**Step 4: Run full test suite**

Run: `bun test`
Expected: All passing

**Step 5: Commit**

```bash
git add src/domain/application/checkEligibility.ts test/integration/checkEligibility.test.ts test/integration/submitApplication.test.ts
git commit -m "Update eligibility to use applications projection and selected status"
```

---

### Task 7: Delete Grants Projection Test

**Files:**
- Delete: `test/integration/grantsProjection.test.ts`

The grants projection no longer exists. These tests are replaced by `applicationsProjection.test.ts`.

```bash
git rm test/integration/grantsProjection.test.ts
git commit -m "Remove grants projection test (replaced by applications projection)"
```

---

### Task 8: Lottery Process Manager

**Files:**
- Create: `src/domain/lottery/processManager.ts`
- Test: `test/integration/lotteryDraw.test.ts`

**Step 1: Write the failing integration test**

This is the big end-to-end test: submit applications → close window → draw lottery → verify application streams have selection events.

```ts
// test/integration/lotteryDraw.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { CommandHandler } from "@event-driven-io/emmett";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import type { RecipientRepository } from "../../src/domain/recipient/repository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import {
	decide as lotteryDecide,
	evolve as lotteryEvolve,
	initialState as lotteryInitialState,
} from "../../src/domain/lottery/decider.ts";
import type { LotteryEvent } from "../../src/domain/lottery/types.ts";
import { processLotteryDrawn } from "../../src/domain/lottery/processManager.ts";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";

describe("lottery draw end-to-end", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	async function submitAccepted(id: string, phone: string, name: string) {
		await submitApplication(
			{
				applicationId: id,
				phone,
				name,
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility: { status: "eligible" },
			},
			eventStore,
			recipientRepo,
		);
	}

	test("full lottery flow: submit → close → draw → selections", async () => {
		// Submit 5 applications
		await submitAccepted("app-1", "07700900001", "Alice");
		await submitAccepted("app-2", "07700900002", "Bob");
		await submitAccepted("app-3", "07700900003", "Charlie");
		await submitAccepted("app-4", "07700900004", "Diana");
		await submitAccepted("app-5", "07700900005", "Eve");

		// Close window
		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		const lotteryStream = "lottery-2026-03";

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		// Query pool from applications projection
		const apps = await pool.withConnection(async (conn) =>
			conn.query<{ id: string; applicant_id: string }>(
				"SELECT id, applicant_id FROM applications WHERE month_cycle = ? AND status = 'accepted'",
				["2026-03"],
			),
		);

		// Draw lottery: balance=120, reserve=0, grant=40 → 3 winners
		const { newEvents } = await lotteryHandle(
			eventStore,
			lotteryStream,
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 120,
							reserve: 0,
							grantAmount: 40,
							applicantPool: apps.map((a) => ({
								applicationId: a.id,
								applicantId: a.applicant_id,
							})),
							seed: crypto.randomUUID(),
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		const drawn = newEvents[0]!;
		expect(drawn.type).toBe("LotteryDrawn");
		expect(drawn.data.selected).toHaveLength(3);
		expect(drawn.data.notSelected).toHaveLength(2);

		// Process manager fans out selection commands
		await processLotteryDrawn(drawn, eventStore);

		// Verify application streams
		for (const s of drawn.data.selected) {
			const { events } = await eventStore.readStream<ApplicationEvent>(
				`application-${s.applicationId}`,
			);
			const selected = events.find((e) => e.type === "ApplicationSelected");
			expect(selected).toBeDefined();
			expect(selected!.data.rank).toBe(s.rank);
		}

		for (const ns of drawn.data.notSelected) {
			const { events } = await eventStore.readStream<ApplicationEvent>(
				`application-${ns.applicationId}`,
			);
			const notSelected = events.find(
				(e) => e.type === "ApplicationNotSelected",
			);
			expect(notSelected).toBeDefined();
		}
	});

	test("process manager is idempotent", async () => {
		await submitAccepted("app-1", "07700900001", "Alice");

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		const lotteryStream = "lottery-2026-03";

		await lotteryHandle(eventStore, lotteryStream, (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		const { newEvents } = await lotteryHandle(
			eventStore,
			lotteryStream,
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 40,
							reserve: 0,
							grantAmount: 40,
							applicantPool: [
								{ applicationId: "app-1", applicantId: "applicant-07700900001" },
							],
							seed: "test-seed",
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		const drawn = newEvents[0]!;

		// Process twice
		await processLotteryDrawn(drawn, eventStore);
		await processLotteryDrawn(drawn, eventStore);

		// Should still have exactly one ApplicationSelected event
		const { events } = await eventStore.readStream<ApplicationEvent>(
			"application-app-1",
		);
		const selected = events.filter((e) => e.type === "ApplicationSelected");
		expect(selected).toHaveLength(1);
	});

	test("selected applicant triggers cooldown", async () => {
		await submitAccepted("app-1", "07700900001", "Alice");

		const lotteryHandle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({ evolve: lotteryEvolve, initialState: lotteryInitialState });

		await lotteryHandle(eventStore, "lottery-2026-03", (state) =>
			lotteryDecide(
				{
					type: "CloseApplicationWindow",
					data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
				},
				state,
			),
		);

		const { newEvents } = await lotteryHandle(
			eventStore,
			"lottery-2026-03",
			(state) =>
				lotteryDecide(
					{
						type: "DrawLottery",
						data: {
							monthCycle: "2026-03",
							volunteerId: "vol-1",
							availableBalance: 40,
							reserve: 0,
							grantAmount: 40,
							applicantPool: [
								{ applicationId: "app-1", applicantId: "applicant-07700900001" },
							],
							seed: "test-seed",
							drawnAt: "2026-04-01T10:00:00Z",
						},
					},
					state,
				),
		);

		await processLotteryDrawn(newEvents[0]!, eventStore);

		// Check eligibility for next month — should be on cooldown
		const { checkEligibility } = await import(
			"../../src/domain/application/checkEligibility.ts"
		);
		const result = await checkEligibility(
			"applicant-07700900001",
			"2026-04",
			pool,
		);
		expect(result).toEqual({ status: "cooldown", lastGrantMonth: "2026-03" });
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/lotteryDraw.test.ts`
Expected: FAIL — processLotteryDrawn not found

**Step 3: Write the process manager**

```ts
// src/domain/lottery/processManager.ts
import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	decide,
	evolve,
	initialState,
} from "../application/decider.ts";
import type { ApplicationEvent } from "../application/types.ts";
import type { LotteryDrawn } from "./types.ts";

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

export async function processLotteryDrawn(
	event: LotteryDrawn,
	eventStore: SQLiteEventStore,
): Promise<void> {
	for (const selected of event.data.selected) {
		const streamId = `application-${selected.applicationId}`;
		try {
			await handle(eventStore, streamId, (state) =>
				decide(
					{
						type: "SelectApplication",
						data: {
							applicationId: selected.applicationId,
							lotteryMonthCycle: event.data.monthCycle,
							rank: selected.rank,
							selectedAt: event.data.drawnAt,
						},
					},
					state,
				),
			);
		} catch {
			// Already selected (idempotent replay) — safe to ignore
		}
	}

	for (const notSelected of event.data.notSelected) {
		const streamId = `application-${notSelected.applicationId}`;
		try {
			await handle(eventStore, streamId, (state) =>
				decide(
					{
						type: "RejectFromLottery",
						data: {
							applicationId: notSelected.applicationId,
							lotteryMonthCycle: event.data.monthCycle,
							rejectedAt: event.data.drawnAt,
						},
					},
					state,
				),
			);
		} catch {
			// Already not-selected (idempotent replay) — safe to ignore
		}
	}
}
```

**Step 4: Run tests**

Run: `bun test test/integration/lotteryDraw.test.ts`
Expected: All passing

Run: `bun test` (full suite)
Expected: All passing

**Step 5: Commit**

```bash
git add src/domain/lottery/processManager.ts test/integration/lotteryDraw.test.ts
git commit -m "Add lottery process manager with end-to-end tests"
```

---

### Task 9: Lint + Format + Final Check

**Step 1: Lint and format**

```bash
bunx biome check --write
```

**Step 2: Run full test suite**

```bash
bun test
```

Expected: All passing

**Step 3: Commit any formatting changes**

```bash
git add -A
git commit -m "Format and lint lottery implementation"
```
