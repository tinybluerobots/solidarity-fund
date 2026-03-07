# Application Window Open/Close Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reject applications when the lottery window is not explicitly open, with volunteer-controlled open/close lifecycle.

**Architecture:** Add `OpenApplicationWindow` command to lottery aggregate (`initial→open→closed→drawn`). New `lottery_windows` projection tracks window status per month. `checkEligibility` queries it before duplicate/cooldown checks. Applications submitted when window isn't open get `ApplicationSubmitted` + `ApplicationRejected(reason: window_closed)`.

**Tech Stack:** TypeScript, Bun, Emmett (event sourcing), SQLite

---

### Task 1: Add OpenApplicationWindow to Lottery Types

**Files:**
- Modify: `src/domain/lottery/types.ts`

**Step 1: Write the failing test**

Add to `test/unit/lotteryDecider.test.ts`:

```ts
import type {
	CloseApplicationWindow,
	DrawLottery,
	LotteryApplicant,
	LotteryState,
	OpenApplicationWindow, // new import
} from "../../src/domain/lottery/types.ts";

// Add helper
function openCommand(monthCycle = "2026-03"): OpenApplicationWindow {
	return {
		type: "OpenApplicationWindow",
		data: { monthCycle, openedAt: "2026-03-01T00:00:00Z" },
	};
}

describe("OpenApplicationWindow", () => {
	test("initial → ApplicationWindowOpened", () => {
		const events = decide(openCommand(), initialState());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationWindowOpened");
		expect(events[0]!.data.monthCycle).toBe("2026-03");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/lotteryDecider.test.ts`
Expected: FAIL — `OpenApplicationWindow` type does not exist

**Step 3: Add types to `src/domain/lottery/types.ts`**

Add `OpenApplicationWindow` command type:

```ts
export type OpenApplicationWindow = Command<
	"OpenApplicationWindow",
	{
		monthCycle: string;
		openedAt: string;
	}
>;
```

Add `ApplicationWindowOpened` event type:

```ts
export type ApplicationWindowOpened = Event<
	"ApplicationWindowOpened",
	{
		monthCycle: string;
		openedAt: string;
	}
>;
```

Update unions:

```ts
export type LotteryCommand = OpenApplicationWindow | CloseApplicationWindow | DrawLottery;

export type LotteryEvent = ApplicationWindowOpened | ApplicationWindowClosed | LotteryDrawn;
```

Add `open` to `LotteryState`:

```ts
export type LotteryState =
	| { status: "initial" }
	| { status: "open"; monthCycle: string }
	| { status: "windowClosed"; monthCycle: string }
	| {
			status: "drawn";
			monthCycle: string;
			selected: LotterySelection[];
			notSelected: LotteryApplicant[];
	  };
```

**Step 4: Tests still fail — decider doesn't handle the new command yet. That's Task 2.**

---

### Task 2: Update Lottery Decider for Open/Close Flow

**Files:**
- Modify: `src/domain/lottery/decider.ts`

**Step 1: Update decider to handle OpenApplicationWindow**

In `decide()`, add case:

```ts
case "OpenApplicationWindow":
	return decideOpen(command, state);
```

Add `decideOpen` function:

```ts
function decideOpen(
	command: OpenApplicationWindow,
	state: LotteryState,
): LotteryEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(`Cannot open window in ${state.status} state`);
	}
	return [
		{
			type: "ApplicationWindowOpened",
			data: {
				monthCycle: command.data.monthCycle,
				openedAt: command.data.openedAt,
			},
		},
	];
}
```

Add import for `OpenApplicationWindow` type.

**Step 2: Update `decideClose` to require `open` state instead of `initial`**

Change `decideClose`:

```ts
if (state.status !== "open") {
	throw new IllegalStateError(`Cannot close window in ${state.status} state`);
}
```

**Step 3: Update `evolve` to handle `ApplicationWindowOpened`**

Add case:

```ts
case "ApplicationWindowOpened":
	return {
		status: "open",
		monthCycle: event.data.monthCycle,
	};
```

**Step 4: Run tests to verify the new test passes**

Run: `bun test test/unit/lotteryDecider.test.ts`
Expected: The new `OpenApplicationWindow` test passes, but existing `CloseApplicationWindow` tests will fail because they go `initial→close` which now requires `initial→open→close`.

**Step 5: Fix existing tests to go through `open` state first**

Update the `closeCommand` test setup — the "initial → ApplicationWindowClosed" test becomes "open → ApplicationWindowClosed":

