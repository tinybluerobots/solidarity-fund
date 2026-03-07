# Recipients Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a recipients manager page at `/recipients` with table view, slide-out detail panel, and full CRUD via Datastar SSE.

**Architecture:** Server-rendered HTML page with Datastar for interactivity. SSE endpoints return `datastar-patch-elements` events to morph the slide-out panel. Client-side search filters table rows via Datastar signals. All mutations go through the existing event-sourced command handlers.

**Tech Stack:** Bun, TypeScript, Tailwind CSS 4, Datastar v1.0.0-RC.8 (SSE protocol, no SDK), Emmett event store, SQLite.

---

### Task 1: SSE helper utility

**Files:**
- Create: `src/web/sse.ts`
- Test: `test/unit/sse.test.ts`

**Context:** Datastar expects raw SSE events in this format:
```
event: datastar-patch-elements\ndata: elements <div>...</div>\n\n
event: datastar-patch-signals\ndata: signals {key: value}\n\n
```
We need a tiny helper to format these. No SDK exists for JS/TS.

**Step 1: Write the failing test**

```ts
// test/unit/sse.test.ts
import { describe, test, expect } from "bun:test";
import { patchElements, patchSignals, sseResponse, sseStream } from "../../src/web/sse";

describe("SSE helpers", () => {
	test("patchElements formats a single fragment", () => {
		const result = patchElements('<div id="panel">Hello</div>');
		expect(result).toBe('event: datastar-patch-elements\ndata: elements <div id="panel">Hello</div>\n\n');
	});

	test("patchElements with mode and selector", () => {
		const result = patchElements("<p>Hi</p>", { selector: "#target", mode: "inner" });
		expect(result).toBe(
			"event: datastar-patch-elements\ndata: selector #target\ndata: mode inner\ndata: elements <p>Hi</p>\n\n"
		);
	});

	test("patchElements handles multiline HTML", () => {
		const html = '<div id="x">\n  <p>Line1</p>\n  <p>Line2</p>\n</div>';
		const result = patchElements(html);
		expect(result).toContain("data: elements <div");
		expect(result).toContain("data: elements   <p>Line1</p>");
	});

	test("patchSignals formats signals object", () => {
		const result = patchSignals({ search: "", panelOpen: false });
		expect(result).toBe('event: datastar-patch-signals\ndata: signals {"search":"","panelOpen":false}\n\n');
	});

	test("sseResponse creates Response with correct headers", () => {
		const res = sseResponse("event: datastar-patch-elements\ndata: elements <div>hi</div>\n\n");
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
		expect(res.headers.get("Cache-Control")).toBe("no-cache");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/sse.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// src/web/sse.ts
type PatchOptions = {
	selector?: string;
	mode?: "outer" | "inner" | "replace" | "prepend" | "append" | "before" | "after" | "remove";
};

export function patchElements(html: string, options?: PatchOptions): string {
	let event = "event: datastar-patch-elements\n";
	if (options?.selector) event += `data: selector ${options.selector}\n`;
	if (options?.mode) event += `data: mode ${options.mode}\n`;
	const lines = html.split("\n");
	for (const line of lines) {
		event += `data: elements ${line}\n`;
	}
	event += "\n";
	return event;
}

export function patchSignals(signals: Record<string, unknown>): string {
	return `event: datastar-patch-signals\ndata: signals ${JSON.stringify(signals)}\n\n`;
}

export function sseResponse(...events: string[]): Response {
	return new Response(events.join(""), {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
		},
	});
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/sse.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/sse.ts test/unit/sse.test.ts
git commit -m "Add SSE helper utilities for Datastar protocol"
```

---

### Task 2: Recipients page HTML (static table + empty state)

**Files:**
- Create: `src/web/pages/recipients.ts`
- Test: `test/unit/recipientsPage.test.ts`

**Context:** Follow the patterns in `src/web/pages/dashboard.ts` and `src/web/pages/login.ts`. Use `layout()` wrapper. The page needs Datastar signals for search and panel state.

