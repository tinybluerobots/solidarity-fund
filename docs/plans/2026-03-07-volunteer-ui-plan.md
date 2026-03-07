# Volunteer Management UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add admin-gated volunteer CRUD UI with password reset flow, mirroring the existing recipients UI pattern.

**Architecture:** Extend the volunteer aggregate with `isAdmin` and `requiresPasswordReset` flags. Add volunteer management pages (list + sliding panel) behind `requireAdmin()` middleware. Add a change-password page/flow that clears the reset flag. All UI uses Datastar SSE patterns identical to recipients.

**Tech Stack:** Bun, Emmett (event sourcing), SQLite, Datastar v1 RC3, Tailwind v4

---

### Task 1: Add `isAdmin` and `requiresPasswordReset` to Volunteer Types

**Files:**
- Modify: `src/domain/volunteer/types.ts`

**Step 1: Write the failing test**

Add to `test/unit/volunteerDecider.test.ts`:

```ts
test("VolunteerCreated with isAdmin and requiresPasswordReset evolves correctly", () => {
	const event: VolunteerEvent = {
		type: "VolunteerCreated",
		data: {
			...createCommand.data,
			isAdmin: true,
			requiresPasswordReset: true,
		},
	};
	const state = evolve(initialState(), event);
	expect(state.status).toBe("active");
	if (state.status === "active") {
		expect(state.isAdmin).toBe(true);
		expect(state.requiresPasswordReset).toBe(true);
	}
});

test("VolunteerCreated defaults isAdmin=false and requiresPasswordReset=false", () => {
	const event: VolunteerEvent = {
		type: "VolunteerCreated",
		data: createCommand.data,
	};
	const state = evolve(initialState(), event);
	if (state.status === "active") {
		expect(state.isAdmin).toBe(false);
		expect(state.requiresPasswordReset).toBe(false);
	}
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/volunteerDecider.test.ts`
Expected: FAIL — `isAdmin` and `requiresPasswordReset` don't exist on the types

**Step 3: Update types**

In `src/domain/volunteer/types.ts`:

Add `isAdmin` and `requiresPasswordReset` to:
- `Volunteer` type (lines 1-8): add `isAdmin: boolean; requiresPasswordReset: boolean;`
- `CreateVolunteer` type (lines 10-15): add `isAdmin?: boolean;`
- `CreateVolunteerCommand` data (lines 28-37): add `isAdmin?: boolean; requiresPasswordReset?: boolean;`
- `VolunteerCreated` event data (lines 67-77): add `isAdmin?: boolean; requiresPasswordReset?: boolean;`
- `VolunteerState` active variant (lines 110-119): add `isAdmin: boolean; requiresPasswordReset: boolean;`

Also add a new `ChangePasswordCommand`:
```ts
export type ChangePasswordCommand = Command<
	"ChangePassword",
	{
		id: string;
		passwordHash: string;
		changedAt: string;
	}
>;
```

And `PasswordChanged` event:
```ts
export type PasswordChanged = Event<
	"PasswordChanged",
	{
		id: string;
		passwordHash: string;
		changedAt: string;
	}
>;
```

Add both to the union types (`VolunteerCommand`, `VolunteerEvent`).

**Step 4: Update decider**

In `src/domain/volunteer/decider.ts`:

Update `evolve` for `VolunteerCreated`:
```ts
case "VolunteerCreated":
	return {
		status: "active",
		id: event.data.id,
		name: event.data.name,
		phone: event.data.phone,
		email: event.data.email,
		passwordHash: event.data.passwordHash,
		isAdmin: event.data.isAdmin ?? false,
		requiresPasswordReset: event.data.requiresPasswordReset ?? false,
		createdAt: event.data.createdAt,
		updatedAt: event.data.createdAt,
	};
```

Add `decide` case for `ChangePassword`:
```ts
case "ChangePassword": {
	if (state.status !== "active") {
		throw new IllegalStateError(
			`Cannot change password in ${state.status} state`,
		);
	}
	return [{ type: "PasswordChanged", data: command.data }];
}
```

Add `evolve` case for `PasswordChanged`:
```ts
case "PasswordChanged":
	if (state.status !== "active") return state;
	return {
		...state,
		passwordHash: event.data.passwordHash,
		requiresPasswordReset: false,
		updatedAt: event.data.changedAt,
	};
```

Also update `VolunteerUpdated` evolve to preserve `isAdmin` and `requiresPasswordReset`:
```ts
case "VolunteerUpdated":
	if (state.status !== "active") return state;
	return {
		...state,
		name: event.data.name,
		phone: event.data.phone,
		email: event.data.email,
		passwordHash: event.data.passwordHash,
		updatedAt: event.data.updatedAt,
	};
```

**Step 5: Run test to verify it passes**

Run: `bun test test/unit/volunteerDecider.test.ts`
Expected: PASS

**Step 6: Add ChangePassword decider tests**

Add to `test/unit/volunteerDecider.test.ts`:

```ts
test("ChangePassword emits PasswordChanged from active state", () => {
	const cmd: VolunteerCommand = {
		type: "ChangePassword",
		data: { id: "v-1", passwordHash: "$argon2id$newhash", changedAt: "2026-01-02T00:00:00.000Z" },
	};
	const events = decide(cmd, activeState);
	expect(events).toHaveLength(1);
	expect(events[0]!.type).toBe("PasswordChanged");
});

test("ChangePassword rejects from initial state", () => {
	const cmd: VolunteerCommand = {
		type: "ChangePassword",
		data: { id: "v-1", passwordHash: "$argon2id$newhash", changedAt: "2026-01-02T00:00:00.000Z" },
	};
	expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
});

test("PasswordChanged clears requiresPasswordReset", () => {
	const stateWithReset: VolunteerState = { ...activeState, requiresPasswordReset: true };
	const event: VolunteerEvent = {
		type: "PasswordChanged",
		data: { id: "v-1", passwordHash: "$argon2id$newhash", changedAt: "2026-01-02T00:00:00.000Z" },
	};
	const newState = evolve(stateWithReset, event);
	if (newState.status === "active") {
		expect(newState.requiresPasswordReset).toBe(false);
		expect(newState.passwordHash).toBe("$argon2id$newhash");
	}
});
```