```ts
describe("CloseApplicationWindow", () => {
	test("open → ApplicationWindowClosed", () => {
		const state = evolve(initialState(), {
			type: "ApplicationWindowOpened",
			data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
		});
		const events = decide(closeCommand(), state);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationWindowClosed");
		expect(events[0]!.data.monthCycle).toBe("2026-03");
	});

	test("cannot close from initial state", () => {
		expect(() => decide(closeCommand(), initialState())).toThrow(IllegalStateError);
	});

	test("cannot close already-closed window", () => {
		let state = evolve(initialState(), {
			type: "ApplicationWindowOpened",
			data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
		});
		state = evolve(state, {
			type: "ApplicationWindowClosed",
			data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
		});
		expect(() => decide(closeCommand(), state)).toThrow(IllegalStateError);
	});
});
```

Add tests for illegal `OpenApplicationWindow` transitions:

```ts
test("cannot open already-open window", () => {
	const state = evolve(initialState(), {
		type: "ApplicationWindowOpened",
		data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
	});
	expect(() => decide(openCommand(), state)).toThrow(IllegalStateError);
});
```

**Step 6: Run all tests**

Run: `bun test test/unit/lotteryDecider.test.ts`
Expected: All pass

**Step 7: Commit**

```bash
git add src/domain/lottery/types.ts src/domain/lottery/decider.ts test/unit/lotteryDecider.test.ts
git commit -m "Add OpenApplicationWindow command to lottery aggregate"
```

---

### Task 3: Add Lottery Window Projection

**Files:**
- Create: `src/infrastructure/projections/lotteryWindow.ts`
- Modify: `src/infrastructure/eventStore.ts`

**Step 1: Create the projection**

```ts
// src/infrastructure/projections/lotteryWindow.ts
import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { LotteryEvent } from "../../domain/lottery/types.ts";

export const lotteryWindowProjection = sqliteProjection<LotteryEvent>({
	canHandle: ["ApplicationWindowOpened", "ApplicationWindowClosed"],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS lottery_windows (
				month_cycle TEXT PRIMARY KEY,
				status TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationWindowOpened":
					await connection.command(
						`INSERT OR REPLACE INTO lottery_windows (month_cycle, status) VALUES (?, 'open')`,
						[data.monthCycle],
					);
					break;
				case "ApplicationWindowClosed":
					await connection.command(
						`UPDATE lottery_windows SET status = 'closed' WHERE month_cycle = ?`,
						[data.monthCycle],
					);
					break;
			}
		}
	},
});
```

**Step 2: Register in event store**

In `src/infrastructure/eventStore.ts`, add import and include in projections array:

```ts
import { lotteryWindowProjection } from "./projections/lotteryWindow.ts";

// In createEventStore, add to projections array:
projections: inlineProjections([
	applicationsProjection,
	grantProjection,
	recipientProjection,
	volunteerProjection,
	lotteryWindowProjection,
]),
```

**Step 3: Run existing tests to verify nothing breaks**

Run: `bun test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/infrastructure/projections/lotteryWindow.ts src/infrastructure/eventStore.ts
git commit -m "Add lottery window projection tracking open/closed status"
```

---

### Task 4: Add `window_closed` to Eligibility Check

**Files:**
- Modify: `src/domain/application/types.ts` (add `window_closed` to `EligibilityResult`)
- Modify: `src/domain/application/checkEligibility.ts` (query lottery_windows)
- Modify: `src/domain/application/decider.ts` (handle `window_closed` rejection reason)

**Step 1: Write failing test**

Add to `test/integration/submitApplication.test.ts`:

```ts
describe("application window gate", () => {
	test("window not opened → Submitted + Rejected(window_closed)", async () => {
		// No lottery window opened — checkEligibility should return window_closed
		const eligibility = await checkEligibility(
			toApplicantId("07700900001"),
			"2026-03",
			pool,
		);
		expect(eligibility).toEqual({ status: "window_closed" });

		const { events } = await submitApplication(
			{
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank",
				meetingPlace: "Mill Road",
				monthCycle: "2026-03",
				eligibility,
			},
			eventStore,
			recipientRepo,
		);

		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ApplicationSubmitted");
		expect(events[1]!.type).toBe("ApplicationRejected");
		expect(events[1]!.data).toMatchObject({
			reason: "window_closed",
			detail: "Application window is not open",
		});
	});

	test("window open → eligible", async () => {
		await eventStore.appendToStream("lottery-2026-03", [
			{
				type: "ApplicationWindowOpened",
				data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
			},
		]);

		const eligibility = await checkEligibility(
			toApplicantId("07700900001"),
			"2026-03",
			pool,
		);
		expect(eligibility).toEqual({ status: "eligible" });
	});

	test("window closed → Submitted + Rejected(window_closed)", async () => {
		await eventStore.appendToStream("lottery-2026-03", [
			{
				type: "ApplicationWindowOpened",
				data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
			},
		]);
		await eventStore.appendToStream("lottery-2026-03", [
			{
				type: "ApplicationWindowClosed",
				data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
			},
		]);

		const eligibility = await checkEligibility(
			toApplicantId("07700900001"),
			"2026-03",
			pool,
		);
		expect(eligibility).toEqual({ status: "window_closed" });
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/submitApplication.test.ts`
Expected: FAIL — `window_closed` not a valid eligibility status