**Step 1: Write the failing test**

```ts
// test/unit/recipientsPage.test.ts
import { describe, test, expect } from "bun:test";
import { recipientsPage } from "../../src/web/pages/recipients";
import type { Recipient } from "../../src/domain/recipient/types";

const alice: Recipient = {
	id: "r-1",
	phone: "07700900001",
	name: "Alice Smith",
	email: "alice@example.com",
	paymentPreference: "bank",
	bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
	notes: "Prefers mornings",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Recipient = {
	id: "r-2",
	phone: "07700900002",
	name: "Bob Jones",
	paymentPreference: "cash",
	meetingPlace: "Mill Road",
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("recipientsPage", () => {
	test("renders table with recipients", () => {
		const html = recipientsPage([alice, bob]);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("Bob Jones");
		expect(html).toContain("07700900001");
		expect(html).toContain("07700900002");
	});

	test("renders empty state when no recipients", () => {
		const html = recipientsPage([]);
		expect(html).toContain("No recipients yet");
	});

	test("renders payment preference badges", () => {
		const html = recipientsPage([alice, bob]);
		expect(html).toContain("Bank");
		expect(html).toContain("Cash");
	});

	test("includes Datastar signals for search", () => {
		const html = recipientsPage([alice]);
		expect(html).toContain("data-signals");
		expect(html).toContain("search");
	});

	test("includes search input with data-bind", () => {
		const html = recipientsPage([alice]);
		expect(html).toContain("data-bind:search");
	});

	test("includes Add Recipient button", () => {
		const html = recipientsPage([]);
		expect(html).toContain("Add Recipient");
	});

	test("table rows have data-on-click for SSE fetch", () => {
		const html = recipientsPage([alice]);
		expect(html).toContain("@get");
		expect(html).toContain("/recipients/r-1");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/recipientsPage.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// src/web/pages/recipients.ts
import type { Recipient } from "../../domain/recipient/types.ts";
import { layout } from "./layout.ts";

export function recipientsPage(recipients: Recipient[]): string {
	return layout(
		"Recipients",
		`
	<div class="max-w-4xl mx-auto px-4 py-8" data-signals="{search: ''}">
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm no-underline">&larr; Dashboard</a>
				<h1 class="font-heading font-bold text-2xl">Recipients</h1>
			</div>
			<button
				data-on-click="@get('/recipients/new')"
				class="px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark"
			>
				Add Recipient
			</button>
		</div>

		<div class="mb-4">
			<input
				type="text"
				placeholder="Search recipients..."
				data-bind:search
				class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
			>
		</div>

		${recipients.length === 0 ? emptyState() : recipientTable(recipients)}

		<div id="panel"></div>
	</div>
