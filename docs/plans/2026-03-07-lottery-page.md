# Lottery Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/lottery` page that lets volunteers open/close the application window and run the monthly lottery draw.

**Architecture:** New command handler wraps existing lottery decider. New page/route pair follows the same pattern as volunteers/applications. SSE responses via Datastar for button actions, full-page GET for initial render.

**Tech Stack:** Emmett CommandHandler, Datastar SSE, SQLite projections, Bun.serve routes

---

### Task 1: Lottery Command Handlers

**Files:**
- Create: `src/domain/lottery/commandHandlers.ts`
- Test: `test/unit/lotteryCommandHandlers.test.ts`

**Step 1: Write the failing test**

```ts
// test/unit/lotteryCommandHandlers.test.ts
import { describe, expect, test, beforeEach } from "bun:test";
import {
	getInMemoryEventStore,
	type EventStore,
} from "@event-driven-io/emmett";
import {
	openApplicationWindow,
	closeApplicationWindow,
	drawLottery,
} from "../../src/domain/lottery/commandHandlers.ts";

describe("lottery command handlers", () => {
	let eventStore: EventStore;

	beforeEach(() => {
		eventStore = getInMemoryEventStore();
	});

	test("openApplicationWindow appends ApplicationWindowOpened", async () => {
		await openApplicationWindow("2026-03", eventStore);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(1);
		expect(stream.events[0]!.type).toBe("ApplicationWindowOpened");
	});

	test("closeApplicationWindow appends ApplicationWindowClosed", async () => {
		await openApplicationWindow("2026-03", eventStore);
		await closeApplicationWindow("2026-03", eventStore);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(2);
		expect(stream.events[1]!.type).toBe("ApplicationWindowClosed");
	});

	test("drawLottery appends LotteryDrawn", async () => {
		await openApplicationWindow("2026-03", eventStore);
		await closeApplicationWindow("2026-03", eventStore);
		await drawLottery(
			"2026-03",
			"vol-1",
			200,
			0,
			40,
			[
				{ applicationId: "app-1", applicantId: "a-1" },
				{ applicationId: "app-2", applicantId: "a-2" },
			],
			eventStore,
		);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(3);
		expect(stream.events[2]!.type).toBe("LotteryDrawn");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/lotteryCommandHandlers.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```ts
// src/domain/lottery/commandHandlers.ts
import { CommandHandler } from "@event-driven-io/emmett";
import type { EventStore } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { LotteryApplicant, LotteryEvent } from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, LotteryEvent>({
	evolve,
	initialState,
});

function streamId(monthCycle: string): string {
	return `lottery-${monthCycle}`;
}

export async function openApplicationWindow(
	monthCycle: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "OpenApplicationWindow",
				data: { monthCycle, openedAt: now },
			},
			state,
		),
	);
}

export async function closeApplicationWindow(
	monthCycle: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "CloseApplicationWindow",
				data: { monthCycle, closedAt: now },
			},
			state,
		),
	);
}

export async function drawLottery(
	monthCycle: string,
	volunteerId: string,
	availableBalance: number,
	reserve: number,
	grantAmount: number,
	applicantPool: LotteryApplicant[],
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	const seed = crypto.randomUUID();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "DrawLottery",
				data: {
					monthCycle,
					volunteerId,
					availableBalance,
					reserve,
					grantAmount,
					applicantPool,
					seed,
					drawnAt: now,
				},
			},
			state,
		),
	);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/lotteryCommandHandlers.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/domain/lottery/commandHandlers.ts test/unit/lotteryCommandHandlers.test.ts
git commit -m "feat: add lottery command handlers"
```

---

### Task 2: Lottery Page Template

**Files:**
- Create: `src/web/pages/lottery.ts`
- Test: `test/unit/lotteryPage.test.ts`

**Step 1: Write the failing test**

```ts
// test/unit/lotteryPage.test.ts
import { describe, expect, test } from "bun:test";
import { lotteryPage } from "../../src/web/pages/lottery.ts";

