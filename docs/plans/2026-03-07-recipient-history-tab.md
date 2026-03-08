# Recipient History Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "History" tab to the recipient edit panel showing a timeline of events (created, updated, deleted) with volunteer names and timestamps.

**Architecture:** Add a new route `GET /recipients/:id/history` that reads the event stream for a recipient, resolves volunteer names, and returns an SSE patch with the history timeline HTML. The edit panel gets tabs ("Details" | "History") using Datastar signals. The history tab content is lazy-loaded on first click via `@get`. The `volunteerRepo` is passed to `createRecipientRoutes` so it can resolve volunteer IDs to names.

**Tech Stack:** Emmett event store (`readStream`), Datastar (signals, `data-show`, `data-on-click`), server-sent HTML (SSE patches)

---

### Task 1: Add `historyPanel` renderer

**Files:**
- Create: `src/web/pages/recipientHistoryPanel.ts`
- Test: `test/unit/recipientHistoryPanel.test.ts`

**Step 1: Write the failing test**

```ts
// test/unit/recipientHistoryPanel.test.ts
import { describe, expect, test } from "bun:test";
import { historyPanel } from "../../src/web/pages/recipientHistoryPanel";

describe("historyPanel", () => {
	test("renders timeline with created event", () => {
		const html = historyPanel([
			{
				type: "RecipientCreated",
				volunteerName: "Sarah",
				timestamp: "2026-03-01T10:00:00.000Z",
			},
		]);
		expect(html).toContain("Created");
		expect(html).toContain("Sarah");
		expect(html).toContain("1 Mar 2026");
	});

	test("renders timeline with updated event", () => {
		const html = historyPanel([
			{
				type: "RecipientUpdated",
				volunteerName: "Jon",
				timestamp: "2026-03-05T14:30:00.000Z",
			},
		]);
		expect(html).toContain("Updated");
		expect(html).toContain("Jon");
		expect(html).toContain("5 Mar 2026");
	});

	test("renders created via application when no volunteer", () => {
		const html = historyPanel([
			{
				type: "RecipientCreated",
				volunteerName: null,
				timestamp: "2026-03-01T10:00:00.000Z",
			},
		]);
		expect(html).toContain("Created via application");
	});

	test("renders events in order (newest first)", () => {
		const html = historyPanel([
			{
				type: "RecipientCreated",
				volunteerName: "Sarah",
				timestamp: "2026-03-01T10:00:00.000Z",
			},
			{
				type: "RecipientUpdated",
				volunteerName: "Jon",
				timestamp: "2026-03-05T14:30:00.000Z",
			},
		]);
		const createdIdx = html.indexOf("Created");
		const updatedIdx = html.indexOf("Updated");
		// newest first
		expect(updatedIdx).toBeLessThan(createdIdx);
	});

	test("renders empty state when no events", () => {
		const html = historyPanel([]);
		expect(html).toContain("No history");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/recipientHistoryPanel.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```ts
// src/web/pages/recipientHistoryPanel.ts
export type HistoryEntry = {
	type: "RecipientCreated" | "RecipientUpdated" | "RecipientDeleted";
	volunteerName: string | null;
	timestamp: string;
};

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function eventLabel(entry: HistoryEntry): string {
	switch (entry.type) {
		case "RecipientCreated":
			return entry.volunteerName
				? `Created by <span class="font-semibold text-bark">${entry.volunteerName}</span>`
				: "Created via application";
		case "RecipientUpdated":
			return `Updated by <span class="font-semibold text-bark">${entry.volunteerName ?? "unknown"}</span>`;
		case "RecipientDeleted":
			return `Deleted by <span class="font-semibold text-bark">${entry.volunteerName ?? "unknown"}</span>`;
	}
}

function eventIcon(type: HistoryEntry["type"]): string {
	switch (type) {
		case "RecipientCreated":
			return `<div class="w-2 h-2 rounded-full bg-green-500"></div>`;
		case "RecipientUpdated":
			return `<div class="w-2 h-2 rounded-full bg-amber"></div>`;
		case "RecipientDeleted":
			return `<div class="w-2 h-2 rounded-full bg-red-500"></div>`;
	}
}