`,
	);
}

function emptyState(): string {
	return `<div class="text-center py-12 text-bark-muted">
		<p class="text-lg mb-1">No recipients yet</p>
		<p class="text-sm">Add a recipient to get started.</p>
	</div>`;
}

function recipientTable(recipients: Recipient[]): string {
	return `<div class="bg-cream-50 border border-cream-200 rounded-xl overflow-hidden shadow-sm">
		<table class="w-full">
			<thead>
				<tr class="border-b border-cream-200 text-left">
					<th class="px-4 py-3 font-heading font-semibold text-sm text-bark-muted">Name</th>
					<th class="px-4 py-3 font-heading font-semibold text-sm text-bark-muted">Phone</th>
					<th class="px-4 py-3 font-heading font-semibold text-sm text-bark-muted">Payment</th>
					<th class="px-4 py-3 font-heading font-semibold text-sm text-bark-muted">Added</th>
				</tr>
			</thead>
			<tbody id="recipient-rows">
				${recipients.map(recipientRow).join("")}
			</tbody>
		</table>
	</div>`;
}

function recipientRow(r: Recipient): string {
	const paymentBadge =
		r.paymentPreference === "bank"
			? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Bank</span>'
			: '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Cash</span>';

	const added = formatDate(r.createdAt);

	return `<tr
		data-on-click="@get('/recipients/${r.id}')"
		data-show="$search === '' || '${escapeAttr(r.name.toLowerCase())}'.includes($search.toLowerCase()) || '${escapeAttr(r.phone)}'.includes($search)"
		class="border-b border-cream-200 last:border-b-0 hover:bg-cream-100 cursor-pointer transition-colors"
	>
		<td class="px-4 py-3 font-semibold text-bark">${escapeHtml(r.name)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${escapeHtml(r.phone)}</td>
		<td class="px-4 py-3">${paymentBadge}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${added}</td>
	</tr>`;
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
	return s.replace(/'/g, "\\'").replace(/\\/g, "\\\\");
}

export { recipientRow };
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/recipientsPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/recipients.ts test/unit/recipientsPage.test.ts
git commit -m "Add recipients page with table view and client-side search"
```

---

### Task 3: Detail panel HTML fragments (view, edit, create)

**Files:**
- Create: `src/web/pages/recipientPanel.ts`
- Test: `test/unit/recipientPanel.test.ts`

**Context:** These functions return HTML fragments (NOT full pages). They are sent as SSE `datastar-patch-elements` payloads to morph into `<div id="panel">`. The panel slides in from the right using a CSS transition.

**Step 1: Write the failing test**

```ts
// test/unit/recipientPanel.test.ts
import { describe, test, expect } from "bun:test";
import { viewPanel, editPanel, createPanel } from "../../src/web/pages/recipientPanel";
import type { Recipient } from "../../src/domain/recipient/types";

const alice: Recipient = {
	id: "r-1",
	phone: "07700900001",
	name: "Alice Smith",
	email: "alice@example.com",
	paymentPreference: "bank",
	bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
	notes: "Prefers mornings",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Recipient = {
	id: "r-2",
	phone: "07700900002",
	name: "Bob Jones",
	paymentPreference: "cash",
	meetingPlace: "Mill Road",
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("viewPanel", () => {
	test("shows recipient name as heading", () => {
		const html = viewPanel(alice);
		expect(html).toContain("Alice Smith");
	});

	test("shows all fields for bank recipient", () => {
		const html = viewPanel(alice);
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
		expect(html).toContain("Bank");
		expect(html).toContain("12-34-56");
		expect(html).toContain("12345678");
		expect(html).toContain("Prefers mornings");
	});

	test("shows meeting place for cash recipient", () => {
		const html = viewPanel(bob);
		expect(html).toContain("Mill Road");
		expect(html).toContain("Cash");
	});

	test("has Edit and Delete buttons", () => {
		const html = viewPanel(alice);
		expect(html).toContain("Edit");
		expect(html).toContain("Delete");
	});

	test("has close button", () => {
		const html = viewPanel(alice);
		expect(html).toContain("Close");
	});
});

describe("editPanel", () => {
	test("renders form with pre-filled values", () => {
		const html = editPanel(alice);
		expect(html).toContain('value="Alice Smith"');
		expect(html).toContain('value="07700900001"');
		expect(html).toContain('value="alice@example.com"');
	});

	test("has Save and Cancel buttons", () => {
		const html = editPanel(alice);
		expect(html).toContain("Save");
		expect(html).toContain("Cancel");
	});

	test("uses @put for existing recipient", () => {
		const html = editPanel(alice);
		expect(html).toContain("@put");
		expect(html).toContain("/recipients/r-1");
	});
});

describe("createPanel", () => {
	test("renders empty form", () => {
		const html = createPanel();
		expect(html).toContain('value=""');
	});

	test("has Create and Cancel buttons", () => {
		const html = createPanel();
		expect(html).toContain("Create");
		expect(html).toContain("Cancel");
	});

	test("uses @post for new recipient", () => {
		const html = createPanel();
		expect(html).toContain("@post");
		expect(html).toContain("/recipients");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/recipientPanel.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// src/web/pages/recipientPanel.ts
import type { Recipient } from "../../domain/recipient/types.ts";

function panelWrapper(content: string): string {
	return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
	<div class="p-6">
		${content}
	</div>
	<style>
		@keyframes slideIn {
			from { transform: translateX(100%); }
			to { transform: translateX(0); }
		}
	</style>
</div>`;
}

