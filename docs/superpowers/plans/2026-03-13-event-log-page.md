# Event Log Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/logs` page to the dashboard showing a paginated, compact table of all domain events for diagnostics.

**Architecture:** Query Emmett's `emt_messages` SQLite table directly with LIMIT/OFFSET pagination. A pure `describeEvent` formatter maps each event type to a human-readable sentence. The route handler takes a `SQLiteConnectionPool` and returns a full-page HTML response.

**Tech Stack:** Bun, bun:sqlite via `SQLiteConnectionPool.withConnection`, Tailwind v4, `layout()` wrapper from `src/web/pages/layout.ts`.

---

## Chunk 1: Formatter + Page Function

### Task 1: `describeEvent` — unit tests

**Files:**
- Create: `src/web/pages/logs.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// src/web/pages/logs.test.ts
import { describe, expect, it } from "bun:test";
import { describeEvent } from "./logs.ts";

describe("describeEvent", () => {
  it("ApplicationSubmitted uses first 8 chars of applicationId", () => {
    const result = describeEvent("ApplicationSubmitted", {
      applicationId: "abcdef1234567890",
    });
    expect(result).toContain("abcdef12");
    expect(result).toContain("submitted");
  });

  it("ApplicationAccepted", () => {
    const result = describeEvent("ApplicationAccepted", {
      applicationId: "abcdef1234567890",
    });
    expect(result).toContain("abcdef12");
    expect(result).toContain("accepted");
  });

  it("ApplicationRejected includes reason", () => {
    const result = describeEvent("ApplicationRejected", {
      applicationId: "abcdef1234567890",
      reason: "does not meet criteria",
    });
    expect(result).toContain("abcdef12");
    expect(result).toContain("rejected");
    expect(result).toContain("does not meet criteria");
  });

  it("ApplicationFlaggedForReview includes reason", () => {
    const result = describeEvent("ApplicationFlaggedForReview", {
      applicationId: "aabbccdd11223344",
      reason: "suspected duplicate",
    });
    expect(result).toContain("aabbccdd");
    expect(result).toContain("flagged");
    expect(result).toContain("suspected duplicate");
  });

  it("ApplicationSelected includes rank", () => {
    const result = describeEvent("ApplicationSelected", {
      applicationId: "aabbccdd11223344",
      rank: 3,
    });
    expect(result).toContain("aabbccdd");
    expect(result).toContain("selected");
    expect(result).toContain("3");
  });

  it("ApplicationNotSelected", () => {
    const result = describeEvent("ApplicationNotSelected", {
      applicationId: "aabbccdd11223344",
    });
    expect(result).toContain("aabbccdd");
    expect(result).toContain("not selected");
  });

  it("ApplicationConfirmed", () => {
    const result = describeEvent("ApplicationConfirmed", {
      applicationId: "aabbccdd11223344",
    });
    expect(result).toContain("aabbccdd");
    expect(result).toContain("confirmed");
  });

  it("ApplicantCreated includes name", () => {
    const result = describeEvent("ApplicantCreated", { name: "Maria Santos" });
    expect(result).toContain("Maria Santos");
    expect(result).toContain("created");
  });

  it("ApplicantUpdated includes name", () => {
    const result = describeEvent("ApplicantUpdated", { name: "Maria Santos" });
    expect(result).toContain("Maria Santos");
    expect(result).toContain("updated");
  });

  it("ApplicantDeleted", () => {
    const result = describeEvent("ApplicantDeleted", {});
    expect(result).toContain("deleted");
  });

  it("VolunteerCreated includes name", () => {
    const result = describeEvent("VolunteerCreated", { name: "Alex Kim" });
    expect(result).toContain("Alex Kim");
    expect(result).toContain("created");
  });

  it("VolunteerUpdated includes name", () => {
    const result = describeEvent("VolunteerUpdated", { name: "Alex Kim" });
    expect(result).toContain("Alex Kim");
    expect(result).toContain("updated");
  });

  it("VolunteerDisabled", () => {
    expect(describeEvent("VolunteerDisabled", {})).toContain("disabled");
  });

  it("VolunteerEnabled", () => {
    expect(describeEvent("VolunteerEnabled", {})).toContain("re-enabled");
  });

  it("PasswordChanged", () => {
    expect(describeEvent("PasswordChanged", {})).toContain("Password changed");
  });

  it("GrantCreated includes paymentPreference", () => {
    const result = describeEvent("GrantCreated", {
      paymentPreference: "bank_transfer",
    });
    expect(result).toContain("bank_transfer");
  });

  it("GrantPaid includes amount and method", () => {
    const result = describeEvent("GrantPaid", { amount: 350, method: "bank_transfer" });
    expect(result).toContain("350");
    expect(result).toContain("bank_transfer");
  });

  it("SlotReleased includes reason", () => {
    const result = describeEvent("SlotReleased", { reason: "applicant withdrew" });
    expect(result).toContain("applicant withdrew");
  });

  it("LotteryDrawn includes selected count, amount, cycle", () => {
    const result = describeEvent("LotteryDrawn", {
      selected: ["a", "b", "c"],
      grantAmount: 300,
      monthCycle: "2026-02",
    });
    expect(result).toContain("3");
    expect(result).toContain("300");
    expect(result).toContain("2026-02");
  });

  it("ApplicationWindowOpened includes monthCycle", () => {
    const result = describeEvent("ApplicationWindowOpened", {
      monthCycle: "2026-03",
    });
    expect(result).toContain("opened");
    expect(result).toContain("2026-03");
  });

  it("ApplicationWindowClosed includes monthCycle", () => {
    const result = describeEvent("ApplicationWindowClosed", {
      monthCycle: "2026-03",
    });
    expect(result).toContain("closed");
    expect(result).toContain("2026-03");
  });

  it("VolunteerAssigned", () => {
    expect(describeEvent("VolunteerAssigned", {})).toContain("assigned");
  });

  it("BankDetailsUpdated", () => {
    expect(describeEvent("BankDetailsUpdated", {})).toContain("Bank details");
  });

  it("ProofOfAddressApproved", () => {
    expect(describeEvent("ProofOfAddressApproved", {})).toContain("approved");
  });

  it("ProofOfAddressRejected includes reason", () => {
    const result = describeEvent("ProofOfAddressRejected", { reason: "blurry" });
    expect(result).toContain("rejected");
    expect(result).toContain("blurry");
  });

  it("CashAlternativeOffered", () => {
    expect(describeEvent("CashAlternativeOffered", {})).toContain("offered");
  });

  it("CashAlternativeAccepted", () => {
    expect(describeEvent("CashAlternativeAccepted", {})).toContain("accepted");
  });

  it("CashAlternativeDeclined", () => {
    expect(describeEvent("CashAlternativeDeclined", {})).toContain("declined");
  });

  it("VolunteerReimbursed includes expenseReference", () => {
    const result = describeEvent("VolunteerReimbursed", { expenseReference: "EXP-001" });
    expect(result).toContain("EXP-001");
  });

  it("unknown event type returns empty string", () => {
    expect(describeEvent("SomeUnknownEvent", {})).toBe("");
  });

  it("escapes HTML in user-supplied values", () => {
    const result = describeEvent("ApplicantCreated", {
      name: '<script>alert("xss")</script>',
    });
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("handles missing fields gracefully (no crash)", () => {
    expect(() => describeEvent("ApplicationSubmitted", {})).not.toThrow();
    expect(() => describeEvent("ApplicationRejected", {})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail with "cannot find module"**

```bash
bun test src/web/pages/logs.test.ts
```

Expected: error — `Cannot find module './logs.ts'`

---

### Task 2: `describeEvent` + `logsPage` implementation

**Files:**
- Create: `src/web/pages/logs.ts`

- [ ] **Step 3: Create `src/web/pages/logs.ts`**

```typescript
import { layout } from "./layout.ts";