**Step 7: Run tests**

Run: `bun test test/unit/volunteerDecider.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add src/domain/volunteer/types.ts src/domain/volunteer/decider.ts test/unit/volunteerDecider.test.ts
git commit -m "feat: add isAdmin, requiresPasswordReset, and ChangePassword to volunteer aggregate"
```

---

### Task 2: Update Command Handlers and Projection

**Files:**
- Modify: `src/domain/volunteer/commandHandlers.ts`
- Modify: `src/infrastructure/projections/volunteer.ts`
- Modify: `src/infrastructure/volunteer/sqliteVolunteerRepository.ts`
- Modify: `src/domain/volunteer/repository.ts`

**Step 1: Write the failing test**

Add to `test/integration/volunteerRepository.test.ts`:

```ts
test("stores and retrieves isAdmin flag", async () => {
	await createVolunteer({ name: "Admin", password: "pw", isAdmin: true }, eventStore);
	const vol = await volunteerRepo.getByName("Admin");
	expect(vol?.isAdmin).toBe(true);
	expect(vol?.requiresPasswordReset).toBe(true);
});

test("defaults isAdmin to false", async () => {
	await createVolunteer({ name: "Regular", password: "pw" }, eventStore);
	const vol = await volunteerRepo.getByName("Regular");
	expect(vol?.isAdmin).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/volunteerRepository.test.ts`
Expected: FAIL — `isAdmin` column doesn't exist

**Step 3: Update command handler**

In `src/domain/volunteer/commandHandlers.ts`:

Update `createVolunteer` to pass `isAdmin` and set `requiresPasswordReset: true`:
```ts
export async function createVolunteer(
	data: CreateVolunteer,
	eventStore: SQLiteEventStore,
): Promise<{ id: string }> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const passwordHash = await Bun.password.hash(data.password);

	await handle(eventStore, streamId(id), (_state) =>
		decide(
			{
				type: "CreateVolunteer",
				data: {
					id,
					name: data.name,
					phone: data.phone,
					email: data.email,
					passwordHash,
					isAdmin: data.isAdmin,
					requiresPasswordReset: true,
					createdAt: now,
				},
			},
			initialState(),
		),
	);

	return { id };
}
```

Add `changePassword` handler:
```ts
export async function changePassword(
	id: string,
	newPassword: string,
	eventStore: SQLiteEventStore,
): Promise<void> {
	const passwordHash = await Bun.password.hash(newPassword);
	const now = new Date().toISOString();

	await handle(eventStore, streamId(id), (state) =>
		decide(
			{ type: "ChangePassword", data: { id, passwordHash, changedAt: now } },
			state,
		),
	);
}
```

**Step 4: Update projection**

In `src/infrastructure/projections/volunteer.ts`:

Update `init` to add columns:
```sql
CREATE TABLE IF NOT EXISTS volunteers (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	phone TEXT,
	email TEXT,
	password_hash TEXT NOT NULL,
	is_admin INTEGER NOT NULL DEFAULT 0,
	requires_password_reset INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
)
```

Update `canHandle` to include `"PasswordChanged"`.

