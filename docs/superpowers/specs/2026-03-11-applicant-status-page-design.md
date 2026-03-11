# Applicant Self-Service Status Page — Design Spec

**Date:** 2026-03-11
**Status:** Approved

---

## Overview

A public, read-only page where applicants can look up the status of their grant application using the reference number shown on the `/apply/result` page. No authentication required.

---

## Access & Route

- **URL:** `GET /status`
- **Lookup:** `GET /status?ref=<applicationId>`
- The reference number is the `applicationId` UUID already displayed on the apply result page after submission.
- No applicant accounts or sessions needed.

---

## Lookup Form

Shown when `/status` is loaded without a `ref` param, or when a lookup fails.

| Element | Content |
|---|---|
| Field label | "Your reference number" |
| Input placeholder | e.g. `a1b2c3d4-…` |
| Submit button | "Check status" |
| Validation — empty | "Please enter your reference number" |
| Validation — malformed (not a UUID) | "We couldn't find an application with that reference number. Please check and try again." |
| Validation — not found | "We couldn't find an application with that reference number. Please check and try again." |

The form submits as `GET /status?ref=<value>`. No CAPTCHA required (reference numbers are hard to enumerate). Validate that `ref` is a valid UUID format before querying the projection; if not, skip the query and show the not-found message.

---

## UI: Progress Timeline

Vertical stepper with colour-coded steps.

**Step colours:**
- Green ✓ — completed
- Amber ⋯ — current / pending
- Purple ⋯ — waiting on volunteer (identity review)
- Red ✗ — terminal failure or ineligibility
- Grey ○ — future step (not yet reached)

---

## Timeline State Mapping

### Pre-lottery

| `ApplicationState.status` | Steps shown |
|---|---|
| `submitted` / `accepted` | Applied ✓ → Lottery draw ⋯ (amber, "You're in the pool") → Grant outcome ○ |
| `flagged` | Applied ✓ → Identity check ⋯ (purple, "A volunteer is reviewing your details") → Lottery draw ○ → Grant outcome ○ |
| `confirmed` | Applied ✓ → Identity check ✓ → Lottery draw ⋯ (amber, "You're in the pool") → Grant outcome ○ |
| `rejected` | Applied ✓ → Not eligible ✗ + reason message (see below) |

**Rejection reason messages** (from `ApplicationState.reason`):

| `reason` value | Message shown |
|---|---|
| `window_closed` | "Applications are currently closed" |
| `cooldown` | "You've received a grant recently and are not yet eligible to apply again" |
| `duplicate` | "An application has already been submitted for this contact" |
| `identity_mismatch` | "Your application was not accepted" |
| anything else | "Your application was not accepted" |

### Post-lottery

| `ApplicationState.status` | Steps shown |
|---|---|
| `not_selected` | Applied ✓ → Lottery draw ✓ → Not selected ✗ + "You can apply again next month" |

No specific next-lottery date is shown — the system does not store a scheduled draw date.

### Grant states (`ApplicationState.status === "selected"`)

Fetch `GrantState` by `applicationId`. `volunteerId` is `string | undefined`; treat `undefined` as not yet assigned.

For `status === "paid"`, use `state.method: "bank" | "cash"` to choose the timeline variant — `method` only exists on the `paid` variant of `GrantState`. `awaiting_reimbursement` and `reimbursed` only occur for cash grants (bank grants go straight to `paid`), so always use the cash timeline for those statuses without checking a `method` field.