export type LogRow = {
  global_position: number;
  created: string;
  message_type: string;
  message_data: string;
};

export function logsPage(
  rows: LogRow[],
  page: number,
  totalPages: number,
  totalCount: number,
): string {
  return layout(
    "Event Log",
    `
<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="font-heading font-bold text-2xl">Event Log</h1>
      <p class="text-bark-muted text-sm mt-1">${totalCount} events · Page ${page} of ${totalPages}</p>
    </div>
    <a href="/dashboard" class="btn btn-secondary text-sm">← Dashboard</a>
  </div>

  ${paginationControls(page, totalPages)}

  <div class="card mt-4 overflow-hidden">
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="bg-cream-100">
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-16">#</th>
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-32">Time</th>
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-56">Type</th>
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200">Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? emptyRow() : rows.map(renderRow).join("")}
      </tbody>
    </table>
  </div>

  ${totalPages > 1 ? paginationControls(page, totalPages) : ""}
</div>
`,
  );
}

function emptyRow(): string {
  return `<tr><td colspan="4" class="px-3 py-8 text-center text-bark-muted text-sm">No events yet.</td></tr>`;
}

function renderRow(row: LogRow): string {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.message_data) as Record<string, unknown>;
  } catch {
    // leave data empty — describeEvent handles missing fields
  }

  const description = describeEvent(row.message_type, data);

  return `<tr class="border-b border-cream-200 hover:bg-cream-50 transition-colors">
    <td class="px-3 py-2 font-mono text-xs text-bark-muted">${row.global_position}</td>
    <td class="px-3 py-2 text-bark-muted whitespace-nowrap">${relativeTime(row.created)}</td>
    <td class="px-3 py-2"><span class="${badgeClass(row.message_type)} inline-block text-xs px-1.5 py-0.5 rounded font-mono font-semibold">${escapeHtml(row.message_type)}</span></td>
    <td class="px-3 py-2 text-bark-light">${description}</td>
  </tr>`;
}

