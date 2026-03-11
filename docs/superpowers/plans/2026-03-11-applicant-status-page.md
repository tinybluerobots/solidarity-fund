# Applicant Self-Service Status Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/status?ref=<applicationId>` page showing a read-only progress timeline for applicants to track their grant application.

**Architecture:** Four sequential tasks — (1) expose the reference number on the apply result page, (2) add a `getByApplicationId` query to the grant repository, (3) build the status page HTML renderer and route, (4) link from the volunteer applications list.

**Tech Stack:** Bun, TypeScript, `bun:test`, Tailwind CSS, `bun:sqlite` via `@event-driven-io/emmett-sqlite`, `SQLiteApplicationRepository`, `SQLiteGrantRepository`.

---

## Chunk 1: Reference number + grant lookup

### Task 1: Show reference number on apply result page

The apply result page currently does not display the `applicationId`. We need to pass it through the redirect and render it.

**Files:**
- Modify: `src/web/routes/apply.ts`
- Modify: `src/web/pages/apply.ts`
- Test: `test/unit/applyPage.test.ts`

- [ ] **Step 1: Write failing tests for reference number display**

Add to `test/unit/applyPage.test.ts`:

```ts
describe("applyResultPage — reference number", () => {
  test("shows reference number when provided", () => {
    const html = applyResultPage("accepted", undefined, "abc-123");
    expect(html).toContain("abc-123");
    expect(html).toContain("reference");
  });

  test("omits reference number block when not provided", () => {
    const html = applyResultPage("accepted");
    expect(html).not.toContain("reference number");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun test test/unit/applyPage.test.ts
```

Expected: FAIL — `applyResultPage` does not accept a third argument.

- [ ] **Step 3: Update `applyResultPage` signature and HTML**

In `src/web/pages/apply.ts`, change the function signature and add the reference block:

```ts
export function applyResultPage(status: string, reason?: string, ref?: string): string {
```

Inside the `return publicLayout(...)` call, replace:

```ts
		<p class="text-bark-muted font-body">${escapeHtml(message)}</p>
	</div>
</div>`,
```

with:

```ts
		<p class="text-bark-muted font-body">${escapeHtml(message)}</p>
${ref ? `		<div class="mt-6 pt-4 border-t border-bark-muted/20 text-left">
			<p class="text-xs text-bark-muted font-body mb-1">Your reference number</p>
			<p class="font-mono text-sm text-bark break-all">${escapeHtml(ref)}</p>
			<p class="text-xs text-bark-muted font-body mt-2">Save this to check your application status at <a href="/status?ref=${encodeURIComponent(ref)}" class="underline">/status</a></p>
		</div>` : ""}
	</div>
</div>`,
```

```ts
${ref ? `<div class="mt-6 pt-4 border-t border-bark-muted/20 text-left">
  <p class="text-xs text-bark-muted font-body mb-1">Your reference number</p>
  <p class="font-mono text-sm text-bark break-all">${escapeHtml(ref)}</p>
  <p class="text-xs text-bark-muted font-body mt-2">Save this to check your application status at <a href="/status?ref=${encodeURIComponent(ref)}" class="underline">/status</a></p>
</div>` : ""}
```

- [ ] **Step 4: Pass `applicationId` through redirect in `apply.ts` route**

In `src/web/routes/apply.ts`, in `handleSubmit`, the `applicationId` is already in scope. Update the redirect:

```ts
const params = new URLSearchParams({ status, ref: applicationId });
if (reason) params.set("reason", reason);
return Response.redirect(`/apply/result?${params}`, 302);
```

Update `showResult` to forward `ref` to the page:

```ts
showResult(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "accepted";
  const reason = url.searchParams.get("reason") ?? undefined;
  const ref = url.searchParams.get("ref") ?? undefined;
  return new Response(applyResultPage(status, reason, ref), {
    headers: { "Content-Type": "text/html" },
  });
},
```

- [ ] **Step 5: Run tests**

```bash
bun test test/unit/applyPage.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/pages/apply.ts src/web/routes/apply.ts test/unit/applyPage.test.ts
git commit -m "feat: show reference number on apply result page"
```

---

### Task 2: Add `getByApplicationId` to grant repository

The status route needs to look up a grant by `applicationId`, not `grantId`. This method doesn't exist yet.

**Files:**
- Modify: `src/domain/grant/repository.ts`
- Modify: `src/infrastructure/grant/sqliteGrantRepository.ts`

