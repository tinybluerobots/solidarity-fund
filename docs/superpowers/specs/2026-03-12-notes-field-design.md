# Notes Field for Applicants and Grants

**Date:** 2026-03-12
**Status:** Approved

## Overview

Add a freeform `notes` text field to both applicants and grants. Notes are informal staff scratch space — no audit trail, no business logic, no domain events.

## Data Layer

### Schema

Add `notes TEXT` (nullable) to both `applicants` and `grants` SQLite tables.

**Migration strategy:**

- **Applicants**: run `ALTER TABLE applicants ADD COLUMN notes TEXT` in `SQLiteApplicantRepository`'s async init block, immediately after the existing `CREATE TABLE IF NOT EXISTS`. Catch and suppress the error if the column already exists (error message contains `"duplicate column"`). SQLite does not support `ADD COLUMN IF NOT EXISTS`.

- **Grants**: `SQLiteGrantRepository` has no init block — the grants table is created by the projection. Run `ALTER TABLE grants ADD COLUMN notes TEXT` (same error-suppression pattern) in `grantProjection`'s `init` function in `src/infrastructure/projections/grant.ts`, after the existing `CREATE TABLE IF NOT EXISTS`.

### Types

- `Applicant` (domain type, `src/domain/applicant/types.ts`): add `notes?: string`
- `GrantRow` (type in `src/domain/grant/repository.ts`): add `notes: string | null`

### Repository Mapping

- In `sqliteApplicantRepository.ts`: add `notes: string | null` to `ApplicantRow`, map it in `rowToApplicant` as `notes: row.notes ?? undefined`
- In `sqliteGrantRepository.ts`: add `notes: string | null` to `DbRow`, map it in `rowToGrant` as `notes: row.notes`

### Repository Methods

Add `updateNotes(id: string, notes: string): Promise<void>` to:
- `ApplicantRepository` interface + `SQLiteApplicantRepository` implementation
- `GrantRepository` interface + `SQLiteGrantRepository` implementation

Both implementations execute a direct `UPDATE ... SET notes = ? WHERE id = ?`. No event store involvement.

## Routes

| Method | Path | Handler |
|--------|------|---------|
| POST | `/applicants/:id/notes` | Reads `notes` signal from request body via `ServerSentEventGenerator.readSignals`, calls `applicantRepo.updateNotes`, returns `sseResponse()` with no actions |
| POST | `/grants/:id/notes` | Same, calls `grantRepo.updateNotes`, returns `sseResponse()` with no actions |

The silent `sseResponse()` (no actions) is intentional — the textarea already holds the correct value client-side; no patch is needed.

**Route registration**: both routes are registered in `server.ts`'s `fetch` fallback alongside existing dynamic `:id` routes (using regex path matching, consistent with the existing pattern for routes like `/applicants/:id` and `/grants/:id/...`).

## UI

### Applicant Panel

A `<textarea>` added to the Details tab below the email field, wrapped in its own `data-signals` block:

```html
<div data-signals="{notes: '<escaped-current-value>'}">
  <label class="label">Notes</label>
  <textarea class="input" data-bind-notes
    data-on-blur="@post('/applicants/${id}/notes')"></textarea>
</div>
```

Datastar merges signal scopes, so nesting a `data-signals` block inside the existing `{name, phone, email}` scope is safe and intentional — the `notes` signal stays isolated.

Use the existing `escapeSignalValue` function from `applicantPanel.ts` to escape the notes value.

### Grant Panel

A notes section appended at the bottom of `grantPanel`, rendered for all grant statuses (after the status-specific `actions` block):

```html
<div class="mt-4" data-signals="{grantnotes: '<escaped-current-value>'}">
  <label class="label">Notes</label>
  <textarea class="input" data-bind-grantnotes
    data-on-blur="@post('/grants/${id}/notes')"></textarea>
</div>
```

Use a distinct signal name (`grantnotes`) to avoid any collision with signals used in the existing action forms.

Add an `escapeSignalValue` helper to `grantPanel.ts` (same implementation as in `applicantPanel.ts`).

## What Is Not Included

- Notes history / audit trail (informal scratch space only)
- Per-note authorship
- Notes on other entities (applications, volunteers)
- Character limits