function paginationControls(page: number, totalPages: number): string {
  const prev =
    page > 1
      ? `<a href="/logs?page=${page - 1}" class="btn btn-secondary text-xs">← Prev</a>`
      : `<span class="btn btn-secondary text-xs opacity-40 cursor-not-allowed">← Prev</span>`;

  const next =
    page < totalPages
      ? `<a href="/logs?page=${page + 1}" class="btn btn-secondary text-xs">Next →</a>`
      : `<span class="btn btn-secondary text-xs opacity-40 cursor-not-allowed">Next →</span>`;

  return `<div class="flex items-center gap-2">${prev}${next}</div>`;
}

function badgeClass(type: string): string {
  if (type === "ApplicationWindowOpened" || type === "ApplicationWindowClosed" || type.startsWith("Lottery")) {
    return "bg-pink-100 text-pink-800";
  }
  if (type.startsWith("Application")) return "bg-yellow-100 text-yellow-800";
  if (type.startsWith("Applicant")) return "bg-blue-100 text-blue-800";
  if (type.startsWith("Volunteer") || type === "PasswordChanged") return "bg-purple-100 text-purple-800";
  if (type.startsWith("Grant") || type === "VolunteerReimbursed") return "bg-green-100 text-green-800";
  return "bg-cream-200 text-bark-muted";
}