Update `VolunteerCreated` handler INSERT to include `is_admin` and `requires_password_reset`:
```ts
case "VolunteerCreated": {
	const d = event.data;
	await connection.command(
		`INSERT INTO volunteers (id, name, phone, email, password_hash, is_admin, requires_password_reset, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[d.id, d.name, d.phone ?? null, d.email ?? null, d.passwordHash,
		 d.isAdmin ? 1 : 0, d.requiresPasswordReset ? 1 : 0, d.createdAt, d.createdAt],
	);
	break;
}
```

Add `PasswordChanged` handler:
```ts
case "PasswordChanged": {
	const d = event.data;
	await connection.command(
		`UPDATE volunteers SET password_hash = ?, requires_password_reset = 0, updated_at = ? WHERE id = ?`,
		[d.passwordHash, d.changedAt, d.id],
	);
	break;
}
```

**Step 5: Update repository**

In `src/infrastructure/volunteer/sqliteVolunteerRepository.ts`:

Update `VolunteerRow` type to add `is_admin: number; requires_password_reset: number;`.

Update `rowToVolunteer` to map new fields:
```ts
function rowToVolunteer(row: VolunteerRow): Volunteer {
	return {
		id: row.id,
		name: row.name,
		phone: row.phone ?? undefined,
		email: row.email ?? undefined,
		isAdmin: row.is_admin === 1,
		requiresPasswordReset: row.requires_password_reset === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
```

Update the `CREATE TABLE` in the repo factory to match the projection schema.

In `src/domain/volunteer/repository.ts`, add to interface:
```ts
getAdmins(): Promise<Volunteer[]>;
```

Implement in the SQLite repo:
```ts
async getAdmins(): Promise<Volunteer[]> {
	return await pool.withConnection(async (conn) => {
		const rows = await conn.query<VolunteerRow>(
			"SELECT * FROM volunteers WHERE is_admin = 1 ORDER BY name",
		);
		return rows.map(rowToVolunteer);
	});
},
```

**Step 6: Run tests**

Run: `bun test test/integration/volunteerRepository.test.ts`
Expected: PASS

**Step 7: Run all tests**

Run: `bun test`
Expected: PASS (may need to update `activeState` fixture in volunteerDecider.test.ts to include new fields)

**Step 8: Commit**

```bash
git add src/domain/volunteer/ src/infrastructure/projections/volunteer.ts src/infrastructure/volunteer/sqliteVolunteerRepository.ts test/integration/volunteerRepository.test.ts
git commit -m "feat: add isAdmin and requiresPasswordReset to volunteer projection and repository"
```

---

### Task 3: Update Auth Flow for Password Reset Redirect

**Files:**
- Modify: `src/web/routes/auth.ts`
- Create: `src/web/pages/changePassword.ts`

**Step 1: Write the failing test**

Add to `test/integration/auth.test.ts`:

```ts
test("redirects to /change-password when requiresPasswordReset is true", async () => {
	// The default createVolunteer now sets requiresPasswordReset: true
	const login = handleLogin(sessionStore, volunteerRepo);
	const res = await login(loginRequest("Alice", "correct-password"));
	expect(res.status).toBe(302);
	expect(res.headers.get("location")).toBe("/change-password");
});
```

Note: This means the existing test "redirects with cookie on valid credentials" needs updating — the existing seed volunteer will now have `requiresPasswordReset: true`. Either update the test to expect `/change-password`, or create a volunteer with the flag cleared. The cleanest approach: in the test `beforeEach`, after creating the volunteer, change their password to clear the flag.

Update `beforeEach` in auth.test.ts:
```ts
beforeEach(async () => {
	const es = createEventStore(":memory:");
	pool = es.pool;
	eventStore = es.store;
	sessionStore = await SQLiteSessionStore(pool);
	volunteerRepo = await SQLiteVolunteerRepository(pool);
	const { id } = await createVolunteer(
		{ name: "Alice", password: "correct-password" },
		eventStore,
	);
	// Clear the requiresPasswordReset flag
	await changePassword(id, "correct-password", eventStore);
});
```

And add a separate test with a fresh volunteer (flag still true) to verify the redirect.

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/auth.test.ts`
Expected: FAIL

**Step 3: Update login handler**

In `src/web/routes/auth.ts`, after successful password verification, check `requiresPasswordReset`:

```ts
const sessionId = await sessionStore.create(volunteer.id);
const location = volunteer.requiresPasswordReset ? "/change-password" : "/";
return new Response(null, {
	status: 302,
	headers: {
		Location: location,
		"Set-Cookie": setSessionCookie(sessionId),
	},
});
```

This requires `volunteer` to be the full `Volunteer` object (it already is from `volunteerRepo.getByName()`), but we need the repo to return `requiresPasswordReset`. That was handled in Task 2.

**Step 4: Create change-password page**

Create `src/web/pages/changePassword.ts`:

```ts
import { layout } from "./layout.ts";

export function changePasswordPage(error?: string): string {
	const errorHtml = error
		? `<div id="error-message" class="bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-md text-sm mb-5">${escapeHtml(error)}</div>`
		: "";

	return layout(
		"Change Password",
		`
	<div class="flex items-center justify-center min-h-screen p-4">
		<div class="bg-cream-50 border border-cream-200 rounded-xl p-10 w-full max-w-sm shadow-sm animate-[fadeIn_0.4s_ease-out]">
			<h1 class="font-heading font-bold text-2xl text-bark mb-1">Change Password</h1>
			<p class="text-bark-muted text-sm mb-8">Please set a new password to continue.</p>

			<form method="POST" action="/change-password">
				${errorHtml}

				<label for="currentPassword" class="block text-sm font-semibold text-bark-light mb-1">Current Password</label>
				<input
					type="password"
					id="currentPassword"
					name="currentPassword"
					autocomplete="current-password"
					required
					class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-5 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
				>

				<label for="newPassword" class="block text-sm font-semibold text-bark-light mb-1">New Password</label>
				<input
					type="password"
					id="newPassword"
					name="newPassword"
					autocomplete="new-password"
					required
					class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-5 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
				>

				<label for="confirmPassword" class="block text-sm font-semibold text-bark-light mb-1">Confirm New Password</label>
				<input
					type="password"
					id="confirmPassword"
					name="confirmPassword"
					autocomplete="new-password"
					required
					class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-5 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
				>

				<button type="submit" class="w-full py-3 bg-amber text-cream-50 rounded-md font-heading font-semibold cursor-pointer transition-colors hover:bg-amber-dark active:bg-amber-dark/90">
					Change Password
				</button>
			</form>
		</div>
	</div>
`,
	);
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
```

**Step 5: Add change-password route handler**

In `src/web/routes/auth.ts`, add:

```ts
export function handleChangePassword(
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
	return async (req: Request, volunteerId: string): Promise<Response> => {
		const form = await req.formData();
		const currentPassword = form.get("currentPassword") as string;
		const newPassword = form.get("newPassword") as string;
		const confirmPassword = form.get("confirmPassword") as string;

		if (!currentPassword || !newPassword || !confirmPassword) {
			return changePasswordResponse("All fields are required");
		}

		if (newPassword !== confirmPassword) {
			return changePasswordResponse("New passwords do not match");
		}

		if (newPassword.length < 4) {
			return changePasswordResponse("Password must be at least 4 characters");
		}

		const valid = await volunteerRepo.verifyPassword(volunteerId, currentPassword);
		if (!valid) {
			return changePasswordResponse("Current password is incorrect");
		}

		await changePassword(volunteerId, newPassword, eventStore);

		return new Response(null, {
			status: 302,
			headers: { Location: "/" },
		});
	};
}

function changePasswordResponse(error: string): Response {
	return new Response(changePasswordPage(error), {
		status: 400,
		headers: { "Content-Type": "text/html" },
	});
}
```

**Step 6: Wire routes in server.ts**

In `src/web/server.ts`, add change-password routes:

```ts
"/change-password": {
	GET: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		return new Response(changePasswordPage(), {
			headers: { "Content-Type": "text/html" },
		});
	},
	POST: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		return changePasswordHandler(req, volunteer.id);
	},
},
```

**Step 7: Write auth test for change-password**

Add to `test/integration/auth.test.ts`:

```ts
describe("POST /change-password", () => {
	test("changes password and redirects to /", async () => {
		const { id } = await createVolunteer(
			{ name: "Bob", password: "old-pw" },
			eventStore,
		);
		const handler = handleChangePassword(volunteerRepo, eventStore);
		const form = new URLSearchParams({
			currentPassword: "old-pw",
			newPassword: "new-pw",
			confirmPassword: "new-pw",
		});
		const req = new Request("http://localhost/change-password", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});
		const res = await handler(req, id);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/");

		// Verify new password works
		const valid = await volunteerRepo.verifyPassword(id, "new-pw");
		expect(valid).toBe(true);
	});

	test("rejects when current password is wrong", async () => {
		const { id } = await createVolunteer(
			{ name: "Bob2", password: "old-pw" },
			eventStore,
		);
		const handler = handleChangePassword(volunteerRepo, eventStore);
		const form = new URLSearchParams({
			currentPassword: "wrong",
			newPassword: "new-pw",
			confirmPassword: "new-pw",
		});
		const req = new Request("http://localhost/change-password", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});
		const res = await handler(req, id);
		expect(res.status).toBe(400);
		const body = await res.text();
		expect(body).toContain("Current password is incorrect");
	});

	test("rejects when passwords don't match", async () => {
		const { id } = await createVolunteer(
			{ name: "Bob3", password: "old-pw" },
			eventStore,
		);
		const handler = handleChangePassword(volunteerRepo, eventStore);
		const form = new URLSearchParams({
			currentPassword: "old-pw",
			newPassword: "new-pw",
			confirmPassword: "different",
		});
		const req = new Request("http://localhost/change-password", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});
		const res = await handler(req, id);
		expect(res.status).toBe(400);
		const body = await res.text();
		expect(body).toContain("do not match");
	});
});
```

**Step 8: Run tests**

Run: `bun test test/integration/auth.test.ts`
Expected: PASS

**Step 9: Commit**

```bash
git add src/web/routes/auth.ts src/web/pages/changePassword.ts src/web/server.ts test/integration/auth.test.ts
git commit -m "feat: add change-password flow with requiresPasswordReset redirect"
```

---

### Task 4: Volunteer List Page and Row Component

**Files:**
- Create: `src/web/pages/volunteers.ts`
- Create: `test/unit/volunteersPage.test.ts`

**Step 1: Write the failing test**

Create `test/unit/volunteersPage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Volunteer } from "../../src/domain/volunteer/types";
import { volunteersPage } from "../../src/web/pages/volunteers";

const alice: Volunteer = {
	id: "v-1",
	name: "Alice Smith",
	phone: "07700900001",
	email: "alice@example.com",
	isAdmin: true,
	requiresPasswordReset: false,
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Volunteer = {
	id: "v-2",
	name: "Bob Jones",
	phone: "07700900002",
	isAdmin: false,
	requiresPasswordReset: false,
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("volunteersPage", () => {
	test("renders table with volunteers", () => {
		const html = volunteersPage([alice, bob]);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("Bob Jones");
		expect(html).toContain("07700900001");
	});

	test("renders empty state when no volunteers", () => {
		const html = volunteersPage([]);
		expect(html).toContain("No volunteers yet");
	});

	test("renders admin badge", () => {
		const html = volunteersPage([alice, bob]);
		expect(html).toContain("Admin");
	});

	test("includes Datastar signals for search", () => {
		const html = volunteersPage([alice]);
		expect(html).toContain("data-signals");
		expect(html).toContain("search");
	});

	test("includes search input with data-bind", () => {
		const html = volunteersPage([alice]);
		expect(html).toContain("data-bind-search");
	});

	test("includes Add Volunteer button", () => {
		const html = volunteersPage([]);
		expect(html).toContain("Add Volunteer");
	});

	test("table rows have data-on-click for SSE fetch", () => {
		const html = volunteersPage([alice]);
		expect(html).toContain("@get");
		expect(html).toContain("/volunteers/v-1");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/volunteersPage.test.ts`
Expected: FAIL — module not found

**Step 3: Create volunteers page**

Create `src/web/pages/volunteers.ts`:

```ts
import type { Volunteer } from "../../domain/volunteer/types";
import { layout } from "./layout";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeJsString(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/`/g, "\\`")
		.replace(/\$/g, "\\$");
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function adminBadge(isAdmin: boolean): string {
	if (!isAdmin) return "";
	return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">Admin</span>`;
}

export function volunteerRow(v: Volunteer): string {
	const nameLower = escapeJsString(v.name.toLowerCase());
	const phone = escapeJsString(v.phone ?? "");
	const showExpr = `$search === '' || '${nameLower}'.includes($search.toLowerCase()) || '${phone}'.includes($search)`;
	return `<tr
		class="border-b border-cream-200 hover:bg-cream-50 cursor-pointer transition-colors"
		data-on-click="@get('/volunteers/${encodeURIComponent(v.id)}')"
		data-show="${escapeHtml(showExpr)}">
		<td class="px-4 py-3 font-medium text-bark">${escapeHtml(v.name)}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(v.phone ?? "")}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(v.email ?? "")}</td>
		<td class="px-4 py-3">${adminBadge(v.isAdmin)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${formatDate(v.createdAt)}</td>
	</tr>`;
}

export function volunteersPage(volunteers: Volunteer[]): string {
	const emptyRow = `<tr><td colspan="5" class="text-center py-12 text-bark-muted">No volunteers yet</td></tr>`;
	const rows =
		volunteers.length === 0
			? emptyRow
			: volunteers.map(volunteerRow).join("\n");

	const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"search": ""}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Volunteers</h1>
		</div>
		<button
			class="px-4 py-2 rounded-lg bg-amber text-white font-medium hover:bg-amber-dark transition-colors text-sm"
			data-on-click="@get('/volunteers/new')">
			Add Volunteer
		</button>
	</div>

	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by name or phone&hellip;"
			data-bind-search
			class="w-full max-w-sm px-3 py-2 rounded-lg border border-cream-300 bg-white text-bark placeholder-bark-muted focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent text-sm" />
	</div>

	<div class="bg-white rounded-xl border border-cream-200 shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="border-b-2 border-cream-300 bg-cream-100">
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Phone</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Email</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Role</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Added</th>
					</tr>
				</thead>
				<tbody id="volunteer-rows">
					${rows}
				</tbody>
			</table>
		</div>
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Volunteers", body);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/volunteersPage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/volunteers.ts test/unit/volunteersPage.test.ts
git commit -m "feat: add volunteer list page component"
```

---

### Task 5: Volunteer Panel Component (View/Edit/Create)

**Files:**
- Create: `src/web/pages/volunteerPanel.ts`
- Create: `test/unit/volunteerPanel.test.ts`

**Step 1: Write the failing test**

Create `test/unit/volunteerPanel.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Volunteer } from "../../src/domain/volunteer/types";
import {
	createPanel,
	editPanel,
	viewPanel,
} from "../../src/web/pages/volunteerPanel";