function closeButton(): string {
	return `<button
		data-on-click="document.getElementById('panel').innerHTML = ''"
		class="text-bark-muted hover:text-bark text-sm cursor-pointer bg-transparent border-none font-body"
	>Close</button>`;
}

function fieldLabel(text: string): string {
	return `<label class="block text-xs font-semibold text-bark-muted uppercase tracking-wide mb-1">${text}</label>`;
}

function fieldValue(text: string | undefined): string {
	return `<p class="text-bark mb-4">${text ? escapeHtml(text) : '<span class="text-bark-muted italic">Not set</span>'}</p>`;
}

function paymentBadge(pref: string): string {
	if (pref === "bank") {
		return '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">Bank</span>';
	}
	return '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Cash</span>';
}

export function viewPanel(r: Recipient): string {
	const bankSection =
		r.paymentPreference === "bank" && r.bankDetails
			? `${fieldLabel("Sort Code")}${fieldValue(r.bankDetails.sortCode)}
			   ${fieldLabel("Account Number")}${fieldValue(r.bankDetails.accountNumber)}`
			: "";

	const meetingSection =
		r.paymentPreference === "cash" && r.meetingPlace
			? `${fieldLabel("Meeting Place")}${fieldValue(r.meetingPlace)}`
			: "";

	return panelWrapper(`
		<div class="flex items-center justify-between mb-6">
			<h2 class="font-heading font-bold text-xl">${escapeHtml(r.name)}</h2>
			${closeButton()}
		</div>

		${fieldLabel("Phone")}${fieldValue(r.phone)}
		${fieldLabel("Email")}${fieldValue(r.email)}
		${fieldLabel("Payment Preference")}
		<p class="mb-4">${paymentBadge(r.paymentPreference)}</p>
		${bankSection}
		${meetingSection}
		${fieldLabel("Notes")}${fieldValue(r.notes)}

		<div class="flex gap-3 mt-6 pt-4 border-t border-cream-200">
			<button
				data-on-click="@get('/recipients/${r.id}/edit')"
				class="px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent"
			>Edit</button>
			<div id="delete-area">
				<button
					data-on-click="document.getElementById('delete-area').innerHTML = document.getElementById('delete-confirm-tpl').innerHTML"
					class="px-4 py-2 rounded-md font-heading font-semibold text-sm text-red-600 hover:text-red-700 cursor-pointer bg-transparent border-none"
				>Delete</button>
			</div>
		</div>
		<template id="delete-confirm-tpl">
			<span class="text-sm text-bark-muted mr-2">Are you sure?</span>
			<button
				data-on-click="@delete('/recipients/${r.id}')"
				class="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors"
			>Confirm</button>
			<button
				data-on-click="@get('/recipients/${r.id}')"
				class="px-3 py-1 rounded-md text-sm text-bark-muted cursor-pointer bg-transparent border-none hover:text-bark"
			>Cancel</button>
		</template>
	`);
}

function inputField(name: string, label: string, value: string, opts: { type?: string; required?: boolean } = {}): string {
	const type = opts.type ?? "text";
	const req = opts.required ? "required" : "";
	return `${fieldLabel(label)}
	<input
		type="${type}"
		name="${name}"
		value="${escapeHtml(value)}"
		${req}
		class="w-full px-3 py-2 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-4 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
	>`;
}

