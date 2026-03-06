# Grants Table Design

## Problem

The `applications_this_month` projection is a narrow read model that only tracks whether an application was accepted in a given month cycle. It can't answer questions like "what's this recipient's grant history?" or "which grants need payment?" — and it has no link to the `recipients` table.

We need a first-class `grants` table that:
1. Replaces the eligibility projection (serves the same cooldown/duplicate checks)
2. Gives volunteers operational visibility into grant lifecycle (application → acceptance/rejection → payment)
3. Links grants to recipients

## Grant Lifecycle

```
applied → accepted → paid
       ↘ rejected
         accepted → payment_failed
```

**Statuses:** `applied | accepted | rejected | paid | payment_failed`

## Schema

### `grants` table

```sql
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,                -- = application_id
  recipient_id TEXT NOT NULL,         -- FK to recipients
  application_id TEXT NOT NULL,
  month_cycle TEXT NOT NULL,          -- e.g. "2026-03"
  status TEXT NOT NULL,               -- applied | accepted | rejected | paid | payment_failed
  volunteer_id TEXT,                  -- FK to volunteers (assigned later via UI)
  reject_reason TEXT,                 -- cooldown | duplicate
  payment_fail_reason TEXT,
  applied_at TEXT NOT NULL,
  accepted_at TEXT,
  rejected_at TEXT,
  paid_at TEXT,
  UNIQUE(recipient_id, month_cycle)
)
```

### `volunteers` table

```sql
CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

## Domain Events

### Existing events (handled by grants projection)

- `ApplicationSubmitted` → INSERT grant with status `applied`
- `ApplicationAccepted` → UPDATE to `accepted`
- `ApplicationRejected` → UPDATE to `rejected`, set `reject_reason`

### New events

- `GrantVolunteerAssigned` — `{ grantId, recipientId, volunteerId, assignedAt }`
- `GrantPaid` — `{ grantId, recipientId, monthCycle, paidAt }`
- `GrantPaymentFailed` — `{ grantId, recipientId, monthCycle, reason, failedAt }`

## Eligibility Query

Replaces the current `applications_this_month` lookup:

```sql
SELECT month_cycle FROM grants
WHERE recipient_id = ?
  AND status NOT IN ('rejected', 'payment_failed')
  AND month_cycle >= ?
ORDER BY month_cycle DESC
LIMIT 1
```

Cooldown is month-based (3 cycle lookback), no timestamp math needed.

## Architecture

### New files

- `src/domain/volunteer/types.ts` — `Volunteer` type
- `src/domain/volunteer/repository.ts` — `VolunteerRepository` interface (CRUD)
- `src/infrastructure/volunteer/sqliteVolunteerRepository.ts` — SQLite implementation
- `src/domain/grant/types.ts` — new grant events (`GrantVolunteerAssigned`, `GrantPaid`, `GrantPaymentFailed`)
- `src/infrastructure/projections/grants.ts` — new projection replacing `eligibility.ts`

### Modified files

- `src/infrastructure/eventStore.ts` — swap `eligibilityProjection` for `grantsProjection`
- `src/domain/application/types.ts` — `ApplicationEvent` union unchanged; new grant events are separate

### Deleted files

- `src/infrastructure/projections/eligibility.ts` — replaced by `grants.ts`

### What stays the same

- Decider (`decide`, `evolve`) — unchanged
- `submitApplication()` — unchanged (still receives pre-computed `EligibilityResult`)
- `EligibilityResult` type — unchanged
- Identity resolution — unchanged
- Recipient repository — unchanged

## Volunteer Assignment

Volunteer assignment to grants will be handled via a future UI task. The `volunteer_id` column is nullable and the `GrantVolunteerAssigned` event exists but no command/handler will be built in this iteration.

## VolunteerRepository

Same shape as `RecipientRepository` — full CRUD with SQLite implementation.