const alice: Volunteer = {
	id: "v-1",
	name: "Alice Smith",
	phone: "07700900001",
	email: "alice@example.com",
	isAdmin: true,
	requiresPasswordReset: false,
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Volunteer = {
	id: "v-2",
	name: "Bob Jones",
	isAdmin: false,
	requiresPasswordReset: false,
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("viewPanel", () => {
	test("shows volunteer name as heading", () => {
		const html = viewPanel(alice, "other-id");
		expect(html).toContain("Alice Smith");
	});

	test("shows all fields", () => {
		const html = viewPanel(alice, "other-id");
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
		expect(html).toContain("Admin");
	});

	test("has Edit and Delete buttons", () => {
		const html = viewPanel(alice, "other-id");
		expect(html).toContain("Edit");
		expect(html).toContain("Delete");
	});

	test("has close button", () => {
		const html = viewPanel(alice, "other-id");
		expect(html).toContain("Close");
	});

	test("hides delete button for self", () => {
		const html = viewPanel(alice, "v-1");
		expect(html).not.toContain("Delete");
	});

	test("uses signal-driven delete confirmation", () => {
		const html = viewPanel(alice, "other-id");
		expect(html).toContain("confirmDelete");
		expect(html).toContain("Are you sure?");
	});
});

describe("editPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = editPanel(alice, "other-id");
		expect(html).toContain("data-bind-name");
		expect(html).toContain("data-bind-phone");
		expect(html).toContain("data-bind-email");
	});

	test("pre-fills signal values", () => {
		const html = editPanel(alice, "other-id");
		expect(html).toContain("Alice Smith");
		expect(html).toContain("07700900001");
	});

	test("has password field (optional)", () => {
		const html = editPanel(alice, "other-id");
		expect(html).toContain("data-bind-password");
		expect(html).toContain("Leave blank to keep current");
	});

	test("has Save and Cancel buttons", () => {
		const html = editPanel(alice, "other-id");
		expect(html).toContain("Save");
		expect(html).toContain("Cancel");
	});

	test("uses @put for existing volunteer", () => {
		const html = editPanel(alice, "other-id");
		expect(html).toContain("@put");
		expect(html).toContain("/volunteers/v-1");
	});

	test("disables admin checkbox when editing self", () => {
		const html = editPanel(alice, "v-1");
		expect(html).toContain("disabled");
	});
});