**Step 3: Update `EligibilityResult` in `src/domain/application/types.ts`**

```ts
export type EligibilityResult =
	| { status: "eligible" }
	| { status: "cooldown"; lastGrantMonth: string }
	| { status: "duplicate" }
	| { status: "window_closed" };
```

**Step 4: Update `ApplicationRejected` reason union in `src/domain/application/types.ts`**

```ts
export type ApplicationRejected = Event<
	"ApplicationRejected",
	{
		applicationId: string;
		applicantId: string;
		reason: "cooldown" | "duplicate" | "identity_mismatch" | "window_closed";
		detail: string;
		volunteerId?: string;
		monthCycle: string;
		rejectedAt: string;
	}
>;
```

**Step 5: Update `checkEligibility` in `src/domain/application/checkEligibility.ts`**

Add window check **before** the duplicate check:

```ts
// Check window status first
const windowRows = await conn.query<{ status: string }>(
	"SELECT status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
	[monthCycle],
);
if (windowRows.length === 0 || windowRows[0]?.status !== "open") {
	return { status: "window_closed" } as const;
}
```

Handle the case where the `lottery_windows` table doesn't exist yet (same pattern as the `applications` table check):

```ts
const windowTables = await conn.query<{ name: string }>(
	"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
);
if (windowTables.length === 0) {
	return { status: "window_closed" } as const;
}
```

**Step 6: Update application decider's rejection detail in `src/domain/application/decider.ts`**

In `decideSubmit`, update the detail logic (lines 114-117):

```ts
const detail =
	data.eligibility.status === "cooldown"
		? `Last grant in ${data.eligibility.lastGrantMonth}`
		: data.eligibility.status === "duplicate"
			? "Already applied this month"
			: "Application window is not open";
```

Same change in `decideReview` (lines 180-183).

**Step 7: Run tests**

Run: `bun test test/integration/submitApplication.test.ts`
Expected: All pass including new window gate tests

**Step 8: Fix existing tests that pass `eligible` without an open window**

Existing tests in `submitApplication.test.ts` pass `eligibility: { status: "eligible" }` directly (bypassing `checkEligibility`), so they won't break. But the end-to-end eligibility tests that call `checkEligibility` directly will now return `window_closed` instead of `eligible`/`duplicate`/`cooldown` because no window is opened.

Fix by opening the window before those tests:

```ts
// Add to beforeEach or at start of each e2e eligibility test:
await eventStore.appendToStream("lottery-2026-03", [
	{
		type: "ApplicationWindowOpened",
		data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
	},
]);
```

For tests using different month cycles (e.g. `2026-01`, `2026-06`), open those windows too.

**Step 9: Run all tests**

Run: `bun test`
Expected: All pass

**Step 10: Commit**

```bash
git add src/domain/application/types.ts src/domain/application/checkEligibility.ts src/domain/application/decider.ts test/integration/submitApplication.test.ts
git commit -m "Reject applications with window_closed when lottery window not open"
```

---

### Task 5: Fix Integration Tests (Lottery Draw)

**Files:**
- Modify: `test/integration/lotteryDraw.test.ts`

The lottery draw integration test likely goes `initial→close→draw`. It now needs `initial→open→close→draw`.

**Step 1: Read the test file**

Read `test/integration/lotteryDraw.test.ts` to find where `CloseApplicationWindow` is used.

**Step 2: Add `OpenApplicationWindow` before `CloseApplicationWindow`**

Wherever the test closes the window, add an open step first via `appendToStream` or command handler.

**Step 3: Run tests**

Run: `bun test test/integration/lotteryDraw.test.ts`
Expected: All pass

**Step 4: Commit**

```bash
git add test/integration/lotteryDraw.test.ts
git commit -m "Update lottery draw integration test for open/close flow"
```

---

### Task 6: Format, Lint, Final Verification

**Step 1: Format and lint**

Run: `bunx biome check --write`

**Step 2: Run full test suite**

Run: `bun test`
Expected: All pass

**Step 3: Commit any formatting changes**

```bash
git add -A
git commit -m "Format and lint"
```