| `GrantState.status` | `volunteerId` | Steps shown |
|---|---|---|
| `initial` | — | Treat as `awaiting_bank_details` with `volunteerId: undefined` (grant record exists but not yet initialised) |
| `awaiting_bank_details` | undefined | Applied ✓ → Selected 🎉 ✓ → Volunteer being assigned ⋯ → Payment ○ |
| `awaiting_bank_details` | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Payment details needed ⋯ → Paid ○ |
| `bank_details_submitted` | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Proof of address being reviewed ⋯ → Paid ○ |
| `poa_approved` | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Proof of address approved ✓ → Payment being processed ⋯ → Paid ○ |
| `offered_cash_alternative` | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Cash alternative arranged ⋯ → Paid ○ |
| `awaiting_cash_handover` | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Cash handover pending ⋯ → Paid ○ |
| `paid` (`method: "bank"`) | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Payment processed ✓ → Payment received ✓ |
| `paid` (`method: "cash"`) | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Cash handover complete ✓ → Payment received ✓ |
| `awaiting_reimbursement` | set | Applied ✓ → Selected 🎉 ✓ → Volunteer assigned ✓ → Cash handover complete ✓ → Payment received ✓ (cash only — no method field; always use cash timeline) |
| `reimbursed` | set | Same as `awaiting_reimbursement` — payment complete from applicant's perspective |
| `released` | set | Applied ✓ → Selected ✓ → Volunteer assigned ✓ → Slot released ✗ + "Your grant slot was released. You can apply again next month." |
| `released` | undefined | Applied ✓ → Selected ✓ → Slot released ✗ + "Your grant slot was released. You can apply again next month." (omit volunteer step) |

**Note on POA rejection loop:** After `ProofOfAddressRejected`, the grant returns to `awaiting_bank_details` (with `poaAttempts` incremented). The applicant sees "Payment details needed ⋯" again via the `awaiting_bank_details + volunteerId set` row. No special case needed. The timeline step count does not change — both `awaiting_bank_details` and `bank_details_submitted` show 5 steps (Applied, Selected, Volunteer assigned, [POA step], Paid); only step 4's label and colour change.

**Note on `ApplicationState.reason`:** The `rejected` variant stores `reason: string`, but in practice the value is always one of `"cooldown" | "duplicate" | "identity_mismatch" | "window_closed"` (constrained by the `ApplicationRejected` event). The fallback row in the rejection table handles any unexpected value.

**Note on cash decline:** `CashAlternativeDeclined` transitions the grant to `released`. The `released` row above covers this.

### Error / not found

| Condition | Behaviour |
|---|---|
| `ref` param absent | Show lookup form only |
| `ref` not found in applications projection | Show lookup form with "not found" error message |
| `ApplicationState.status === "initial"` | Treat as not found — show lookup form with error message |
| `ref` found but grant not yet created (selected, no grant record) | Treat as `awaiting_bank_details` with `volunteerId: undefined` |

---

## Data Flow

1. Parse `ref` query param from URL.
2. Look up `ref` as `applicationId` in the **applications projection** (keyed by `applicationId`) → `ApplicationState | null`. Null or `status === "initial"` → show not-found error.
3. If `ApplicationState.status === "selected"`, fetch grant from the **grants projection** by `applicationId` → `GrantState | null`.
   - Null or `status === "initial"` → treat as `awaiting_bank_details` with `volunteerId: undefined`.
   - If the projection lookup throws unexpectedly → treat as not found (show lookup form with error).
3a. If the applications projection lookup throws unexpectedly → treat as not found (show lookup form with error).
4. `volunteerId` is typed `?: string` on all `GrantCore`-based states but is set by domain invariant for: `awaiting_bank_details` (when assigned), `bank_details_submitted`, `poa_approved`, `offered_cash_alternative`, `awaiting_cash_handover`, `awaiting_reimbursement`, `reimbursed`, `released`. Use a non-null assertion or runtime check where needed. The spec table column "set" indicates this invariant.
5. Map state(s) → timeline steps → render HTML.

No new projections required.

---

## Volunteer Link from Applications List

Add a "View status page" link (or icon) next to each application row in the volunteer applications list (`/applications`). The link opens `/status?ref=<applicationId>` — allowing volunteers to quickly preview what the applicant sees. The link may open in a new tab. No changes to route logic needed; just the HTML template.

---

## Files

| File | Action |
|---|---|
| `src/web/pages/status.ts` | New — HTML renderer: lookup form + timeline function |
| `src/web/routes/status.ts` | New — route handler: reads projections, maps to timeline, renders |
| `src/web/server.ts` | Modify — register `GET /status` route |
| `src/web/pages/applications.ts` | Modify — add "View status page" link per application row |

---

## Styling

Matches existing public pages (`/apply`): dark background, Tailwind CSS, no volunteer-side chrome.

---

## Out of Scope

- Applicant notifications (email/SMS)
- Volunteer name disclosure to applicant
- Any writable actions from this page
- History of past applications (only current `ref` is shown)