describe("createPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-name");
		expect(html).toContain("data-bind-phone");
	});

	test("has password field (required)", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-password");
		expect(html).toContain("required");
	});

	test("has Create and Cancel buttons", () => {
		const html = createPanel();
		expect(html).toContain("Create");
		expect(html).toContain("Cancel");
	});

	test("uses @post for new volunteer", () => {
		const html = createPanel();
		expect(html).toContain("@post");
		expect(html).toContain("/volunteers");
	});

	test("has admin checkbox", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-is-admin");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/unit/volunteerPanel.test.ts`
Expected: FAIL — module not found

**Step 3: Create volunteer panel**

Create `src/web/pages/volunteerPanel.ts`:

```ts
import type { Volunteer } from "../../domain/volunteer/types.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
  <div class="p-6">${content}</div>
  <style>@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }</style>
</div>`;
}

function field(label: string, value: string): string {
	return `<div class="mb-4">
    <dt class="text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">${label}</dt>
    <dd class="font-body text-bark">${escapeHtml(value)}</dd>
  </div>`;
}

const inputClass =
	"w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";
const btnAmber =
	"px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnSecondary =
	"px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";

export function viewPanel(v: Volunteer, currentVolunteerId: string): string {
	const phoneField = v.phone ? field("Phone", v.phone) : "";
	const emailField = v.email ? field("Email", v.email) : "";
	const adminField = field("Role", v.isAdmin ? "Admin" : "Volunteer");
	const isSelf = v.id === currentVolunteerId;

	const deleteButton = isSelf
		? ""
		: `<button class="${btnSecondary}" data-show="!$confirmDelete" data-on-click="$confirmDelete = true">Delete</button>
      <span data-show="$confirmDelete" class="flex items-center gap-2">
        <span class="font-body text-bark-muted text-sm">Are you sure?</span>
        <button class="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors" data-on-click="@delete('/volunteers/${v.id}')">Confirm</button>
        <button class="${btnSecondary}" data-on-click="$confirmDelete = false">Cancel</button>
      </span>`;

	return panelWrapper(`
    <div class="flex items-center justify-between mb-6" data-signals="{confirmDelete: false}">
      <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(v.name)}</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
    <dl>
      ${phoneField}
      ${emailField}
      ${adminField}
    </dl>
    <div class="flex gap-3 mt-6">
      <button class="${btnAmber}" data-on-click="@get('/volunteers/${v.id}/edit')">Edit</button>
      ${deleteButton}
    </div>
  `);
}