describe("lotteryPage", () => {
	test("initial state shows Open button", () => {
		const html = lotteryPage("2026-03", "initial");
		expect(html).toContain("Open Applications");
		expect(html).toContain("No window open");
	});

	test("open state shows Close button", () => {
		const html = lotteryPage("2026-03", "open");
		expect(html).toContain("Close Applications");
		expect(html).toContain("Applications open");
	});

	test("windowClosed state shows draw form", () => {
		const html = lotteryPage("2026-03", "windowClosed");
		expect(html).toContain("Run Draw");
		expect(html).toContain("availableBalance");
		expect(html).toContain("reserve");
		expect(html).toContain("grantAmount");
	});

	test("drawn state shows link to applications", () => {
		const html = lotteryPage("2026-03", "drawn");
		expect(html).toContain("/applications?month=2026-03");
		expect(html).toContain("Lottery drawn");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/lotteryPage.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```ts
// src/web/pages/lottery.ts
import { layout } from "./layout.ts";

type LotteryStatus = "initial" | "open" | "windowClosed" | "drawn";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function statusBadge(status: LotteryStatus): string {
	const styles: Record<LotteryStatus, string> = {
		initial: "bg-gray-50 text-gray-600 border-gray-200",
		open: "bg-green-50 text-green-700 border-green-200",
		windowClosed: "bg-amber-50 text-amber-700 border-amber-200",
		drawn: "bg-blue-50 text-blue-700 border-blue-200",
	};
	const labels: Record<LotteryStatus, string> = {
		initial: "No Window",
		open: "Applications Open",
		windowClosed: "Window Closed",
		drawn: "Drawn",
	};
	return `<span class="badge ${styles[status]}">${labels[status]}</span>`;
}

function actionSection(month: string, status: LotteryStatus): string {
	switch (status) {
		case "initial":
			return `<p class="text-bark-muted mb-4">No window open for ${escapeHtml(month)}.</p>
				<button class="btn btn-primary" data-on-click="@post('/lottery/open')">Open Applications</button>`;
		case "open":
			return `<p class="text-bark-muted mb-4">Applications open for ${escapeHtml(month)}.</p>
				<button class="btn btn-primary" data-on-click="@post('/lottery/close')">Close Applications</button>`;
		case "windowClosed":
			return `<p class="text-bark-muted mb-4">Window closed for ${escapeHtml(month)}. Ready to draw.</p>
				<form data-on-submit="@post('/lottery/draw')" class="space-y-4 max-w-sm">
					<div>
						<label class="label" for="availableBalance">Available Balance</label>
						<input id="availableBalance" name="availableBalance" type="number" step="0.01" min="0" required class="input" data-bind-availableBalance />
					</div>
					<div>
						<label class="label" for="reserve">Reserve</label>
						<input id="reserve" name="reserve" type="number" step="0.01" min="0" required class="input" data-bind-reserve />
					</div>
					<div>
						<label class="label" for="grantAmount">Grant Amount</label>
						<input id="grantAmount" name="grantAmount" type="number" step="0.01" min="0.01" required class="input" data-bind-grantAmount />
					</div>
					<button type="submit" class="btn btn-primary">Run Draw</button>
				</form>`;
		case "drawn":
			return `<p class="text-bark-muted mb-4">Lottery drawn for ${escapeHtml(month)}.</p>
				<a href="/applications?month=${encodeURIComponent(month)}" class="btn btn-primary no-underline">View Results</a>`;
	}
}

export function lotteryPage(monthCycle: string, status: LotteryStatus): string {
	const body = `<div class="max-w-2xl mx-auto px-4 py-8" data-signals='{"availableBalance": "", "reserve": "", "grantAmount": ""}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Lottery</h1>
		</div>
		${statusBadge(status)}
	</div>

	<div id="lottery-content" class="card p-6">
		<h2 class="font-heading font-semibold text-lg mb-4">${escapeHtml(monthCycle)}</h2>
		${actionSection(monthCycle, status)}
	</div>
</div>`;

	return layout("Lottery", body);
}

export function lotteryContent(monthCycle: string, status: LotteryStatus): string {
	return `<div id="lottery-content" class="card p-6">
		<h2 class="font-heading font-semibold text-lg mb-4">${escapeHtml(monthCycle)}</h2>
		${actionSection(monthCycle, status)}
	</div>`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/lotteryPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/lottery.ts test/unit/lotteryPage.test.ts
git commit -m "feat: add lottery page template"
```

---

### Task 3: Lottery Routes

**Files:**
- Create: `src/web/routes/lottery.ts`

**Step 1: Write the route handler**

```ts
// src/web/routes/lottery.ts
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import {
	closeApplicationWindow,
	drawLottery,
	openApplicationWindow,
} from "../../domain/lottery/commandHandlers.ts";
import { processLotteryDrawn } from "../../domain/lottery/processManager.ts";
import type { LotteryDrawn } from "../../domain/lottery/types.ts";
import { lotteryContent, lotteryPage } from "../pages/lottery.ts";
import { patchElements, sseResponse } from "../sse.ts";

function currentMonthCycle(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

type LotteryWindowRow = { month_cycle: string; status: string };

async function getWindowStatus(
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<"initial" | "open" | "windowClosed" | "drawn"> {
	const connection = await pool.connection();
	try {
		const tableCheck = connection.querySingle<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (!tableCheck) return "initial";

		const row = connection.querySingle<LotteryWindowRow>(
			"SELECT month_cycle, status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
			[monthCycle],
		);
		if (!row) return "initial";
		if (row.status === "open") return "open";
		if (row.status === "closed") return "windowClosed";
		return "initial";
	} finally {
		connection.close();
	}
}

export function createLotteryRoutes(
	appRepo: ApplicationRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	const monthCycle = currentMonthCycle();

	return {
		async show(): Promise<Response> {
			const status = await getWindowStatus(monthCycle, pool);
			return new Response(lotteryPage(monthCycle, status), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async handleOpen(): Promise<Response> {
			await openApplicationWindow(monthCycle, eventStore);
			return sseResponse(
				patchElements(lotteryContent(monthCycle, "open")),
			);
		},

		async handleClose(): Promise<Response> {
			await closeApplicationWindow(monthCycle, eventStore);
			return sseResponse(
				patchElements(lotteryContent(monthCycle, "windowClosed")),
			);
		},

		async handleDraw(
			volunteerId: string,
			availableBalance: number,
			reserve: number,
			grantAmount: number,
		): Promise<Response> {
			const applications = await appRepo.listByMonth(monthCycle);
			const applicantPool = applications
				.filter((a) => a.status === "accepted")
				.map((a) => ({
					applicationId: a.id,
					applicantId: a.applicantId,
				}));

			await drawLottery(
				monthCycle,
				volunteerId,
				availableBalance,
				reserve,
				grantAmount,
				applicantPool,
				eventStore,
			);

			// Read back the LotteryDrawn event to feed the process manager
			const stream = await eventStore.readStream(`lottery-${monthCycle}`);
			const drawnEvent = stream.events.find(
				(e) => e.type === "LotteryDrawn",
			) as LotteryDrawn | undefined;
			if (drawnEvent) {
				await processLotteryDrawn(drawnEvent, eventStore);
			}

			return Response.redirect(`/applications?month=${monthCycle}`, 303);
		},
	};
}
```

Note: `getWindowStatus` doesn't detect "drawn" state from the projection. The `lotteryWindow` projection only tracks "open"/"closed". We need to also check the event stream or extend the projection. For simplicity, we'll check the event stream.

Actually — let's update `getWindowStatus` to check the event stream for `LotteryDrawn`:

The simpler approach: extend the lottery_windows projection to track "drawn" status too.

**Step 2: Commit**

```bash
git add src/web/routes/lottery.ts
git commit -m "feat: add lottery route handlers"
```

---

### Task 4: Extend Lottery Window Projection for "drawn" Status

**Files:**
- Modify: `src/infrastructure/projections/lotteryWindow.ts`

**Step 1: Update projection to handle LotteryDrawn**

Add `"LotteryDrawn"` to canHandle array and add a case that sets status to `'drawn'`.

```ts
// Updated canHandle:
canHandle: ["ApplicationWindowOpened", "ApplicationWindowClosed", "LotteryDrawn"],

// Add to handle switch:
case "LotteryDrawn":
    await connection.command(
        `UPDATE lottery_windows SET status = 'drawn' WHERE month_cycle = ?`,
        [data.monthCycle],
    );
    break;
```

**Step 2: Update `getWindowStatus` in routes to check for "drawn"**

Add `if (row.status === "drawn") return "drawn";` to the status check.

**Step 3: Commit**

```bash
git add src/infrastructure/projections/lotteryWindow.ts src/web/routes/lottery.ts
git commit -m "feat: track drawn status in lottery window projection"
```

---

### Task 5: Wire Routes into Server

**Files:**
- Modify: `src/web/server.ts`

**Step 1: Add lottery routes**

Import `createLotteryRoutes` and `SQLiteApplicationRepository`. Add routes:

- `GET /lottery` → `lotteryRoutes.show()`
- `POST /lottery/open` → `lotteryRoutes.handleOpen()`
- `POST /lottery/close` → `lotteryRoutes.handleClose()`
- `POST /lottery/draw` → parse form body, call `lotteryRoutes.handleDraw()`

Wire in `startServer`:

```ts
const lotteryRoutes = createLotteryRoutes(appRepo, eventStore, pool);
```

Add to `routes` object:

```ts
"/lottery": {
    GET: async (req) => {
        const volunteer = await requireAuth(req);
        if (!volunteer) return Response.redirect("/login", 302);
        return lotteryRoutes.show();
    },
},
```

Add to `fetch` handler for POST routes:

```ts
if (url.pathname === "/lottery/open" && req.method === "POST") {
    return lotteryRoutes.handleOpen();
}
if (url.pathname === "/lottery/close" && req.method === "POST") {
    return lotteryRoutes.handleClose();
}
if (url.pathname === "/lottery/draw" && req.method === "POST") {
    const signals = await req.json();
    const balance = Number(signals.availableBalance);
    const reserve = Number(signals.reserve);
    const grant = Number(signals.grantAmount);
    if ([balance, reserve, grant].some(Number.isNaN)) {
        return new Response("Invalid input", { status: 400 });
    }
    return lotteryRoutes.handleDraw(volunteer.id, balance, reserve, grant);
}
```

**Step 2: Commit**

```bash
git add src/web/server.ts
git commit -m "feat: wire lottery routes into server"
```

---

### Task 6: End-to-End Test

**Files:**
- Create: `test/e2e/lottery.test.ts`
- Reference: `test/e2e/createRecipient.test.ts` for test setup patterns

**Step 1: Write E2E test covering full lifecycle**

Test flow: login → open window → close window → draw → verify redirect to applications.

Use the same test server setup pattern as existing E2E tests. Seed the DB with an accepted application for the current month so the draw has something to select.

**Step 2: Run test**

Run: `bun test test/e2e/lottery.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add test/e2e/lottery.test.ts
git commit -m "test: add lottery lifecycle e2e test"
```

---

### Task 7: Run Full Test Suite and Lint

**Step 1: Lint**

Run: `bunx biome check --write`

**Step 2: Run all tests**

Run: `bun test`
Expected: All pass

**Step 3: Commit any formatting fixes**

```bash
git add -A
git commit -m "style: format lottery files"
```