export function historyPanel(entries: HistoryEntry[]): string {
	if (entries.length === 0) {
		return `<div id="history-content" class="py-8 text-center text-bark-muted text-sm">No history</div>`;
	}

	const sorted = [...entries].reverse();

	const items = sorted
		.map(
			(entry) => `
		<div class="flex items-start gap-3 py-3">
			<div class="mt-1.5">${eventIcon(entry.type)}</div>
			<div>
				<p class="text-sm font-body text-bark-muted">${eventLabel(entry)}</p>
				<p class="text-xs text-bark-muted/60 mt-0.5">${formatDate(entry.timestamp)} at ${formatTime(entry.timestamp)}</p>
			</div>
		</div>`,
		)
		.join("");

	return `<div id="history-content" class="divide-y divide-cream-200">${items}</div>`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/recipientHistoryPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/recipientHistoryPanel.ts test/unit/recipientHistoryPanel.test.ts
git commit -m "feat: add recipient history panel renderer"
```

---

### Task 2: Add tabs to recipient edit panel

**Files:**
- Modify: `src/web/pages/recipientPanel.ts`
- Modify: `test/unit/recipientPanel.test.ts`

**Step 1: Write the failing tests**

Add to `test/unit/recipientPanel.test.ts`:

```ts
describe("editPanel tabs", () => {
	test("renders Details and History tabs", () => {
		const html = editPanel(alice);
		expect(html).toContain("Details");
		expect(html).toContain("History");
	});

	test("defaults to Details tab active", () => {
		const html = editPanel(alice);
		expect(html).toContain("activeTab: 'details'");
	});

	test("History tab triggers lazy load", () => {
		const html = editPanel(alice);
		expect(html).toContain(`/recipients/${alice.id}/history`);
	});

	test("Details content shown when details tab active", () => {
		const html = editPanel(alice);
		expect(html).toContain("data-show=\"$activeTab==='details'\"");
	});

	test("History content shown when history tab active", () => {
		const html = editPanel(alice);
		expect(html).toContain("data-show=\"$activeTab==='history'\"");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/recipientPanel.test.ts`
Expected: FAIL — no "Details" or "History" text, no `activeTab` signal

**Step 3: Implement tabs in editPanel**

Modify `src/web/pages/recipientPanel.ts` — update `editPanel` function:

The `editPanel` function should:
1. Add `activeTab: 'details'` and `historyLoaded: false` to the outer `data-signals`
2. Add tab bar below the header (before form)
3. Wrap existing form + delete section in a `data-show="$activeTab==='details'"` div
4. Add a `data-show="$activeTab==='history'"` div with a `<div id="history-content">` placeholder
5. History tab click: set `$activeTab = 'history'` and conditionally trigger `@get('/recipients/${r.id}/history')` if `!$historyLoaded`

The tab bar HTML (insert between the header and form):

```ts
const tabClass = (tab: string) =>
	`px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 ${
		`\${$activeTab==='${tab}' ? 'border-amber text-amber' : 'border-transparent text-bark-muted hover:text-bark'}`
	}`;
```

Actually, since these are server-rendered strings with Datastar, use `data-class` for active state. Simpler approach — use two static buttons with `data-on-click` to switch tabs, and use `data-class` to toggle the active underline:

```html
<div class="flex gap-1 mb-4 border-b border-cream-200">
  <button type="button"
    class="px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 border-transparent text-bark-muted hover:text-bark"
    data-class-border-amber="$activeTab==='details'"
    data-class-text-amber="$activeTab==='details'"
    data-on-click="$activeTab='details'">Details</button>
  <button type="button"
    class="px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 border-transparent text-bark-muted hover:text-bark"
    data-class-border-amber="$activeTab==='history'"
    data-class-text-amber="$activeTab==='history'"
    data-on-click="$activeTab='history'; if(!$historyLoaded){$historyLoaded=true; @get('/recipients/${r.id}/history')}">History</button>
</div>
```

Wrap the existing form and delete section in:
```html
<div data-show="$activeTab==='details'">
  <!-- existing form + delete -->
</div>
<div data-show="$activeTab==='history'" style="display:none">
  <div id="history-content" class="py-8 text-center text-bark-muted text-sm">Loading...</div>
</div>
```

Add signals to the outermost `data-signals` wrapping the entire editPanel content (add a new wrapper div around everything inside panelWrapper):

```html
<div data-signals="{activeTab: 'details', historyLoaded: false}">
  <!-- header, tabs, details div, history div -->
</div>
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/recipientPanel.test.ts`
Expected: PASS (all old + new tests)

**Step 5: Commit**

```bash
git add src/web/pages/recipientPanel.ts test/unit/recipientPanel.test.ts
git commit -m "feat: add Details/History tabs to recipient edit panel"
```

---

### Task 3: Add history route

**Files:**
- Modify: `src/web/routes/recipients.ts` — add `volunteerRepo` param and `history` method
- Modify: `src/web/server.ts` — pass `volunteerRepo` to `createRecipientRoutes`, add route
- Test: `test/integration/recipientRoutes.test.ts`

**Step 1: Write the failing test**

Add to `test/integration/recipientRoutes.test.ts`:

The test setup needs `volunteerRepo` — check if it's already available. If not, add it. Then add:

```ts
import {
	createRecipient,
	updateRecipient,
} from "../../src/domain/recipient/commandHandlers";
```

(createRecipient may already be imported — add updateRecipient if missing)

Add a `volunteerRepo` to the beforeEach setup:

```ts
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository";
import { createVolunteer } from "../../src/domain/volunteer/commandHandlers";
```

In `beforeEach`:
```ts
volunteerRepo = await SQLiteVolunteerRepository(pool);
routes = createRecipientRoutes(recipientRepo, volunteerRepo, eventStore);
```

Update the existing `routes = createRecipientRoutes(recipientRepo, eventStore)` to include `volunteerRepo`.

Add test:

```ts
describe("history", () => {
	test("returns timeline with events and volunteer names", async () => {
		// Create a volunteer
		const { id: volId } = await createVolunteer(
			{ name: "Sarah", password: "pass123" },
			eventStore,
		);

		// Create a recipient
		const { id: recipientId } = await createRecipient(
			{ phone: "07700900001", name: "Alice", volunteerId: volId },
			eventStore,
		);

		// Update the recipient
		await updateRecipient(
			recipientId,
			volId,
			{ name: "Alice Updated" },
			eventStore,
		);

		const res = await routes.history(recipientId);
		const body = await res.text();
		expect(body).toContain("datastar-patch-elements");
		expect(body).toContain("Sarah");
		expect(body).toContain("Created");
		expect(body).toContain("Updated");
	});

	test("returns 404 for unknown recipient", async () => {
		const res = await routes.history("nonexistent");
		expect(res.status).toBe(404);
	});

	test("shows 'via application' when no volunteerId", async () => {
		const { id } = await createRecipient(
			{ phone: "07700900002", name: "Bob" },
			eventStore,
		);
		const res = await routes.history(id);
		const body = await res.text();
		expect(body).toContain("Created via application");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/recipientRoutes.test.ts`
Expected: FAIL — `routes.history` is not a function / wrong arity for `createRecipientRoutes`

**Step 3: Implement the history route**

Modify `src/web/routes/recipients.ts`:

1. Add imports:
```ts
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type { RecipientEvent } from "../../domain/recipient/types.ts";
import { historyPanel, type HistoryEntry } from "../pages/recipientHistoryPanel.ts";
```

2. Change function signature:
```ts
export function createRecipientRoutes(
	recipientRepo: RecipientRepository,
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
```

3. Add `history` method to the returned object:
```ts
async history(id: string): Promise<Response> {
	const { events } = await eventStore.readStream<RecipientEvent>(
		`recipient-${id}`,
	);
	if (events.length === 0) return new Response("Not found", { status: 404 });

	const volunteerIds = new Set(
		events
			.map((e) => e.data.volunteerId)
			.filter((id): id is string => !!id),
	);

	const volunteerNames = new Map<string, string>();
	for (const vid of volunteerIds) {
		const vol = await volunteerRepo.getById(vid);
		if (vol) volunteerNames.set(vid, vol.name);
	}

	const entries: HistoryEntry[] = events.map((e) => {
		const volunteerId = e.data.volunteerId;
		return {
			type: e.type,
			volunteerName: volunteerId
				? (volunteerNames.get(volunteerId) ?? "unknown")
				: null,
			timestamp:
				e.data.createdAt ?? e.data.updatedAt ?? e.data.deletedAt,
		};
	});

	return sseResponse(patchElements(historyPanel(entries)));
},
```

**Step 4: Update server.ts**

In `src/web/server.ts`, update the `createRecipientRoutes` call:

```ts
const recipientRoutes = createRecipientRoutes(recipientRepo, volunteerRepo, eventStore);
```

Add the route in the `fetch` handler, before the existing `editMatch`:

```ts
const historyMatch = url.pathname.match(/^\/recipients\/([^/]+)\/history$/);
if (historyMatch?.[1] && req.method === "GET") {
	return recipientRoutes.history(historyMatch[1]);
}
```

**Step 5: Run test to verify it passes**

Run: `bun test test/integration/recipientRoutes.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/web/routes/recipients.ts src/web/server.ts test/integration/recipientRoutes.test.ts
git commit -m "feat: add recipient history route with volunteer name resolution"
```

---

### Task 4: Run full test suite and lint

**Step 1: Run all tests**

Run: `bun test`
Expected: All pass. If any existing tests break due to `createRecipientRoutes` signature change, update their setup to pass `volunteerRepo` (or a mock).

**Step 2: Lint and format**

Run: `bunx biome check --write`

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: update tests and formatting for recipient history"
```