function escapeSignalValue(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function volunteerForm(opts: {
	action: string;
	method: "@put" | "@post";
	submitLabel: string;
	name: string;
	phone: string;
	email: string;
	password: string;
	passwordRequired: boolean;
	passwordHint?: string;
	isAdmin: boolean;
	adminDisabled: boolean;
	cancelAction: string;
}): string {
	const passwordAttr = opts.passwordRequired ? "required" : "";
	const hint = opts.passwordHint
		? `<p class="text-xs text-bark-muted mt-1">${opts.passwordHint}</p>`
		: "";
	const adminDisabledAttr = opts.adminDisabled ? "disabled" : "";
	const adminNote = opts.adminDisabled
		? `<p class="text-xs text-bark-muted mt-1">Cannot change your own admin status</p>`
		: "";

	return `
    <div data-signals="{name: '${escapeSignalValue(opts.name)}', phone: '${escapeSignalValue(opts.phone)}', email: '${escapeSignalValue(opts.email)}', password: '${escapeSignalValue(opts.password)}', isAdmin: ${opts.isAdmin}}">
      <form data-on-submit__prevent="${opts.method}('${opts.action}')">
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Name</label>
          <input class="${inputClass}" type="text" data-bind-name required />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Phone</label>
          <input class="${inputClass}" type="tel" data-bind-phone />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Email</label>
          <input class="${inputClass}" type="email" data-bind-email />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Password</label>
          <input class="${inputClass}" type="password" data-bind-password ${passwordAttr} />
          ${hint}
        </div>
        <div class="mb-6">
          <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
            <input type="checkbox" data-bind-is-admin ${adminDisabledAttr} />
            Admin
          </label>
          ${adminNote}
        </div>
        <div class="flex gap-3">
          <button type="submit" class="${btnAmber}">${opts.submitLabel}</button>
          <button type="button" class="${btnSecondary}" data-on-click="${opts.cancelAction}">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

export function editPanel(v: Volunteer, currentVolunteerId: string): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Volunteer</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
    ${volunteerForm({
			action: `/volunteers/${v.id}`,
			method: "@put",
			submitLabel: "Save",
			name: v.name,
			phone: v.phone ?? "",
			email: v.email ?? "",
			password: "",
			passwordRequired: false,
			passwordHint: "Leave blank to keep current",
			isAdmin: v.isAdmin,
			adminDisabled: v.id === currentVolunteerId,
			cancelAction: `@get('/volunteers/${v.id}')`,
		})}
  `);
}

export function createPanel(): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">New Volunteer</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
    ${volunteerForm({
			action: "/volunteers",
			method: "@post",
			submitLabel: "Create",
			name: "",
			phone: "",
			email: "",
			password: "",
			passwordRequired: true,
			isAdmin: false,
			adminDisabled: false,
			cancelAction: "@get('/volunteers/close')",
		})}
  `);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/unit/volunteerPanel.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/pages/volunteerPanel.ts test/unit/volunteerPanel.test.ts
git commit -m "feat: add volunteer panel component (view/edit/create)"
```

---

### Task 6: Volunteer Routes

**Files:**
- Create: `src/web/routes/volunteers.ts`
- Create: `test/integration/volunteerRoutes.test.ts`

**Step 1: Write the failing test**

Create `test/integration/volunteerRoutes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createVolunteer, changePassword } from "../../src/domain/volunteer/commandHandlers";
import type { VolunteerRepository } from "../../src/domain/volunteer/repository";
import { createEventStore } from "../../src/infrastructure/eventStore";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository";
import { createVolunteerRoutes } from "../../src/web/routes/volunteers";

function signalsRequest(
	signals: Record<string, unknown>,
	method = "POST",
): Request {
	return new Request("http://localhost/volunteers", {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(signals),
	});
}

describe("volunteer routes", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let volunteerRepo: VolunteerRepository;
	let routes: ReturnType<typeof createVolunteerRoutes>;
	let adminId: string;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		volunteerRepo = await SQLiteVolunteerRepository(pool);
		routes = createVolunteerRoutes(volunteerRepo, eventStore);
		const result = await createVolunteer(
			{ name: "Admin", password: "pw", isAdmin: true },
			eventStore,
		);
		adminId = result.id;
	});

	afterEach(async () => {
		await pool.close();
	});

	describe("list", () => {
		test("returns HTML page with volunteers", async () => {
			const res = await routes.list();
			expect(res.headers.get("Content-Type")).toBe("text/html");
			const html = await res.text();
			expect(html).toContain("Admin");
			expect(html).toContain("Volunteers");
		});

		test("returns empty state when no volunteers", async () => {
			// Create fresh store with no volunteers
			const es2 = createEventStore(":memory:");
			const repo2 = await SQLiteVolunteerRepository(es2.pool);
			const routes2 = createVolunteerRoutes(repo2, es2.store);
			const res = await routes2.list();
			const html = await res.text();
			expect(html).toContain("No volunteers yet");
			await es2.pool.close();
		});
	});

	describe("detail", () => {
		test("returns SSE with view panel", async () => {
			const res = await routes.detail(adminId, "other-id");
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");
			const body = await res.text();
			expect(body).toContain("Admin");
			expect(body).toContain("datastar-patch-elements");
		});

		test("returns 404 for unknown id", async () => {
			const res = await routes.detail("nonexistent", adminId);
			expect(res.status).toBe(404);
		});
	});

	describe("handleCreate", () => {
		test("creates volunteer and returns SSE", async () => {
			const req = signalsRequest({
				name: "New Vol",
				phone: "07700900099",
				email: "",
				password: "secret123",
				isAdmin: false,
			});
			const res = await routes.handleCreate(req);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const created = await volunteerRepo.getByName("New Vol");
			expect(created).not.toBeNull();
			expect(created?.isAdmin).toBe(false);
			expect(created?.requiresPasswordReset).toBe(true);
		});

		test("returns 400 when name is missing", async () => {
			const req = signalsRequest({ password: "secret123" });
			const res = await routes.handleCreate(req);
			expect(res.status).toBe(400);
		});

		test("returns 400 when password is missing", async () => {
			const req = signalsRequest({ name: "Test" });
			const res = await routes.handleCreate(req);
			expect(res.status).toBe(400);
		});
	});

	describe("handleUpdate", () => {
		test("updates volunteer and returns SSE", async () => {
			const req = signalsRequest(
				{ name: "Admin Updated", phone: "", email: "", password: "", isAdmin: true },
				"PUT",
			);
			const res = await routes.handleUpdate(adminId, req, adminId);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const updated = await volunteerRepo.getById(adminId);
			expect(updated?.name).toBe("Admin Updated");
		});

		test("ignores isAdmin change when editing self", async () => {
			const req = signalsRequest(
				{ name: "Admin", phone: "", email: "", password: "", isAdmin: false },
				"PUT",
			);
			await routes.handleUpdate(adminId, req, adminId);
			const updated = await volunteerRepo.getById(adminId);
			expect(updated?.isAdmin).toBe(true);
		});
	});

	describe("handleDelete", () => {
		test("deletes volunteer and returns SSE", async () => {
			const { id } = await createVolunteer(
				{ name: "ToDelete", password: "pw" },
				eventStore,
			);
			const res = await routes.handleDelete(id, adminId);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			const deleted = await volunteerRepo.getById(id);
			expect(deleted).toBeNull();
		});

		test("returns 400 when trying to delete self", async () => {
			const res = await routes.handleDelete(adminId, adminId);
			expect(res.status).toBe(400);
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/integration/volunteerRoutes.test.ts`
Expected: FAIL — module not found