function recipientForm(r: Partial<Recipient>, action: { method: string; url: string; submitLabel: string }): string {
	const name = r.name ?? "";
	const phone = r.phone ?? "";
	const email = r.email ?? "";
	const pref = r.paymentPreference ?? "cash";
	const sortCode = r.bankDetails?.sortCode ?? "";
	const accountNumber = r.bankDetails?.accountNumber ?? "";
	const meetingPlace = r.meetingPlace ?? "";
	const notes = r.notes ?? "";

	return panelWrapper(`
		<div class="flex items-center justify-between mb-6">
			<h2 class="font-heading font-bold text-xl">${action.submitLabel === "Create" ? "New Recipient" : "Edit Recipient"}</h2>
			${closeButton()}
		</div>

		<div
			data-signals="{formPref: '${pref}'}"
			data-on-submit__prevent="@${action.method}('${action.url}')"
		>
			${inputField("name", "Name", name, { required: true })}
			${inputField("phone", "Phone", phone, { type: "tel", required: true })}
			${inputField("email", "Email", email, { type: "email" })}

			${fieldLabel("Payment Preference")}
			<div class="flex gap-4 mb-4">
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input type="radio" name="paymentPreference" value="bank" ${pref === "bank" ? "checked" : ""} data-on-change="$formPref = 'bank'" class="accent-amber">
					Bank
				</label>
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input type="radio" name="paymentPreference" value="cash" ${pref === "cash" ? "checked" : ""} data-on-change="$formPref = 'cash'" class="accent-amber">
					Cash
				</label>
			</div>

			<div data-show="$formPref === 'bank'">
				${inputField("sortCode", "Sort Code", sortCode)}
				${inputField("accountNumber", "Account Number", accountNumber)}
			</div>

			<div data-show="$formPref === 'cash'">
				${inputField("meetingPlace", "Meeting Place", meetingPlace)}
			</div>

			${fieldLabel("Notes")}
			<textarea
				name="notes"
				rows="3"
				class="w-full px-3 py-2 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-4 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15 resize-y"
			>${escapeHtml(notes)}</textarea>

			<div class="flex gap-3 mt-2">
				<button
					type="submit"
					class="px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none"
				>${action.submitLabel}</button>
				<button
					type="button"
					data-on-click="document.getElementById('panel').innerHTML = ''"
					class="px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent"
				>Cancel</button>
			</div>
		</div>
	`);
}

export function editPanel(r: Recipient): string {
	return recipientForm(r, { method: "put", url: `/recipients/${r.id}`, submitLabel: "Save" });
}

