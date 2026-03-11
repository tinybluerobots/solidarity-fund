# Apply Form: Bank Details + POA at Application Time — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow bank-payment applicants to upload POA and bank details at apply time, skipping the `awaiting_bank_details` grant step when all details are present.

**Architecture:** Rename `GrantDocumentStore` → `DocumentStore` (shared between applications and grants). Add optional `bankDetails` through the application domain to the grant process manager. The grant decider emits three events atomically when bank details are fully present, landing the grant directly at `poa_approved`. The apply route accepts a POA file upload and stores it using the `applicationId` as the entity key (which equals `grantId` in this system).

**Tech Stack:** TypeScript, Bun, Emmett (event sourcing), bun:sqlite, bun:test

---

## Chunk 1: Rename GrantDocumentStore → DocumentStore

### Task 1: Create `DocumentStore` (rename from `grantDocuments.ts`)

**Files:**
- Create: `src/infrastructure/projections/documents.ts`
- Delete: `src/infrastructure/projections/grantDocuments.ts`
- Rename test: `test/integration/grantDocuments.test.ts` → `test/integration/documents.test.ts`

- [ ] **Step 1: Write failing test in new file**

Create `test/integration/documents.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { DocumentStore } from "../../src/infrastructure/projections/documents.ts";

describe("DocumentStore", () => {
  let pool: ReturnType<typeof SQLiteConnectionPool>;
  let docStore: ReturnType<typeof DocumentStore>;

  beforeEach(async () => {
    const es = createEventStore(":memory:");
    pool = es.pool;
    docStore = DocumentStore(pool);
    await docStore.init();
  });

  afterEach(async () => {
    await pool.close();
  });

  test("store and retrieve a document by id", async () => {
    const data = Buffer.from("test-image-data");
    await docStore.store({
      id: "doc-1",
      entityId: "entity-1",
      type: "proof_of_address",
      data,
      mimeType: "image/png",
    });

    const doc = await docStore.getById("doc-1");
    expect(doc).not.toBeNull();
    expect(doc?.entityId).toBe("entity-1");
    expect(doc?.type).toBe("proof_of_address");
    expect(doc?.mimeType).toBe("image/png");
    expect(Buffer.from(doc?.data ?? []).toString()).toBe("test-image-data");
  });

  test("getById returns null for unknown document", async () => {
    const doc = await docStore.getById("nonexistent");
    expect(doc).toBeNull();
  });

  test("getByEntityId returns all documents for an entity", async () => {
    const data = Buffer.from("test");
    await docStore.store({ id: "doc-1", entityId: "e1", type: "proof_of_address", data, mimeType: "image/png" });
    await docStore.store({ id: "doc-2", entityId: "e1", type: "proof_of_address", data, mimeType: "image/jpeg" });
    await docStore.store({ id: "doc-3", entityId: "e2", type: "proof_of_address", data, mimeType: "image/png" });

    const docs = await docStore.getByEntityId("e1");
    expect(docs).toHaveLength(2);
  });

  test("getByEntityId returns empty array for unknown entity", async () => {
    const docs = await docStore.getByEntityId("nonexistent");
    expect(docs).toEqual([]);
  });

  test("application-time upload found when queried by same id used as grantId", async () => {
    // applicationId === grantId in this system — documents stored at apply time
    // are automatically visible when querying by grantId
    const applicationId = "app-123";
    const data = Buffer.from("poa-file");
    await docStore.store({ id: "doc-poa", entityId: applicationId, type: "proof_of_address", data, mimeType: "application/pdf" });

    const docs = await docStore.getByEntityId(applicationId);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.entityId).toBe(applicationId);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun test test/integration/documents.test.ts
```

Expected: FAIL — `Cannot find module '../../src/infrastructure/projections/documents.ts'`

- [ ] **Step 3: Create `src/infrastructure/projections/documents.ts`**