**Step 3: Create volunteer routes**

Create `src/web/routes/volunteers.ts`:

```ts
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import {
	createVolunteer,
	deleteVolunteer,
	updateVolunteer,
} from "../../domain/volunteer/commandHandlers.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type { Volunteer } from "../../domain/volunteer/types.ts";
import {
	createPanel,
	editPanel,
	viewPanel,
} from "../pages/volunteerPanel.ts";
import { volunteerRow, volunteersPage } from "../pages/volunteers.ts";
import {
	patchElements,
	ServerSentEventGenerator,
	sseResponse,
} from "../sse.ts";

export function createVolunteerRoutes(
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
	return {
		async list(): Promise<Response> {
			const volunteers = await volunteerRepo.list();
			return new Response(volunteersPage(volunteers), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string, currentVolunteerId: string): Promise<Response> {
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(viewPanel(volunteer, currentVolunteerId)));
		},

		async edit(id: string, currentVolunteerId: string): Promise<Response> {
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(editPanel(volunteer, currentVolunteerId)));
		},

		create(): Response {
			return sseResponse(patchElements(createPanel()));
		},

		closePanel(): Response {
			return sseResponse(patchElements('<div id="panel"></div>'));
		},

		async handleCreate(req: Request): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const data = signalsToVolunteerCreateData(result.signals);
			if (!data) {
				return new Response("Name and password are required", { status: 400 });
			}
			const { id } = await createVolunteer(data, eventStore);
			const volunteers = await volunteerRepo.list();
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			return sseResponse(
				patchElements(volunteersTableBody(volunteers)),
				patchElements(viewPanel(volunteer, "")),
			);
		},

		async handleUpdate(
			id: string,
			req: Request,
			currentVolunteerId: string,
		): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const data = signalsToVolunteerUpdateData(result.signals, id === currentVolunteerId);
			if (!data) {
				return new Response("Name is required", { status: 400 });
			}
			await updateVolunteer(id, data, eventStore);
			const volunteer = await volunteerRepo.getById(id);
			if (!volunteer) return new Response("Not found", { status: 404 });
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements(viewPanel(volunteer, currentVolunteerId)),
				patchElements(volunteersTableBody(volunteers)),
			);
		},

		async handleDelete(id: string, currentVolunteerId: string): Promise<Response> {
			if (id === currentVolunteerId) {
				return new Response("Cannot delete yourself", { status: 400 });
			}
			await deleteVolunteer(id, eventStore);
			const volunteers = await volunteerRepo.list();
			return sseResponse(
				patchElements('<div id="panel"></div>'),
				patchElements(volunteersTableBody(volunteers)),
			);
		},
	};
}

function signalsToVolunteerCreateData(signals: Record<string, unknown>): {
	name: string;
	phone?: string;
	email?: string;
	password: string;
	isAdmin?: boolean;
} | null {
	const name = String(signals.name ?? "").trim();
	const password = String(signals.password ?? "").trim();
	if (!name || !password) return null;

	return {
		name,
		phone: String(signals.phone ?? "").trim() || undefined,
		email: String(signals.email ?? "").trim() || undefined,
		password,
		isAdmin: signals.isAdmin === true,
	};
}

function signalsToVolunteerUpdateData(
	signals: Record<string, unknown>,
	isSelf: boolean,
): {
	name?: string;
	phone?: string | null;
	email?: string | null;
	password?: string;
} | null {
	const name = String(signals.name ?? "").trim();
	if (!name) return null;

	const password = String(signals.password ?? "").trim() || undefined;

	return {
		name,
		phone: String(signals.phone ?? "").trim() || null,
		email: String(signals.email ?? "").trim() || null,
		password,
	};
}

function volunteersTableBody(volunteers: Volunteer[]): string {
	if (volunteers.length === 0) {
		return '<tbody id="volunteer-rows"><tr><td colspan="5" class="text-center py-12 text-bark-muted">No volunteers yet</td></tr></tbody>';
	}
	return `<tbody id="volunteer-rows">${volunteers.map(volunteerRow).join("")}</tbody>`;
}
```

Note: The `handleUpdate` for admin flag changes (when not self) requires extending `updateVolunteer` to accept `isAdmin`. This needs a small update to the `UpdateVolunteer` type and command handler to support updating `isAdmin` when the caller is not the same volunteer. For simplicity, we handle the `isAdmin` flag separately — the update route ignores `isAdmin` from signals when `isSelf` is true, and the `updateVolunteer` command handler doesn't change `isAdmin`. Admin flag changes are not supported through the update flow — they're only set at creation time, matching the design doc ("Set via VolunteerCreated event, not changeable through the UI").