export function describeEvent(
  type: string,
  data: Record<string, unknown>,
): string {
  const appRef = () =>
    escapeHtml(String(data.applicationId ?? "").slice(0, 8));

  switch (type) {
    case "ApplicationSubmitted":
      return `Application submitted · ref <strong>${appRef()}</strong>`;
    case "ApplicationAccepted":
      return `Application <strong>${appRef()}</strong> accepted`;
    case "ApplicationRejected":
      return `Application <strong>${appRef()}</strong> rejected · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "ApplicationFlaggedForReview":
      return `Application <strong>${appRef()}</strong> flagged · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "ApplicationSelected":
      return `Application <strong>${appRef()}</strong> selected · rank ${escapeHtml(String(data.rank ?? ""))}`;
    case "ApplicationNotSelected":
      return `Application <strong>${appRef()}</strong> not selected`;
    case "ApplicationConfirmed":
      return `Application <strong>${appRef()}</strong> confirmed`;
    case "ApplicationWindowOpened":
      return `Application window opened · ${escapeHtml(String(data.monthCycle ?? ""))}`;
    case "ApplicationWindowClosed":
      return `Application window closed · ${escapeHtml(String(data.monthCycle ?? ""))}`;
    case "ApplicantCreated":
      return `Applicant <strong>${escapeHtml(String(data.name ?? ""))}</strong> created`;
    case "ApplicantUpdated":
      return `Applicant <strong>${escapeHtml(String(data.name ?? ""))}</strong> updated`;
    case "ApplicantDeleted":
      return `Applicant deleted`;
    case "VolunteerCreated":
      return `Volunteer <strong>${escapeHtml(String(data.name ?? ""))}</strong> created`;
    case "VolunteerUpdated":
      return `Volunteer <strong>${escapeHtml(String(data.name ?? ""))}</strong> updated`;
    case "VolunteerDisabled":
      return `Volunteer disabled`;
    case "VolunteerEnabled":
      return `Volunteer re-enabled`;
    case "PasswordChanged":
      return `Password changed`;
    case "GrantCreated":
      return `Grant created · ${escapeHtml(String(data.paymentPreference ?? ""))}`;
    case "GrantPaid":
      return `<strong>£${escapeHtml(String(data.amount ?? ""))}</strong> paid via ${escapeHtml(String(data.method ?? ""))}`;
    case "SlotReleased":
      return `Grant slot released · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "VolunteerAssigned":
      return `Volunteer assigned to grant`;
    case "BankDetailsUpdated":
      return `Bank details updated`;
    case "ProofOfAddressApproved":
      return `Proof of address approved`;
    case "ProofOfAddressRejected":
      return `Proof of address rejected · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "CashAlternativeOffered":
      return `Cash alternative offered`;
    case "CashAlternativeAccepted":
      return `Cash alternative accepted`;
    case "CashAlternativeDeclined":
      return `Cash alternative declined`;
    case "VolunteerReimbursed":
      return `Volunteer reimbursed · ref ${escapeHtml(String(data.expenseReference ?? ""))}`;
    case "LotteryDrawn": {
      const selected = Array.isArray(data.selected) ? data.selected.length : 0;
      return `<strong>${selected}</strong> selected · <strong>£${escapeHtml(String(data.grantAmount ?? ""))}</strong> each · cycle ${escapeHtml(String(data.monthCycle ?? ""))}`;
    }
    default:
      return "";
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffHr < 48) return "Yesterday";

  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
bun test src/web/pages/logs.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/logs.ts src/web/pages/logs.test.ts
git commit -m "feat: add describeEvent formatter and logsPage function"
```

---

## Chunk 2: Route Handler + Wiring

### Task 3: `createLogsRoutes` — unit tests + implementation

**Files:**
- Create: `src/web/routes/logs.ts`
- Create: `src/web/routes/logs.test.ts`

- [ ] **Step 1: Write pagination unit tests**

```typescript
// src/web/routes/logs.test.ts
import { describe, expect, it } from "bun:test";
import { parsePage, calcOffset, calcTotalPages } from "./logs.ts";

describe("parsePage", () => {
  it("defaults to 1 when param absent", () => {
    expect(parsePage(null, 5)).toBe(1);
  });

  it("parses valid integer", () => {
    expect(parsePage("3", 5)).toBe(3);
  });

  it("clamps below 1 to 1", () => {
    expect(parsePage("0", 5)).toBe(1);
    expect(parsePage("-5", 5)).toBe(1);
  });

  it("clamps above totalPages to totalPages", () => {
    expect(parsePage("99", 5)).toBe(5);
  });

  it("clamps to 1 when totalPages is 0", () => {
    expect(parsePage("1", 0)).toBe(1);
  });

  it("ignores non-numeric input", () => {
    expect(parsePage("abc", 5)).toBe(1);
  });
});

describe("calcOffset", () => {
  it("page 1 → offset 0", () => {
    expect(calcOffset(1)).toBe(0);
  });

  it("page 2 → offset 25", () => {
    expect(calcOffset(2)).toBe(25);
  });

  it("page 3 → offset 50", () => {
    expect(calcOffset(3)).toBe(50);
  });
});

describe("calcTotalPages", () => {
  it("0 events → 1 page", () => {
    expect(calcTotalPages(0)).toBe(1);
  });

  it("25 events → 1 page", () => {
    expect(calcTotalPages(25)).toBe(1);
  });

  it("26 events → 2 pages", () => {
    expect(calcTotalPages(26)).toBe(2);
  });

  it("50 events → 2 pages", () => {
    expect(calcTotalPages(50)).toBe(2);
  });

  it("51 events → 3 pages", () => {
    expect(calcTotalPages(51)).toBe(3);
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

```bash
bun test src/web/routes/logs.test.ts
```

Expected: error — `Cannot find module './logs.ts'`

- [ ] **Step 3: Create `src/web/routes/logs.ts`**

```typescript
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { logsPage, type LogRow } from "../pages/logs.ts";

const PAGE_SIZE = 25;

export function parsePage(param: string | null, totalPages: number): number {
  const safeTotalPages = Math.max(1, totalPages);
  if (!param) return 1;
  const n = parseInt(param, 10);
  if (isNaN(n)) return 1;
  return Math.min(Math.max(1, n), safeTotalPages);
}

export function calcOffset(page: number): number {
  return (page - 1) * PAGE_SIZE;
}

export function calcTotalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function createLogsRoutes(pool: ReturnType<typeof SQLiteConnectionPool>) {
  return {
    async list(req: Request): Promise<Response> {
      try {
        const url = new URL(req.url);

        const { rows, total, pages, page } = await pool.withConnection(
          async (conn) => {
            const countRows = await conn.query<{ total: number }>(
              `SELECT COUNT(*) AS total FROM emt_messages WHERE message_kind = 'E'`,
              [],
            );
            const total = countRows[0]?.total ?? 0;
            const pages = calcTotalPages(total);
            const page = parsePage(url.searchParams.get("page"), pages);
            const offset = calcOffset(page);

            const rows = await conn.query<LogRow>(
              `SELECT global_position, created, message_type, message_data
               FROM emt_messages
               WHERE message_kind = 'E'
               ORDER BY global_position DESC
               LIMIT ${PAGE_SIZE} OFFSET ?`,
              [offset],
            );

            return { rows, total, pages, page };
          },
        );

        const html = logsPage(rows, page, pages, total);
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (err) {
        console.error("logs route error:", err);
        return new Response("Internal error", { status: 500 });
      }
    },
  };
}
```

> **Note:** `pool.withConnection` passes the callback's return value straight through. `conn.query<T>(sql, params)` returns `T[]`. See `src/infrastructure/application/sqliteApplicationRepository.ts` for the exact usage pattern.

- [ ] **Step 4: Run tests**

```bash
bun test src/web/routes/logs.test.ts
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/logs.ts src/web/routes/logs.test.ts
git commit -m "feat: add logs route handler with pagination"
```

---

### Task 4: Wire into server + dashboard card

**Files:**
- Modify: `src/web/server.ts`
- Modify: `src/web/pages/dashboard.ts`

- [ ] **Step 6: Add `logsRoutes` to `startServer` in `src/web/server.ts`**

**At the top of the file**, alongside the other route imports:

```typescript
import { createLogsRoutes } from "./routes/logs.ts";
```

**Inside `startServer`**, after the line that creates `volunteerRoutes`:

```typescript
const logsRoutes = createLogsRoutes(pool);
```

- [ ] **Step 7: Register the `/logs` route in `src/web/server.ts`**

Inside the main request handler, find the block that guards `/volunteers` with `isAdmin`. Add the `/logs` route immediately before or after it (keep admin routes grouped):

```typescript
if (url.pathname === "/logs" && req.method === "GET") {
  if (!volunteer.isAdmin) return withSecurityHeaders(new Response("Forbidden", { status: 403 }));
  return withSecurityHeaders(await logsRoutes.list(req));
}
```

- [ ] **Step 8: Add nav card to dashboard**

In `src/web/pages/dashboard.ts`, find the line that conditionally renders the Volunteers card. Add a second admin-only card for Event Log:

```typescript
// existing:
${volunteer.isAdmin ? navCard("/volunteers", "\u{1F9D1}\u{200D}\u{1F91D}\u{200D}\u{1F9D1}", "Volunteers", "Manage volunteer accounts") : ""}
// add after:
${volunteer.isAdmin ? navCard("/logs", "\u{1F4CB}", "Event Log", "Diagnostic event history") : ""}
```

- [ ] **Step 9: Smoke test the route manually**

```bash
bun run index.ts
```

Navigate to `http://localhost:3000/logs` as an admin user. Confirm:
- Table renders with event rows
- Pagination controls appear when there are >25 events
- Prev/Next links work
- Non-admin user gets 403
- Unauthenticated user is redirected to `/login`

- [ ] **Step 10: Run full test suite**

```bash
bun test
```

Expected: all existing tests pass, new tests pass

- [ ] **Step 11: Lint and format**

```bash
bunx biome check --write
```

Fix any reported issues.

- [ ] **Step 12: Final commit**

```bash
git add src/web/server.ts src/web/pages/dashboard.ts
git commit -m "feat: wire event log route into server and dashboard nav"
```