export function createPanel(): string {
	return recipientForm({}, { method: "post", url: "/recipients", submitLabel: "Create" });
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/recipientPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/recipientPanel.ts test/unit/recipientPanel.test.ts
git commit -m "Add recipient detail panel fragments (view, edit, create)"
```

---

### Task 4: Route handlers

**Files:**
- Create: `src/web/routes/recipients.ts`
- Test: `test/integration/recipientRoutes.test.ts`

**Context:** Route handlers need access to `recipientRepo`, `eventStore`, and auth (to get the volunteer ID for audit trail). Follow the pattern in `src/web/routes/auth.ts`. SSE endpoints return `sseResponse()` with `patchElements()`. Mutation endpoints (POST/PUT/DELETE) call the existing command handlers, then return updated HTML via SSE.

Important: The `getAuthenticatedVolunteer` function is in `src/web/server.ts`. Recipient command handlers are in `src/domain/recipient/commandHandlers.ts`.

**Step 1: Write the failing test**

```ts
// test/integration/recipientRoutes.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createRecipient } from "../../src/domain/recipient/commandHandlers";
import type { RecipientRepository } from "../../src/domain/recipient/repository";
import { createEventStore } from "../../src/infrastructure/eventStore";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository";
import { createRecipientRoutes } from "../../src/web/routes/recipients";

describe("recipient routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let recipientRepo: RecipientRepository;
	let routes: ReturnType<typeof createRecipientRoutes>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		recipientRepo = await SQLiteRecipientRepository(pool);
		routes = createRecipientRoutes(recipientRepo, eventStore);
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("GET /recipients (list page)", () => {
		test("returns HTML page with recipients", async () => {
			await createRecipient({ phone: "07700900001", name: "Alice" }, eventStore);
			const res = await routes.list();
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Alice");
			expect(html).toContain("Recipients");
		});

		test("returns empty state when no recipients", async () => {
			const res = await routes.list();
			const html = await res.text();
			expect(html).toContain("No recipients yet");
		});
	});

	describe("GET /recipients/:id (detail SSE)", () => {
		test("returns SSE with view panel", async () => {
			const { id } = await createRecipient({ phone: "07700900001", name: "Alice" }, eventStore);
			const res = await routes.detail(id);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
			const body = await res.text();
			expect(body).toContain("Alice");
			expect(body).toContain("datastar-patch-elements");
		});

		test("returns 404 for unknown id", async () => {
			const res = await routes.detail("nonexistent");
			expect(res.status).toBe(404);
		});
	});

	describe("GET /recipients/:id/edit (edit SSE)", () => {
		test("returns SSE with edit form", async () => {
			const { id } = await createRecipient({ phone: "07700900001", name: "Alice" }, eventStore);
			const res = await routes.edit(id);
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain('value="Alice"');
		});
	});

	describe("GET /recipients/new (create SSE)", () => {
		test("returns SSE with empty form", async () => {
			const res = await routes.create();
			const body = await res.text();
			expect(body).toContain("datastar-patch-elements");
			expect(body).toContain("Create");
		});
	});

	describe("POST /recipients (create)", () => {
		test("creates recipient and returns updated page SSE", async () => {
			const form = new FormData();
			form.set("name", "Charlie");
			form.set("phone", "07700900099");
			form.set("paymentPreference", "cash");

			const res = await routes.handleCreate(form, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const created = await recipientRepo.getByPhone("07700900099");
			expect(created).not.toBeNull();
			expect(created!.name).toBe("Charlie");
		});
	});

	describe("PUT /recipients/:id (update)", () => {
		test("updates recipient and returns view panel SSE", async () => {
			const { id } = await createRecipient({ phone: "07700900001", name: "Alice" }, eventStore);

			const form = new FormData();
			form.set("name", "Alicia");
			form.set("phone", "07700900001");
			form.set("paymentPreference", "cash");

			const res = await routes.handleUpdate(id, form, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await recipientRepo.getById(id);
			expect(updated!.name).toBe("Alicia");
		});
	});

	describe("DELETE /recipients/:id", () => {
		test("deletes recipient and clears panel SSE", async () => {
			const { id } = await createRecipient({ phone: "07700900001", name: "Alice" }, eventStore);
			const res = await routes.handleDelete(id, "volunteer-1");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const deleted = await recipientRepo.getById(id);
			expect(deleted).toBeNull();
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/recipientRoutes.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```ts
// src/web/routes/recipients.ts
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createRecipient,
	deleteRecipient,
	updateRecipient,
} from "../../domain/recipient/commandHandlers.ts";
import type { RecipientRepository } from "../../domain/recipient/repository.ts";
import { recipientsPage, recipientRow } from "../pages/recipients.ts";
import { viewPanel, editPanel, createPanel } from "../pages/recipientPanel.ts";
import { patchElements, sseResponse } from "../sse.ts";

export function createRecipientRoutes(
	recipientRepo: RecipientRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const recipients = await recipientRepo.list();
			return new Response(recipientsPage(recipients), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) {
				return new Response("Not found", { status: 404 });
			}
			return sseResponse(patchElements(viewPanel(recipient)));
		},

		async edit(id: string): Promise<Response> {
			const recipient = await recipientRepo.getById(id);
			if (!recipient) {
				return new Response("Not found", { status: 404 });
			}
			return sseResponse(patchElements(editPanel(recipient)));
		},

		create(): Response {
			return sseResponse(patchElements(createPanel()));
		},

		async handleCreate(form: FormData, volunteerId: string): Promise<Response> {
			const data = formToRecipientData(form);
			const { id } = await createRecipient(
				{ ...data, volunteerId },
				eventStore,
			);

			const recipients = await recipientRepo.list();
			const recipient = await recipientRepo.getById(id);

			return sseResponse(
				patchElements(recipientsPageBody(recipients)),
				patchElements(viewPanel(recipient!)),
			);
		},

		async handleUpdate(id: string, form: FormData, volunteerId: string): Promise<Response> {
			const data = formToRecipientData(form);
			await updateRecipient(id, volunteerId, data, eventStore);

			const recipient = await recipientRepo.getById(id);
			const recipients = await recipientRepo.list();

			return sseResponse(
				patchElements(viewPanel(recipient!)),
				patchElements(recipientsPageBody(recipients)),
			);
		},

		async handleDelete(id: string, volunteerId: string): Promise<Response> {
			await deleteRecipient(id, volunteerId, eventStore);

			const recipients = await recipientRepo.list();

			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(recipientsPageBody(recipients)),
			);
		},
	};
}

function formToRecipientData(form: FormData) {
	const pref = (form.get("paymentPreference") as string) || "cash";
	const sortCode = form.get("sortCode") as string | null;
	const accountNumber = form.get("accountNumber") as string | null;

	return {
		name: form.get("name") as string,
		phone: form.get("phone") as string,
		email: (form.get("email") as string) || undefined,
		paymentPreference: pref as "bank" | "cash",
		meetingPlace: (form.get("meetingPlace") as string) || undefined,
		bankDetails:
			pref === "bank" && sortCode && accountNumber
				? { sortCode, accountNumber }
				: undefined,
		notes: (form.get("notes") as string) || undefined,
	};
}

function recipientsPageBody(recipients: import("../../domain/recipient/types.ts").Recipient[]): string {
	if (recipients.length === 0) {
		return `<div id="recipient-rows"><div class="text-center py-12 text-bark-muted">
			<p class="text-lg mb-1">No recipients yet</p>
			<p class="text-sm">Add a recipient to get started.</p>
		</div></div>`;
	}
	return `<tbody id="recipient-rows">${recipients.map(recipientRow).join("")}</tbody>`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/integration/recipientRoutes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/routes/recipients.ts test/integration/recipientRoutes.test.ts
git commit -m "Add recipient route handlers with SSE responses"
```

---

### Task 5: Wire routes into server

**Files:**
- Modify: `src/web/server.ts`
- Modify: `src/web/index.ts`

**Context:** `Bun.serve()` uses a flat `routes` object. We need to add the recipient routes. The server needs access to `recipientRepo` and `eventStore`. Currently `index.ts` doesn't pass these — we need to thread them through.

The tricky bit: Bun's `routes` only supports static paths. For dynamic `:id` params, we need to use the `fetch` fallback handler.

**Step 1: Update `src/web/index.ts` to create recipientRepo and pass eventStore**

```ts
// src/web/index.ts
import { createEventStore } from "../infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../infrastructure/recipient/sqliteRecipientRepository.ts";
import { SQLiteSessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "./server.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";

const { store: eventStore, pool } = createEventStore(dbPath);
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const recipientRepo = await SQLiteRecipientRepository(pool);

const server = startServer(sessionStore, volunteerRepo, recipientRepo, eventStore);

console.log(`CSF server running at http://localhost:${server.port}`);
```

**Step 2: Update `src/web/server.ts` to register recipient routes**

```ts
// src/web/server.ts
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../domain/recipient/repository.ts";
import type { VolunteerRepository } from "../domain/volunteer/repository.ts";
import { getSessionId } from "../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { dashboardPage } from "./pages/dashboard.ts";
import { loginPage } from "./pages/login.ts";
import { handleLogin, handleLogout } from "./routes/auth.ts";
import { createRecipientRoutes } from "./routes/recipients.ts";

export async function getAuthenticatedVolunteer(
	req: Request,
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
) {
	const sid = getSessionId(req);
	if (!sid) return null;
	const volunteerId = await sessionStore.get(sid);
	if (!volunteerId) return null;
	return volunteerRepo.getById(volunteerId);
}

export function startServer(
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
	recipientRepo: RecipientRepository,
	eventStore: SQLiteEventStore,
	port = 3000,
) {
	const login = handleLogin(sessionStore, volunteerRepo);
	const logout = handleLogout(sessionStore);
	const loginHtml = loginPage();
	const recipientRoutes = createRecipientRoutes(recipientRepo, eventStore);

	async function requireAuth(req: Request) {
		return getAuthenticatedVolunteer(req, sessionStore, volunteerRepo);
	}

	return Bun.serve({
		port,
		routes: {
			"/styles/app.css": {
				GET: async () => {
					const file = Bun.file("src/web/styles/dist/app.css");
					return new Response(file, {
						headers: { "Content-Type": "text/css" },
					});
				},
			},
			"/": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return new Response(dashboardPage(volunteer), {
						headers: { "Content-Type": "text/html" },
					});
				},
			},
			"/login": {
				GET: () =>
					new Response(loginHtml, {
						headers: { "Content-Type": "text/html" },
					}),
				POST: (req) => login(req),
			},
			"/logout": {
				GET: (req) => logout(req),
			},
			"/recipients": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return recipientRoutes.list();
				},
			},
			"/recipients/new": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return recipientRoutes.create();
				},
			},
		},
		async fetch(req) {
			const url = new URL(req.url);
			const volunteer = await requireAuth(req);
			if (!volunteer) return Response.redirect("/login", 302);

			// POST /recipients
			if (url.pathname === "/recipients" && req.method === "POST") {
				const form = await req.formData();
				return recipientRoutes.handleCreate(form, volunteer.id);
			}

			// /recipients/:id patterns
			const recipientMatch = url.pathname.match(/^\/recipients\/([^/]+)$/);
			if (recipientMatch) {
				const id = recipientMatch[1]!;
				if (req.method === "GET") return recipientRoutes.detail(id);
				if (req.method === "PUT") {
					const form = await req.formData();
					return recipientRoutes.handleUpdate(id, form, volunteer.id);
				}
				if (req.method === "DELETE") return recipientRoutes.handleDelete(id, volunteer.id);
			}

			// /recipients/:id/edit
			const editMatch = url.pathname.match(/^\/recipients\/([^/]+)\/edit$/);
			if (editMatch) {
				const id = editMatch[1]!;
				return recipientRoutes.edit(id);
			}

			return new Response("Not found", { status: 404 });
		},
	});
}
```

**Step 3: Run all tests**

Run: `bun test`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/web/server.ts src/web/index.ts
git commit -m "Wire recipient routes into server with auth"
```

---

### Task 6: Rebuild Tailwind CSS and manual smoke test

**Step 1: Rebuild Tailwind**

Run: `bunx @tailwindcss/cli -i src/web/styles/app.css -o src/web/styles/dist/app.css`

**Step 2: Run the server and test manually**

Run: `bun --hot src/web/index.ts`

Verify:
- Navigate to `http://localhost:3000/recipients` (redirects to login if not auth'd)
- Log in, click Recipients card → table page loads
- Search filters rows client-side
- Click "Add Recipient" → create panel slides in
- Fill form, submit → recipient appears in table
- Click row → view panel slides in
- Click Edit → edit form with pre-filled values
- Click Delete → inline confirmation → confirm → recipient removed

**Step 3: Commit Tailwind output**

```bash
git add src/web/styles/dist/app.css
git commit -m "Rebuild Tailwind CSS with recipient page classes"
```

---

### Task 7: Run full test suite and lint

**Step 1: Run all tests**

Run: `bun test`
Expected: All PASS

**Step 2: Lint and format**

Run: `bunx biome check --write`

**Step 3: Commit any formatting fixes**

```bash
git add -A && git commit -m "Format with Biome"
```