**Step 4: Run test to verify it passes**

Run: `bun test test/integration/volunteerRoutes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/web/routes/volunteers.ts test/integration/volunteerRoutes.test.ts
git commit -m "feat: add volunteer CRUD route handlers"
```

---

### Task 7: Wire Routes into Server and Dashboard

**Files:**
- Modify: `src/web/server.ts`
- Modify: `src/web/pages/dashboard.ts`

**Step 1: Update server.ts**

Add volunteer route imports and wire them up. Follow the exact same pattern as recipient routes.

In `src/web/server.ts`:

Add imports:
```ts
import { createVolunteerRoutes } from "./routes/volunteers.ts";
import { changePasswordPage } from "./pages/changePassword.ts";
import { handleChangePassword } from "./routes/auth.ts";
```

In `startServer`, create volunteer routes:
```ts
const volunteerRoutes = createVolunteerRoutes(volunteerRepo, eventStore);
const changePasswordHandler = handleChangePassword(volunteerRepo, eventStore);
```

Add `requireAdmin` helper:
```ts
function requireAdmin(volunteer: Volunteer | null): boolean {
	return volunteer?.isAdmin === true;
}
```

Add routes to the `routes` object:
```ts
"/change-password": {
	GET: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		return new Response(changePasswordPage(), {
			headers: { "Content-Type": "text/html" },
		});
	},
	POST: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		return changePasswordHandler(req, volunteer.id);
	},
},
"/volunteers": {
	GET: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		if (!requireAdmin(volunteer)) return new Response("Forbidden", { status: 403 });
		return volunteerRoutes.list();
	},
},
"/volunteers/new": {
	GET: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		if (!requireAdmin(volunteer)) return new Response("Forbidden", { status: 403 });
		return volunteerRoutes.create();
	},
},
"/volunteers/close": {
	GET: async (req) => {
		const volunteer = await requireAuth(req);
		if (!volunteer) return Response.redirect("/login", 302);
		if (!requireAdmin(volunteer)) return new Response("Forbidden", { status: 403 });
		return volunteerRoutes.closePanel();
	},
},
```

Add dynamic routes in `fetch()`:
```ts
if (url.pathname === "/volunteers" && req.method === "POST") {
	if (!requireAdmin(volunteer)) return new Response("Forbidden", { status: 403 });
	return volunteerRoutes.handleCreate(req);
}

const volEditMatch = url.pathname.match(/^\/volunteers\/([^/]+)\/edit$/);
if (volEditMatch?.[1] && req.method === "GET") {
	if (!requireAdmin(volunteer)) return new Response("Forbidden", { status: 403 });
	return volunteerRoutes.edit(volEditMatch[1], volunteer.id);
}

const volIdMatch = url.pathname.match(/^\/volunteers\/([^/]+)$/);
if (volIdMatch?.[1]) {
	const id = volIdMatch[1];
	if (!requireAdmin(volunteer)) return new Response("Forbidden", { status: 403 });
	if (req.method === "GET") return volunteerRoutes.detail(id, volunteer.id);
	if (req.method === "PUT") return volunteerRoutes.handleUpdate(id, req, volunteer.id);
	if (req.method === "DELETE") return volunteerRoutes.handleDelete(id, volunteer.id);
}
```

**Step 2: Update dashboard**

In `src/web/pages/dashboard.ts`:

Update `dashboardPage` to accept `Volunteer` type (already does) and conditionally show volunteers card:

```ts
export function dashboardPage(volunteer: Volunteer): string {
	const volunteerCard = volunteer.isAdmin
		? navCard("/volunteers", "\u{1F9D1}\u{200D}\u{1F91D}\u{200D}\u{1F9D1}", "Volunteers", "Manage volunteer accounts")
		: "";

	// ... replace the grid content to include volunteerCard
```

Update the grid to include the conditional card:
```ts
<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
	${navCard("/recipients", "\u{1F465}", "Recipients", "View and manage grant recipients")}
	${navCard("/applications", "\u{1F4CB}", "Applications", "Review incoming applications")}
	${navCard("/grants", "\u{1F4B7}", "Grants", "Track grant payments")}
	${navCard("/lottery", "\u{1F3B2}", "Lottery", "Run monthly draws")}
	${volunteerCard}
</div>
```

**Step 3: Update seed.ts**

Update `src/web/seed.ts` to create an admin volunteer:

```ts
const existing = await repo.getByName("Test");
if (existing) {
	console.log("Test user already exists");
} else {
	await createVolunteer({ name: "Test", password: "test", isAdmin: true }, store);
	console.log("Created test user — name: Test, password: test (admin, requires password reset)");
}
```

**Step 4: Run all tests**

Run: `bun test`
Expected: PASS

**Step 5: Lint and format**

Run: `bunx biome check --write`

**Step 6: Commit**

```bash
git add src/web/server.ts src/web/pages/dashboard.ts src/web/seed.ts
git commit -m "feat: wire volunteer routes into server with admin gate and dashboard card"
```

---

### Task 8: Delete Database and Verify End-to-End

Since schema changed (new columns), the existing dev database needs to be recreated.

**Step 1: Delete old database**

```bash
rm -f csf.db
```

**Step 2: Re-seed**

```bash
bun src/web/seed.ts
```

**Step 3: Start server and manually verify**

```bash
bun --hot src/web/index.ts
```

- Login with Test/test → should redirect to `/change-password`
- Change password → should redirect to dashboard
- Dashboard should show Volunteers card (admin)
- Click Volunteers → list page loads
- Create new volunteer → appears in table
- Click volunteer → view panel
- Edit → save → panel updates
- Delete → confirm → removed

**Step 4: Run full test suite one final time**

```bash
bun test
```

**Step 5: Final commit if any fixes needed**

```bash
bunx biome check --write
git add -A
git commit -m "fix: address any issues from end-to-end verification"
```