- [ ] **Step 1: Add method to `GrantRepository` interface**

In `src/domain/grant/repository.ts`, add:

```ts
getByApplicationId(applicationId: string): Promise<GrantRow | null>;
```

- [ ] **Step 2: Implement in `sqliteGrantRepository.ts`**

In `src/infrastructure/grant/sqliteGrantRepository.ts`, inside the returned object, add after `getById`:

```ts
async getByApplicationId(applicationId: string): Promise<GrantRow | null> {
  try {
    return await pool.withConnection(async (conn) => {
      const rows = await conn.query<DbRow>(
        `${SELECT_GRANTS} WHERE g.application_id = ? LIMIT 1`,
        [applicationId],
      );
      return rows.length > 0 ? rowToGrant(rows[0]!) : null;
    });
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
},
```

- [ ] **Step 3: Run full test suite to confirm nothing broken**

```bash
bun test
```

Expected: All existing tests PASS (no tests for this method yet — integration tested via the status route in Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/domain/grant/repository.ts src/infrastructure/grant/sqliteGrantRepository.ts
git commit -m "feat: add getByApplicationId to grant repository"
```

---

## Chunk 2: Status page renderer

### Task 3: Build `statusPage` HTML renderer

All the timeline logic lives here. The route (Task 4) just fetches data and calls these functions.

**Files:**
- Create: `src/web/pages/status.ts`
- Create: `test/unit/statusPage.test.ts`

**Key types used from DB rows:**
- `ApplicationRow.status`: `"applied" | "accepted" | "rejected" | "flagged" | "selected" | "not_selected"` (note: DB uses `"applied"` for the initial inserted status, not `"submitted"`)
- `ApplicationRow.rejectReason`: `string | null`
- `GrantRow.status`: `"awaiting_bank_details" | "bank_details_submitted" | "poa_approved" | "offered_cash_alternative" | "awaiting_cash_handover" | "awaiting_reimbursement" | "reimbursed" | "released"`
- `GrantRow.volunteerId`: `string | null`
- `GrantRow.paymentMethod`: `"bank" | "cash" | null` — only set on `awaiting_reimbursement`/`reimbursed`; for DB `status = "paid"` this is always `"bank"` (cash goes to `awaiting_reimbursement`)

> **Note:** The `GrantCreated` event inserts status `"awaiting_bank_details"` for bank-preference applicants and `"awaiting_cash_handover"` for cash-preference applicants. The `offered_cash_alternative` status only applies to bank applicants whose proof-of-address was rejected 3 times.

- [ ] **Step 1: Write failing tests for lookup form**

Create `test/unit/statusPage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  statusLookupPage,
  statusTimelinePage,
} from "../../src/web/pages/status.ts";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import type { GrantRow } from "../../src/domain/grant/repository.ts";

function makeApp(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: "app-uuid-1",
    applicantId: "applicant-07700900001",
    monthCycle: "2026-03",
    status: "accepted",
    rank: null,
    paymentPreference: "cash",
    name: "Alice",
    phone: "07700900001",
    rejectReason: null,
    appliedAt: "2026-03-01T10:00:00Z",
    acceptedAt: "2026-03-01T10:01:00Z",
    selectedAt: null,
    rejectedAt: null,
    ...overrides,
  };
}

function makeGrant(overrides: Partial<GrantRow> = {}): GrantRow {
  return {
    id: "grant-1",
    applicationId: "app-uuid-1",
    applicantId: "applicant-07700900001",
    monthCycle: "2026-03",
    rank: 1,
    status: "awaiting_bank_details",
    paymentPreference: "bank",
    volunteerId: null,
    volunteerName: null,
    applicantName: "Alice",
    applicantPhone: "07700900001",
    poaAttempts: 0,
    amount: null,
    paymentMethod: null,
    paidBy: null,
    paidAt: null,
    expenseReference: null,
    reimbursedAt: null,
    releasedReason: null,
    releasedAt: null,
    createdAt: "2026-03-10T12:00:00Z",
    updatedAt: "2026-03-10T12:00:00Z",
    ...overrides,
  };
}