```ts
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";

export type Document = {
  id: string;
  entityId: string;
  type: string;
  data: Buffer;
  mimeType: string;
  uploadedAt: string;
};

type DbRow = {
  id: string;
  entity_id: string;
  type: string;
  data: Buffer;
  mime_type: string;
  uploaded_at: string;
};

export function DocumentStore(
  pool: ReturnType<typeof SQLiteConnectionPool>,
) {
  return {
    async init(): Promise<void> {
      await pool.withConnection(async (conn) => {
        await conn.command(`
          CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            entity_id TEXT NOT NULL,
            type TEXT NOT NULL,
            data BLOB NOT NULL,
            mime_type TEXT NOT NULL,
            uploaded_at TEXT NOT NULL
          )
        `);
      });
    },

    async store(doc: {
      id: string;
      entityId: string;
      type: string;
      data: Buffer;
      mimeType: string;
    }): Promise<void> {
      const now = new Date().toISOString();
      await pool.withConnection(async (conn) => {
        await conn.command(
          `INSERT INTO documents (id, entity_id, type, data, mime_type, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [doc.id, doc.entityId, doc.type, doc.data, doc.mimeType, now],
        );
      });
    },

    async getById(id: string): Promise<Document | null> {
      try {
        return await pool.withConnection(async (conn) => {
          const rows = await conn.query<DbRow>(
            "SELECT * FROM documents WHERE id = ?",
            [id],
          );
          const row = rows[0];
          if (!row) return null;
          return {
            id: row.id,
            entityId: row.entity_id,
            type: row.type,
            data: row.data,
            mimeType: row.mime_type,
            uploadedAt: row.uploaded_at,
          };
        });
      } catch {
        return null;
      }
    },

    async getByEntityId(entityId: string): Promise<Document[]> {
      try {
        return await pool.withConnection(async (conn) => {
          const rows = await conn.query<DbRow>(
            "SELECT * FROM documents WHERE entity_id = ? ORDER BY uploaded_at DESC",
            [entityId],
          );
          return rows.map((row) => ({
            id: row.id,
            entityId: row.entity_id,
            type: row.type,
            data: row.data,
            mimeType: row.mime_type,
            uploadedAt: row.uploaded_at,
          }));
        });
      } catch {
        return [];
      }
    },
  };
}
```

- [ ] **Step 4: Run new test to confirm it passes**

```bash
bun test test/integration/documents.test.ts
```

Expected: All 5 tests PASS

- [ ] **Step 5: Update `src/web/routes/grants.ts` to use DocumentStore**

Replace the import:
```ts
// Before:
import { GrantDocumentStore } from "../../infrastructure/projections/grantDocuments.ts";
// After:
import { DocumentStore } from "../../infrastructure/projections/documents.ts";
```

Replace all usages of `GrantDocumentStore` with `DocumentStore` and `grantId` with `entityId` in that file:
- `docStore.store({ ..., grantId, ... })` → `docStore.store({ ..., entityId: grantId, ... })`
- `docStore.getByGrantId(grantId)` → `docStore.getByEntityId(grantId)`
- The return type: `docs.some((d) => d.type === "proof_of_address")` — no change needed (field `type` is unchanged)

- [ ] **Step 6: Update `src/web/server.ts` to use DocumentStore**

Replace:
```ts
// Before:
import { GrantDocumentStore } from "../infrastructure/projections/grantDocuments.ts";
// ...
const docStore = GrantDocumentStore(pool);
await docStore.init();
```
With:
```ts
// After:
import { DocumentStore } from "../infrastructure/projections/documents.ts";
// ...
const docStore = DocumentStore(pool);
await docStore.init();
```

- [ ] **Step 7: Delete old file**

```bash
rm /home/jon/dev/csf/src/infrastructure/projections/grantDocuments.ts
```

- [ ] **Step 8: Delete old test file**

```bash
rm /home/jon/dev/csf/test/integration/grantDocuments.test.ts
```

- [ ] **Step 9: Run full test suite to confirm no regressions**

```bash
bun test
```

Expected: All previously passing tests still pass. The deleted `grantDocuments.test.ts` is replaced by `documents.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/infrastructure/projections/documents.ts src/web/routes/grants.ts src/web/server.ts test/integration/documents.test.ts
git rm src/infrastructure/projections/grantDocuments.ts test/integration/grantDocuments.test.ts
git commit -m "refactor: rename GrantDocumentStore to DocumentStore with entity_id column"
```

---

## Chunk 2: Application Domain — bankDetails Pass-through

### Task 2: Add `bankDetails` to application types and submit handler

**Files:**
- Modify: `src/domain/application/types.ts`
- Modify: `src/domain/application/submitApplication.ts`

- [ ] **Step 1: Add `bankDetails` to types**

In `src/domain/application/types.ts`, add the optional field to both `SubmitApplication` command data and `ApplicationSubmitted` event data:

```ts
// Add this type alias near the top (after PaymentPreference):
export type BankDetails = {
  sortCode: string;
  accountNumber: string;
  proofOfAddressRef: string;
};
```

In `SubmitApplication` command data, add:
```ts
bankDetails?: BankDetails;
```

In `ApplicationSubmitted` event data, add:
```ts
bankDetails?: BankDetails;
```

- [ ] **Step 2: Update `ApplicationFormData` and thread through in `submitApplication.ts`**

In `src/domain/application/submitApplication.ts`:

Add `bankDetails` to `ApplicationFormData`:
```ts
export type ApplicationFormData = {
  applicationId: string;
  phone: string;
  name: string;
  email?: string;
  paymentPreference: PaymentPreference;
  meetingPlace: string;
  monthCycle: string;
  eligibility: EligibilityResult;
  bankDetails?: { sortCode: string; accountNumber: string; proofOfAddressRef: string };
};
```

Add it to the command construction (inside `submitApplication`):
```ts
const command: SubmitApplication = {
  type: "SubmitApplication",
  data: {
    applicationId: form.applicationId,
    identity: { phone: form.phone, name: form.name, email: form.email },
    paymentPreference: form.paymentPreference,
    meetingDetails: { place: form.meetingPlace },
    monthCycle: form.monthCycle,
    identityResolution,
    eligibility: form.eligibility,
    submittedAt: new Date().toISOString(),
    bankDetails: form.bankDetails,  // add this line
  },
};
```

- [ ] **Step 3: Run tests to confirm no regressions**

```bash
bun test
```

Expected: All tests pass (no logic changes, only type additions).

- [ ] **Step 4: Commit**

```bash
git add src/domain/application/types.ts src/domain/application/submitApplication.ts
git commit -m "feat: add optional bankDetails to application submission types"
```

---

### Task 3: Update applications projection to store bank details

**Files:**
- Modify: `src/infrastructure/projections/applications.ts`

The projection must store `sort_code`, `account_number`, `poa_ref` from `ApplicationSubmitted` when `bankDetails` is present.

- [ ] **Step 1: Write failing integration test**

Add to `test/integration/workflows/applicationFlow.test.ts` (or create `test/integration/applicationProjection.test.ts`):

Actually, add a test in `test/integration/workflows/bankGrantFlow.test.ts` that verifies the columns get populated — but that test needs the full stack. Let's write a more targeted unit test.

Create `test/integration/applicationProjection.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import type { SQLiteConnectionPool, SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { applicationsProjection } from "../../src/infrastructure/projections/applications.ts";

describe("applications projection — bank details", () => {
  let pool: ReturnType<typeof SQLiteConnectionPool>;
  let eventStore: SQLiteEventStore;

  beforeEach(async () => {
    const es = createEventStore(":memory:");
    pool = es.pool;
    eventStore = es.store;
  });

  afterEach(async () => {
    await pool.close();
  });

  test("stores sort_code, account_number, poa_ref when bankDetails present", async () => {
    await eventStore.appendToStream("application-app-1", [
      {
        type: "ApplicationSubmitted",
        data: {
          applicationId: "app-1",
          applicantId: "applicant-1",
          identity: { phone: "07700900001", name: "Alice" },
          paymentPreference: "bank",
          meetingDetails: { place: "Mill Road" },
          monthCycle: "2026-03",
          submittedAt: "2026-03-01T00:00:00Z",
          bankDetails: {
            sortCode: "12-34-56",
            accountNumber: "12345678",
            proofOfAddressRef: "poa-ref-abc",
          },
        },
      },
    ]);

    const rows = await pool.withConnection(async (conn) =>
      conn.query<{ sort_code: string | null; account_number: string | null; poa_ref: string | null }>(
        "SELECT sort_code, account_number, poa_ref FROM applications WHERE id = ?",
        ["app-1"],
      ),
    );
    expect(rows[0]?.sort_code).toBe("12-34-56");
    expect(rows[0]?.account_number).toBe("12345678");
    expect(rows[0]?.poa_ref).toBe("poa-ref-abc");
  });

  test("leaves sort_code, account_number, poa_ref as NULL when bankDetails absent", async () => {
    await eventStore.appendToStream("application-app-2", [
      {
        type: "ApplicationSubmitted",
        data: {
          applicationId: "app-2",
          applicantId: "applicant-2",
          identity: { phone: "07700900002", name: "Bob" },
          paymentPreference: "cash",
          meetingDetails: { place: "Mill Road" },
          monthCycle: "2026-03",
          submittedAt: "2026-03-01T00:00:00Z",
        },
      },
    ]);

    const rows = await pool.withConnection(async (conn) =>
      conn.query<{ sort_code: string | null }>(
        "SELECT sort_code FROM applications WHERE id = ?",
        ["app-2"],
      ),
    );
    expect(rows[0]?.sort_code).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
bun test test/integration/applicationProjection.test.ts
```

Expected: FAIL — columns don't exist yet

- [ ] **Step 3: Update the applications projection**

In `src/infrastructure/projections/applications.ts`:

In the `init` handler, add the three new columns to the `CREATE TABLE` statement:
```sql
sort_code TEXT,
account_number TEXT,
poa_ref TEXT,
```

In the `ApplicationSubmitted` case of the `handle` function, update the INSERT to include the new columns:
```ts
case "ApplicationSubmitted":
  await connection.command(
    `INSERT OR IGNORE INTO applications
       (id, applicant_id, month_cycle, status, payment_preference, name, phone, applied_at, sort_code, account_number, poa_ref)
     VALUES (?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.applicationId,
      data.applicantId,
      data.monthCycle,
      data.paymentPreference,
      data.identity.name,
      data.identity.phone,
      data.submittedAt,
      data.bankDetails?.sortCode ?? null,
      data.bankDetails?.accountNumber ?? null,
      data.bankDetails?.proofOfAddressRef ?? null,
    ],
  );
  break;
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
bun test test/integration/applicationProjection.test.ts
```

Expected: Both tests PASS

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/projections/applications.ts test/integration/applicationProjection.test.ts
git commit -m "feat: store bank details columns in applications projection"
```

---

## Chunk 3: Grant Domain — Fast-Path to `poa_approved`

### Task 4: Add `bankDetails` to `CreateGrant` and update decider

**Files:**
- Modify: `src/domain/grant/types.ts`
- Modify: `src/domain/grant/decider.ts`
- Modify: `test/unit/grantDecider.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the `CreateGrant` describe block in `test/unit/grantDecider.test.ts`:

```ts
test("bank preference with bankDetails → GrantCreated + BankDetailsSubmitted + ProofOfAddressApproved", () => {
  const events = decide(
    {
      type: "CreateGrant",
      data: {
        ...core,
        paymentPreference: "bank",
        createdAt: "2026-03-01T00:00:00Z",
        bankDetails: {
          sortCode: "12-34-56",
          accountNumber: "12345678",
          proofOfAddressRef: "poa-ref-1",
        },
      },
    },
    initialState(),
  );
  expect(events).toHaveLength(3);
  expect(events[0]!.type).toBe("GrantCreated");
  expect(events[1]!.type).toBe("BankDetailsSubmitted");
  expect(events[1]!.data.sortCode).toBe("12-34-56");
  expect(events[1]!.data.proofOfAddressRef).toBe("poa-ref-1");
  expect(events[1]!.data.submittedAt).toBe("2026-03-01T00:00:00Z");
  expect(events[2]!.type).toBe("ProofOfAddressApproved");
  expect(events[2]!.data.verifiedBy).toBe("system");
  expect(events[2]!.data.verifiedAt).toBe("2026-03-01T00:00:00Z");
});

test("bank preference with bankDetails → final evolved state is poa_approved", () => {
  const events = decide(
    {
      type: "CreateGrant",
      data: {
        ...core,
        paymentPreference: "bank",
        createdAt: "2026-03-01T00:00:00Z",
        bankDetails: {
          sortCode: "12-34-56",
          accountNumber: "12345678",
          proofOfAddressRef: "poa-ref-1",
        },
      },
    },
    initialState(),
  );
  // Simulate evolve applying all three events in sequence
  let state = initialState();
  for (const event of events) {
    state = evolve(state, event as Parameters<typeof evolve>[1]);
  }
  expect(state.status).toBe("poa_approved");
});

test("bank preference without bankDetails → only GrantCreated (existing path)", () => {
  const events = decide(
    {
      type: "CreateGrant",
      data: {
        ...core,
        paymentPreference: "bank",
        createdAt: "2026-03-01T00:00:00Z",
      },
    },
    initialState(),
  );
  expect(events).toHaveLength(1);
  expect(events[0]!.type).toBe("GrantCreated");
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
bun test test/unit/grantDecider.test.ts
```

Expected: New tests FAIL — `CreateGrant` doesn't accept `bankDetails` yet

- [ ] **Step 3: Add `bankDetails` to `CreateGrant` in `src/domain/grant/types.ts`**

In the `CreateGrant` command data type, add:
```ts
bankDetails?: {
  sortCode: string;
  accountNumber: string;
  proofOfAddressRef: string;
};
```

- [ ] **Step 4: Update `decideCreate` in `src/domain/grant/decider.ts`**

Replace `decideCreate` with:

```ts
function decideCreate(command: CreateGrant, state: GrantState): GrantEvent[] {
  if (state.status !== "initial") {
    throw new IllegalStateError(
      `Grant already created (status: ${state.status})`,
    );
  }

  const { grantId, createdAt, bankDetails } = command.data;
  const events: GrantEvent[] = [
    { type: "GrantCreated", data: { ...command.data } },
  ];

  if (command.data.paymentPreference === "bank" && bankDetails) {
    events.push({
      type: "BankDetailsSubmitted",
      data: {
        grantId,
        sortCode: bankDetails.sortCode,
        accountNumber: bankDetails.accountNumber,
        proofOfAddressRef: bankDetails.proofOfAddressRef,
        submittedAt: createdAt,
      },
    });
    events.push({
      type: "ProofOfAddressApproved",
      data: {
        grantId,
        verifiedBy: "system",
        verifiedAt: createdAt,
      },
    });
  }

  return events;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bun test test/unit/grantDecider.test.ts
```

Expected: All tests PASS (including the 3 new ones)

- [ ] **Step 6: Run full suite**

```bash
bun test
```

Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/domain/grant/types.ts src/domain/grant/decider.ts test/unit/grantDecider.test.ts
git commit -m "feat: grant decider fast-path to poa_approved when bank details provided at apply time"
```

---

### Task 5: Update grant process manager to pass bank details

**Files:**
- Modify: `src/domain/grant/processManager.ts`
- Modify: `test/integration/helpers/workflowSteps.ts`
- Modify: `test/integration/workflows/bankGrantFlow.test.ts`

- [ ] **Step 1: Write failing integration test**

Add to `test/integration/workflows/bankGrantFlow.test.ts`:

```ts
test("bank grant with details provided at apply time → created directly at poa_approved", async () => {
  const appId = "app-bank-fast-path";

  // Submit application with bank details pre-populated
  await submitAcceptedApplication(env, {
    applicationId: appId,
    phone: "07700900099",
    name: "FastPath",
    paymentPreference: "bank",
    bankDetails: {
      sortCode: "12-34-56",
      accountNumber: "12345678",
      proofOfAddressRef: "poa-ref-fast",
    },
  });

  // Store a fake document so the poa_ref exists (process manager checks for it)
  // The POA ref just needs to be a non-empty string in the DB — no actual file needed here
  await selectWinnerWithBankDetails(env, {
    applicationId: appId,
    phone: "07700900099",
    name: "FastPath",
    paymentPreference: "bank",
    bankDetails: {
      sortCode: "12-34-56",
      accountNumber: "12345678",
      proofOfAddressRef: "poa-ref-fast",
    },
  });

  // Grant should be at poa_approved — no awaiting_bank_details step
  const rows = await queryGrant(env, appId);
  expect(rows[0]!.status).toBe("poa_approved");

  // Payment can be recorded immediately
  await recordPayment(appId, { amount: 40, method: "bank", paidBy: "vol-1" }, env.eventStore);
  const paidRows = await queryGrant(env, appId);
  expect(paidRows[0]!.status).toBe("paid");
});
```

This requires a new `selectWinnerWithBankDetails` helper — add to `workflowSteps.ts`:

```ts
export async function submitAcceptedApplication(
  env: TestEnv,
  opts: {
    applicationId: string;
    phone: string;
    name: string;
    paymentPreference?: "bank" | "cash";
    meetingPlace?: string;
    monthCycle?: string;
    bankDetails?: { sortCode: string; accountNumber: string; proofOfAddressRef: string };
  },
) {
  return submitApplication(
    {
      applicationId: opts.applicationId,
      phone: opts.phone,
      name: opts.name,
      paymentPreference: opts.paymentPreference ?? "bank",
      meetingPlace: opts.meetingPlace ?? "Mill Road",
      monthCycle: opts.monthCycle ?? "2026-03",
      eligibility: { status: "eligible" },
      bankDetails: opts.bankDetails,
    },
    env.eventStore,
    env.applicantRepo,
  );
}
```

(This updates the existing `submitAcceptedApplication` — just add the optional `bankDetails` field.)

For the fast-path test, also add `selectWinnerWithBankDetails` which is identical to `selectWinner` but passes `bankDetails` through to `submitAcceptedApplication`. Actually, update `selectWinner` itself to accept optional `bankDetails`:

```ts
export async function selectWinner(
  env: TestEnv,
  opts: {
    applicationId: string;
    phone: string;
    name: string;
    paymentPreference?: "bank" | "cash";
    monthCycle?: string;
    bankDetails?: { sortCode: string; accountNumber: string; proofOfAddressRef: string };
  },
) {
  // ... (existing body, but pass bankDetails to submitAcceptedApplication)
  await submitAcceptedApplication(env, {
    ...opts,
    paymentPreference,
    monthCycle,
    bankDetails: opts.bankDetails,
  });
  // ... rest unchanged
}
```

- [ ] **Step 2: Run to confirm it fails**

```bash
bun test test/integration/workflows/bankGrantFlow.test.ts
```

Expected: New test FAIL — process manager doesn't pass `bankDetails` to `CreateGrant` yet

- [ ] **Step 3: Update process manager to query and pass bank details**

In `src/domain/grant/processManager.ts`, update the query and command:

```ts
const rows = await pool.withConnection(async (conn) =>
  conn.query<{
    payment_preference: string;
    sort_code: string | null;
    account_number: string | null;
    poa_ref: string | null;
  }>(
    "SELECT payment_preference, sort_code, account_number, poa_ref FROM applications WHERE id = ?",
    [applicationId],
  ),
);

if (!rows[0]) {
  throw new Error(`Application ${applicationId} not found in projection`);
}
const pref = rows[0].payment_preference;
if (pref !== "bank" && pref !== "cash") {
  throw new Error(`Invalid payment_preference: ${pref}`);
}
const paymentPreference = pref;

const { sort_code, account_number, poa_ref } = rows[0];
const bankDetails =
  sort_code && account_number && poa_ref
    ? { sortCode: sort_code, accountNumber: account_number, proofOfAddressRef: poa_ref }
    : undefined;

const streamId = `grant-${applicationId}`;
try {
  await handle(eventStore, streamId, (state) =>
    decide(
      {
        type: "CreateGrant",
        data: {
          grantId: applicationId,
          applicationId,
          applicantId,
          monthCycle,
          rank,
          paymentPreference,
          createdAt: selectedAt,
          bankDetails,
        },
      },
      state,
    ),
  );
} catch (e) {
  if (!(e instanceof IllegalStateError)) throw e;
}
```

- [ ] **Step 4: Run tests**

```bash
bun test test/integration/workflows/bankGrantFlow.test.ts
```

Expected: All tests PASS including new fast-path test

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/domain/grant/processManager.ts test/integration/helpers/workflowSteps.ts test/integration/workflows/bankGrantFlow.test.ts
git commit -m "feat: grant process manager passes bank details from application to CreateGrant"
```

---

## Chunk 4: Apply Form, Route, and Server Wiring

### Task 6: Add POA upload field to apply form

**Files:**
- Modify: `src/web/pages/apply.ts`
- Modify: `test/unit/applyPage.test.ts`

- [ ] **Step 1: Check existing apply page test**

Read `test/unit/applyPage.test.ts` to understand what's already tested.

- [ ] **Step 2: Write failing test**

Add to `test/unit/applyPage.test.ts`:

```ts
test("bank fields include POA file input", () => {
  const html = applyPage();
  expect(html).toContain('name="poa"');
  expect(html).toContain('type="file"');
  expect(html).toContain('accept="image/*,.pdf"');
});

test("apply form uses multipart/form-data encoding", () => {
  const html = applyPage();
  expect(html).toContain('enctype="multipart/form-data"');
});

test("POA field has encouraging helper text", () => {
  const html = applyPage();
  expect(html).toContain("speed up");
});
```

- [ ] **Step 3: Run to confirm tests fail**

```bash
bun test test/unit/applyPage.test.ts
```

Expected: New tests FAIL

- [ ] **Step 4: Update `src/web/pages/apply.ts`**

1. Add `enctype="multipart/form-data"` to the `<form>` tag:
```html
<form action="/apply" method="POST" enctype="multipart/form-data" class="space-y-4">
```

2. Inside `#bankFields`, after the account number field, add:
```html
<div>
  <label for="poa" class="block text-sm font-body text-bark mb-1">Proof of Address</label>
  <p class="text-xs text-bark-muted mb-1">Optional — uploading now will speed up your payment.</p>
  <input type="file" id="poa" name="poa" accept="image/*,.pdf" class="input text-sm" />
</div>
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
bun test test/unit/applyPage.test.ts
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/web/pages/apply.ts test/unit/applyPage.test.ts
git commit -m "feat: add optional POA file upload to apply form bank fields"
```

---

### Task 7: Update apply route to handle POA upload and pass bank details

**Files:**
- Modify: `src/web/routes/apply.ts`
- Modify: `test/integration/applyRoutes.test.ts`

The route needs `DocumentStore` injected and must handle the POA file when present.

- [ ] **Step 1: Write failing tests**

Add to `test/integration/applyRoutes.test.ts`:

Update `beforeEach` and `routes` declaration to inject `DocumentStore` (see Step 3 for the new signature — write the test first, expecting the new constructor):

```ts
import { DocumentStore } from "../../src/infrastructure/projections/documents.ts";

// In beforeEach:
beforeEach(async () => {
  env = await createTestEnv();
  const docStore = DocumentStore(env.pool);
  await docStore.init();
  routes = createApplyRoutes(
    env.eventStore,
    env.pool,
    env.applicantRepo,
    hmacKey,
    docStore,
  );
});
```

Add this test:

```ts
test("bank payment with POA file stores document and passes ref to event", async () => {
  // Open window
  await env.eventStore.appendToStream("lottery-2026-03", [
    {
      type: "ApplicationWindowOpened",
      data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
    },
  ]);

  const altchaToken = await generateAltchaToken();
  const poaContent = Buffer.from("fake-pdf-content");
  const poaFile = new File([poaContent], "poa.pdf", { type: "application/pdf" });

  const formData = new FormData();
  formData.set("name", "Alice");
  formData.set("phone", "07700900001");
  formData.set("meetingPlace", "Mill Road");
  formData.set("paymentPreference", "bank");
  formData.set("sortCode", "12-34-56");
  formData.set("accountNumber", "12345678");
  formData.set("poa", poaFile);
  formData.set("altcha", altchaToken);

  const req = new Request("http://localhost/apply", {
    method: "POST",
    body: formData,
  });

  const res = await routes.handleSubmit(req);
  expect(res.status).toBe(302);

  // Verify document was stored
  const { events } = await env.eventStore.readStream(
    "application-" + res.headers.get("location")?.match(/ref=([^&]+)/)?.[1],
  );
  // We can't easily read the ref from the redirect without parsing it,
  // so just verify the response redirected successfully
  expect(res.headers.get("location")).toContain("/apply/result");
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
bun test test/integration/applyRoutes.test.ts
```

Expected: FAIL — `createApplyRoutes` doesn't accept 5th arg yet

- [ ] **Step 3: Update `src/web/routes/apply.ts`**

Add `DocumentStore` import and update `createApplyRoutes`:

```ts
import type { DocumentStore } from "../../infrastructure/projections/documents.ts";
```

Update the function signature:
```ts
export function createApplyRoutes(
  eventStore: SQLiteEventStore,
  pool: ReturnType<typeof SQLiteConnectionPool>,
  applicantRepo: ApplicantRepository,
  hmacKey: string,
  docStore: ReturnType<typeof DocumentStore>,
) {
```

In `handleSubmit`, after the bank payment validation block (sort code + account number checks), add POA handling:

```ts
// After existing bank field validation:
let proofOfAddressRef = "";
if (paymentPref === "bank") {
  const poaFile = formData.get("poa");
  if (poaFile instanceof File && poaFile.size > 0) {
    const docId = crypto.randomUUID();
    const buffer = Buffer.from(await poaFile.arrayBuffer());
    await docStore.store({
      id: docId,
      entityId: applicationId,
      type: "proof_of_address",
      data: buffer,
      mimeType: poaFile.type || "application/octet-stream",
    });
    proofOfAddressRef = docId;
  }
}
```

Pass `bankDetails` to `submitApplication`:

```ts
const bankDetails =
  paymentPreference === "bank" && sortCode && accountNumber && proofOfAddressRef
    ? { sortCode, accountNumber, proofOfAddressRef }
    : undefined;

const { events } = await submitApplication(
  {
    applicationId,
    phone,
    name,
    email,
    paymentPreference,
    meetingPlace,
    monthCycle,
    eligibility,
    bankDetails,
  },
  eventStore,
  applicantRepo,
);
```

Note: `applicationId` must be declared before the POA block. Move `const applicationId = crypto.randomUUID();` to before the POA handling section.

- [ ] **Step 4: Run tests**

```bash
bun test test/integration/applyRoutes.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/web/routes/apply.ts test/integration/applyRoutes.test.ts
git commit -m "feat: apply route accepts POA file upload and passes bank details to application"
```

---

### Task 8: Wire DocumentStore into apply routes in server

**Files:**
- Modify: `src/web/server.ts`

- [ ] **Step 1: Update server to pass `docStore` to `createApplyRoutes`**

In `src/web/server.ts`, find the `createApplyRoutes` call and add `docStore`:

```ts
const applyRoutes = createApplyRoutes(
  eventStore,
  pool,
  applicantRepo,
  hmacKey,
  docStore,
);
```

The `docStore` is already created earlier in the server setup (from Task 1). No new code needed — just add `docStore` as the 5th argument.

- [ ] **Step 2: Run full test suite**

```bash
bun test
```

Expected: All tests pass

- [ ] **Step 3: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/web/server.ts
git commit -m "feat: wire DocumentStore into apply routes"
```

---

## Final Verification

- [ ] **Run full test suite one last time**

```bash
bun test
```

Expected: All tests pass

- [ ] **Manual smoke test** (optional)

```bash
bun run src/web/index.ts
```

Navigate to `http://localhost:3000/apply`, select "Bank transfer", verify:
- POA file input appears with helper text "uploading now will speed up your payment"
- Sort code, account number, and POA file can be submitted
- Submission redirects to result page

- [ ] **Lint and format**

```bash
bunx biome check --write
```

- [ ] **Final commit if any formatting changes**

```bash
git add -A
git commit -m "style: biome formatting"
```