describe("statusLookupPage", () => {
  test("renders lookup form", () => {
    const html = statusLookupPage();
    expect(html).toContain('action="/status"');
    expect(html).toContain('name="ref"');
    expect(html).toContain("Check status");
    expect(html).toContain("Your reference number");
  });

  test("renders error message when provided", () => {
    const html = statusLookupPage("We couldn't find an application");
    expect(html).toContain("We couldn't find an application");
  });

  test("no error shown when not provided", () => {
    const html = statusLookupPage();
    expect(html).not.toContain("couldn't find");
  });
});

describe("statusTimelinePage — pre-lottery", () => {
  test("accepted: shows lottery draw pending", () => {
    const html = statusTimelinePage(makeApp({ status: "accepted" }), null);
    expect(html).toContain("Lottery draw");
    expect(html).toContain("pool");
  });

  test("applied: shows lottery draw pending (same as accepted)", () => {
    const html = statusTimelinePage(makeApp({ status: "applied" }), null);
    expect(html).toContain("Lottery draw");
  });

  test("flagged: shows identity check step", () => {
    const html = statusTimelinePage(makeApp({ status: "flagged" }), null);
    expect(html).toContain("Identity check");
    expect(html).toContain("volunteer");
  });

  test("rejected window_closed: shows reason message", () => {
    const html = statusTimelinePage(
      makeApp({ status: "rejected", rejectReason: "window_closed" }),
      null,
    );
    expect(html).toContain("closed");
  });

  test("rejected cooldown: shows reason message", () => {
    const html = statusTimelinePage(
      makeApp({ status: "rejected", rejectReason: "cooldown" }),
      null,
    );
    expect(html).toContain("recently");
  });

  test("rejected duplicate: shows reason message", () => {
    const html = statusTimelinePage(
      makeApp({ status: "rejected", rejectReason: "duplicate" }),
      null,
    );
    expect(html).toContain("already been submitted");
  });

  test("rejected unknown reason: shows generic message", () => {
    const html = statusTimelinePage(
      makeApp({ status: "rejected", rejectReason: "identity_mismatch" }),
      null,
    );
    expect(html).toContain("not accepted");
  });
});

describe("statusTimelinePage — post-lottery", () => {
  test("not_selected: shows lottery drawn and not selected", () => {
    const html = statusTimelinePage(makeApp({ status: "not_selected" }), null);
    expect(html).toContain("Not selected");
    expect(html).toContain("next month");
  });
});

describe("statusTimelinePage — grant states", () => {
  test("selected + awaiting_bank_details no volunteer: shows volunteer being assigned", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "awaiting_bank_details", volunteerId: null }),
    );
    expect(html).toContain("Volunteer being assigned");
  });

  test("selected + awaiting_bank_details with volunteer: shows payment details needed", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "awaiting_bank_details", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Payment details needed");
    expect(html).toContain("Volunteer assigned");
  });

  test("selected + bank_details_submitted: shows POA being reviewed", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "bank_details_submitted", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Proof of address being reviewed");
  });

  test("selected + poa_approved: shows payment being processed", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "poa_approved", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Payment being processed");
    expect(html).toContain("Proof of address approved");
  });

  test("selected + offered_cash_alternative: shows cash alternative step", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "offered_cash_alternative", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Cash alternative");
  });

  test("selected + awaiting_cash_handover: shows cash handover pending", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "awaiting_cash_handover", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Cash handover pending");
  });

  test("selected + paid (bank): shows payment received", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "paid", paymentMethod: "bank", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Payment received");
  });

  test("selected + awaiting_reimbursement: shows payment received (cash complete)", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "awaiting_reimbursement", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Payment received");
    expect(html).toContain("Cash handover complete");
  });

  test("selected + reimbursed: shows payment received", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "reimbursed", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Payment received");
  });

  test("selected + released with volunteer: shows slot released", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "released", volunteerId: "vol-1" }),
    );
    expect(html).toContain("Slot released");
    expect(html).toContain("next month");
    expect(html).toContain("Volunteer assigned");
  });

  test("selected + released without volunteer: shows slot released (no volunteer step)", () => {
    const html = statusTimelinePage(
      makeApp({ status: "selected" }),
      makeGrant({ status: "released", volunteerId: null }),
    );
    expect(html).toContain("Slot released");
    expect(html).not.toContain("Volunteer assigned");
  });

  test("selected + null grant (no grant yet): shows volunteer being assigned", () => {
    const html = statusTimelinePage(makeApp({ status: "selected" }), null);
    expect(html).toContain("Volunteer being assigned");
  });
});
```

- [ ] **Step 2: Run to confirm all fail**

```bash
bun test test/unit/statusPage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/web/pages/status.ts`**

```ts
import type { ApplicationRow } from "../../domain/application/repository.ts";
import type { GrantRow } from "../../domain/grant/repository.ts";
import { getFundName } from "../../config.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(getFundName())} - ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/app.css">
  <style>
    body { background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E"); }
  </style>
</head>
<body class="font-body bg-cream-100 text-bark min-h-screen flex items-center justify-center p-4">
${body}
</body>
</html>`;
}

type StepStatus = "done" | "current" | "current-purple" | "failed" | "future";

type Step = {
  label: string;
  note?: string;
  status: StepStatus;
};

function stepDot(status: StepStatus): string {
  switch (status) {
    case "done":
      return `<div class="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 text-white text-xs">✓</div>`;
    case "current":
      return `<div class="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">⋯</div>`;
    case "current-purple":
      return `<div class="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">⋯</div>`;
    case "failed":
      return `<div class="w-6 h-6 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center flex-shrink-0 text-red-500 text-xs font-bold">✗</div>`;
    case "future":
      return `<div class="w-6 h-6 rounded-full bg-cream-200 border-2 border-bark-muted/30 flex items-center justify-center flex-shrink-0 text-bark-muted text-xs">○</div>`;
  }
}

function stepLabel(step: Step): string {
  const color =
    step.status === "done" ? "text-bark font-semibold"
    : step.status === "current" ? "text-amber-700 font-semibold"
    : step.status === "current-purple" ? "text-purple-700 font-semibold"
    : step.status === "failed" ? "text-red-600 font-semibold"
    : "text-bark-muted";
  return `<span class="text-sm ${color}">${escapeHtml(step.label)}</span>
${step.note ? `<span class="text-xs text-bark-muted block mt-0.5">${escapeHtml(step.note)}</span>` : ""}`;
}

function renderTimeline(steps: Step[]): string {
  return steps
    .map((step, i) => {
      const isLast = i === steps.length - 1;
      return `<div class="flex gap-3 items-start">
    <div class="flex flex-col items-center">
      ${stepDot(step.status)}
      ${!isLast ? `<div class="w-0.5 flex-1 min-h-[20px] bg-bark-muted/20 my-1"></div>` : ""}
    </div>
    <div class="pb-4 pt-0.5">
      ${stepLabel(step)}
    </div>
  </div>`;
    })
    .join("\n");
}

function rejectionMessage(reason: string | null): string {
  switch (reason) {
    case "window_closed":
      return "Applications are currently closed";
    case "cooldown":
      return "You've received a grant recently and are not yet eligible to apply again";
    case "duplicate":
      return "An application has already been submitted for this contact";
    default:
      return "Your application was not accepted";
  }
}

function buildSteps(app: ApplicationRow, grant: GrantRow | null): Step[] {
  const applied: Step = { label: "Applied", status: "done" };

  // Pre-lottery: rejected
  if (app.status === "rejected") {
    return [
      applied,
      {
        label: "Not eligible",
        note: rejectionMessage(app.rejectReason),
        status: "failed",
      },
    ];
  }

  // Pre-lottery: flagged for identity check
  if (app.status === "flagged") {
    return [
      applied,
      {
        label: "Identity check",
        note: "A volunteer is reviewing your details",
        status: "current-purple",
      },
      { label: "Lottery draw", status: "future" },
      { label: "Grant outcome", status: "future" },
    ];
  }

  // Pre-lottery: confirmed after identity check
  if (app.status === "confirmed") {
    return [
      applied,
      { label: "Identity check", status: "done" },
      {
        label: "Lottery draw",
        note: "You're in the pool",
        status: "current",
      },
      { label: "Grant outcome", status: "future" },
    ];
  }

  // Pre-lottery: in pool (applied or accepted)
  if (app.status === "applied" || app.status === "accepted") {
    return [
      applied,
      {
        label: "Lottery draw",
        note: "You're in the pool",
        status: "current",
      },
      { label: "Grant outcome", status: "future" },
    ];
  }

  // Post-lottery: not selected
  if (app.status === "not_selected") {
    return [
      applied,
      { label: "Lottery draw", status: "done" },
      {
        label: "Not selected",
        note: "You can apply again next month",
        status: "failed",
      },
    ];
  }

  // Post-lottery: selected — map grant state
  const selected: Step = { label: "Selected 🎉", status: "done" };

  // No grant record yet
  if (!grant || grant.status === "initial") {
    return [
      applied,
      selected,
      { label: "Volunteer being assigned", status: "current" },
      { label: "Payment", status: "future" },
    ];
  }

  const hasVolunteer = !!grant.volunteerId;
  const volunteerAssigned: Step = { label: "Volunteer assigned", status: "done" };
  const paid: Step = { label: "Payment received", status: "done" };

  switch (grant.status) {
    case "awaiting_bank_details":
      if (!hasVolunteer) {
        return [
          applied,
          selected,
          { label: "Volunteer being assigned", status: "current" },
          { label: "Payment", status: "future" },
        ];
      }
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Payment details needed", status: "current" },
        { label: "Paid", status: "future" },
      ];

    case "bank_details_submitted":
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Proof of address being reviewed", status: "current" },
        { label: "Paid", status: "future" },
      ];

    case "poa_approved":
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Proof of address approved", status: "done" },
        { label: "Payment being processed", status: "current" },
        { label: "Paid", status: "future" },
      ];

    case "offered_cash_alternative":
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Cash alternative arranged", status: "current" },
        { label: "Paid", status: "future" },
      ];

    case "awaiting_cash_handover":
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Cash handover pending", status: "current" },
        { label: "Paid", status: "future" },
      ];

    case "paid":
      // DB status "paid" is always bank (cash goes to awaiting_reimbursement)
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Payment processed", status: "done" },
        paid,
      ];

    case "awaiting_reimbursement":
    case "reimbursed":
      // Cash payment complete from applicant's perspective
      return [
        applied,
        selected,
        volunteerAssigned,
        { label: "Cash handover complete", status: "done" },
        paid,
      ];

    case "released":
      if (hasVolunteer) {
        return [
          applied,
          selected,
          volunteerAssigned,
          {
            label: "Slot released",
            note: "Your grant slot was released. You can apply again next month.",
            status: "failed",
          },
        ];
      }
      return [
        applied,
        selected,
        {
          label: "Slot released",
          note: "Your grant slot was released. You can apply again next month.",
          status: "failed",
        },
      ];

    default:
      return [applied, selected, { label: "Grant in progress", status: "current" }];
  }
}

export function statusLookupPage(error?: string): string {
  const errorHtml = error
    ? `<p class="text-red-600 text-sm font-body mb-4">${escapeHtml(error)}</p>`
    : "";
  return publicLayout(
    "Check Application Status",
    `<div class="w-full max-w-md">
  <div class="card p-8">
    <h1 class="font-heading text-2xl font-bold text-bark mb-2 text-center">Check Your Status</h1>
    <p class="text-bark-muted font-body text-sm text-center mb-6">Enter the reference number from your application confirmation.</p>
    ${errorHtml}
    <form action="/status" method="GET" class="space-y-4">
      <div>
        <label for="ref" class="block text-sm font-body text-bark mb-1">Your reference number</label>
        <input
          type="text"
          id="ref"
          name="ref"
          required
          placeholder="e.g. a1b2c3d4-…"
          class="input font-mono"
        />
      </div>
      <button type="submit" class="btn-primary w-full">Check status</button>
    </form>
  </div>
</div>`,
  );
}

export function statusTimelinePage(
  app: ApplicationRow,
  grant: GrantRow | null,
): string {
  const steps = buildSteps(app, grant);
  const timeline = renderTimeline(steps);
  return publicLayout(
    "Application Status",
    `<div class="w-full max-w-md">
  <div class="card p-8">
    <h1 class="font-heading text-2xl font-bold text-bark mb-1 text-center">Application Status</h1>
    <p class="text-bark-muted font-body text-xs text-center mb-6">Ref: <span class="font-mono">${escapeHtml(app.id)}</span></p>
    <div class="space-y-0">
      ${timeline}
    </div>
    <div class="mt-6 pt-4 border-t border-bark-muted/20 text-center">
      <a href="/status" class="text-xs text-bark-muted underline font-body">Check a different reference</a>
    </div>
  </div>
</div>`,
  );
}
```

- [ ] **Step 4: Run tests**

```bash
bun test test/unit/statusPage.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/status.ts test/unit/statusPage.test.ts
git commit -m "feat: add status page HTML renderer with timeline"
```

---

## Chunk 3: Route + volunteer link

### Task 4: Create status route and register it

**Files:**
- Create: `src/web/routes/status.ts`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Implement `src/web/routes/status.ts`**

```ts
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import type { GrantRepository } from "../../domain/grant/repository.ts";
import { statusLookupPage, statusTimelinePage } from "../pages/status.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND_MSG =
  "We couldn't find an application with that reference number. Please check and try again.";

export function createStatusRoutes(
  appRepo: ApplicationRepository,
  grantRepo: GrantRepository,
) {
  return {
    async show(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const ref = url.searchParams.get("ref")?.trim() ?? "";

      // No ref — show blank lookup form
      if (!ref) {
        return html(statusLookupPage());
      }

      // Malformed ref — skip DB query
      if (!UUID_RE.test(ref)) {
        return html(statusLookupPage(NOT_FOUND_MSG));
      }

      // Lookup application
      let app;
      try {
        app = await appRepo.getById(ref);
      } catch {
        return html(statusLookupPage(NOT_FOUND_MSG));
      }

      if (!app || app.status === "initial") {
        return html(statusLookupPage(NOT_FOUND_MSG));
      }

      // Lookup grant if selected
      let grant = null;
      if (app.status === "selected") {
        try {
          grant = await grantRepo.getByApplicationId(ref);
        } catch {
          // Non-fatal: render without grant (shows "volunteer being assigned")
        }
      }

      return html(statusTimelinePage(app, grant));
    },
  };
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html" } });
}
```

- [ ] **Step 2: Register route in `server.ts`**

In `src/web/server.ts`:

Add import at the top:
```ts
import { createStatusRoutes } from "./routes/status.ts";
```

Inside `startServer`, after `const grantRepo = SQLiteGrantRepository(pool);`:
```ts
const statusRoutes = createStatusRoutes(appRepo, grantRepo);
```

In the `routes` object:
```ts
"/status": {
  GET: (req) => statusRoutes.show(req),
},
```

- [ ] **Step 3: Run full test suite**

```bash
bun test
```

Expected: All PASS.

- [ ] **Step 4: Smoke test manually**

```bash
bun run src/index.ts
```

Visit `http://localhost:3000/status` — should show the lookup form.
Visit `http://localhost:3000/status?ref=not-a-uuid` — should show the "not found" error.

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/status.ts src/web/server.ts
git commit -m "feat: add /status route for applicant self-service status page"
```

---

### Task 5: Add "View status page" link in applications list

**Files:**
- Modify: `src/web/pages/applications.ts`
- Test: `test/unit/applicationsPage.test.ts`

- [ ] **Step 1: Write failing test**

Add to `test/unit/applicationsPage.test.ts`:

```ts
test("includes link to applicant status page per row", () => {
  const html = applicationsPage([app], ["2026-03"], "2026-03");
  expect(html).toContain(`/status?ref=${app.id}`);
  expect(html).toContain('target="_blank"');
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
bun test test/unit/applicationsPage.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add link to applications table row**

In `src/web/pages/applications.ts`, find the row rendering for each application (the `<tr>` with `data-on-click`). Add a new cell or an icon link in the row. Find the line with `data-on-click="@get('/applications/${...}')"` and add a status link cell after the existing status badge cell:

```ts
<td class="px-4 py-3">
  <a
    href="/status?ref=${encodeURIComponent(a.id)}"
    target="_blank"
    class="text-xs text-bark-muted underline hover:text-bark"
    title="View applicant status page"
    onclick="event.stopPropagation()"
  >Status ↗</a>
</td>
```

> Make sure the `<th>` header row also gets a matching labelled header cell (e.g. `<th class="px-4 py-3 text-left">Status page</th>`). Also update any `colspan` attributes in the empty-state row from `5` to `6`.

- [ ] **Step 4: Run tests**

```bash
bun test test/unit/applicationsPage.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/pages/applications.ts test/unit/applicationsPage.test.ts
git commit -m "feat: add status page link to applications list"
```

---

## Final verification

- [ ] **Lint and format**

```bash
bunx biome check --write
```

- [ ] **Full test run**

```bash
bun test
```

Expected: All PASS, no new failures.

- [ ] **Manual walkthrough**

1. Apply at `/apply` — note the reference number shown on the result page.
2. Visit `/status?ref=<that-reference>` — should show the timeline.
3. Try `/status?ref=garbage` — should show the not-found message.
4. Visit `/applications` as a volunteer — should see "Status ↗" links per row.
