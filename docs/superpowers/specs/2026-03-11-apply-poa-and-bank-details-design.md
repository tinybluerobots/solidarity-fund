# Apply Form: Bank Details + POA at Application Time

Date: 2026-03-11

## Summary

Two related changes:

1. Bank-payment applicants can upload Proof of Address (POA) and provide bank details (sort code, account number) on the apply form, at the same time they apply.
2. When a grant is created for a bank-payment application, if all bank details are present (sort code, account number, POA), the grant skips directly to `poa_approved` (ready for payment). If any are missing, it falls back to `awaiting_bank_details` (existing behaviour — volunteer completes the details later).

## Document Store Rename

`GrantDocumentStore` / `grant_documents` → `DocumentStore` / `documents`.

The store is now shared between application-time and grant-time uploads, so the grant-specific name no longer fits. The `type` column already distinguishes document kinds (`proof_of_address`, etc.).

The `grant_id` column is renamed to `entity_id` to reflect the shared purpose — it holds either an `applicationId` or a `grantId` depending on upload context.

## Key Architectural Note

`grantId === applicationId` in this system. Documents stored at apply time with `applicationId` as the `entity_id` are automatically found when the grant panel queries by `grantId`. No re-association step is needed.

## Fast-Path Condition

All three of the following must be present for a grant to skip to `poa_approved`:
- sort code
- account number
- proof of address file (non-empty)

If any are missing, the grant is created in `awaiting_bank_details` as before. There is no error for a partial submission — the applicant simply falls into the normal volunteer-assisted flow.

## Changes

### 1. Apply form (`src/web/pages/apply.ts`)

- Add `enctype="multipart/form-data"` to the `<form>`.
- Add a `<input type="file" name="poa" accept="image/*,.pdf">` inside `#bankFields`. The field is **not required** — it is presented as optional but with helper text encouraging the applicant to upload it now (e.g. "Uploading now will speed up your payment"). `toggleBank()` does not mark it required.
- The `bankName` field is left as-is — it is not stored and unrelated to this feature.

### 2. Apply route (`src/web/routes/apply.ts`)

- Accept `DocumentStore` (renamed) as a constructor dependency.
- On bank payment submission:
  - Generate a UUID for the document (`docId = crypto.randomUUID()`).
  - Read the POA file from form data; if non-empty, store via `DocumentStore.store({ id: docId, entityId: applicationId, type: "proof_of_address", data, mimeType })`.
  - Set `proofOfAddressRef = docId` if stored, otherwise `""`.
- Add optional `bankDetails` to the `ApplicationFormData` passed to `submitApplication`:
  ```ts
  bankDetails: paymentPref === "bank" && sortCode && accountNumber && proofOfAddressRef
    ? { sortCode, accountNumber, proofOfAddressRef }
    : undefined
  ```
- Server-side MIME validation of the uploaded file is out of scope for this change.

### 3. Application domain types (`src/domain/application/types.ts`)

Add optional `bankDetails` to both the command and event:

```ts
bankDetails?: { sortCode: string; accountNumber: string; proofOfAddressRef: string }
```

Added to:
- `SubmitApplication` command data
- `ApplicationSubmitted` event data

### 4. Submit application handler (`src/domain/application/submitApplication.ts`)

- Add optional `bankDetails` to `ApplicationFormData`.
- Thread it through into the `SubmitApplication` command data and thereby into the `ApplicationSubmitted` event (no logic change — pass-through only).

### 5. Applications projection (`src/infrastructure/projections/applications.ts`)

- Add columns `sort_code TEXT`, `account_number TEXT`, `poa_ref TEXT` to the `applications` table.
- Populate from `ApplicationSubmitted.data.bankDetails` when present (leave NULL otherwise).

### 6. Grant types (`src/domain/grant/types.ts`)

Add optional `bankDetails?: { sortCode: string; accountNumber: string; proofOfAddressRef: string }` to the `CreateGrant` command data.

### 7. Grant decider (`src/domain/grant/decider.ts`)

In `decideCreate`, if `command.data.bankDetails` is present, emit three events directly (not via `decideSubmitBankDetails` — bypassing its state guard, which is safe because the events are emitted in a single atomic batch and `evolve` applies them in sequence):

```
GrantCreated          → evolve → awaiting_bank_details
BankDetailsSubmitted  → evolve → bank_details_submitted
ProofOfAddressApproved → evolve → poa_approved
```

The events are constructed as follows from `command.data`:

- `BankDetailsSubmitted`: `{ grantId, sortCode: bankDetails.sortCode, accountNumber: bankDetails.accountNumber, proofOfAddressRef: bankDetails.proofOfAddressRef, submittedAt: createdAt }`
- `ProofOfAddressApproved`: `{ grantId, verifiedBy: "system", verifiedAt: createdAt }`

If `bankDetails` is absent, emit only `GrantCreated` (existing behaviour → `awaiting_bank_details`).

### 8. Grant process manager (`src/domain/grant/processManager.ts`)

- Extend the projection query to also fetch `sort_code`, `account_number`, `poa_ref` from the `applications` table.
- Set `bankDetails` on `CreateGrant` only if all three values are non-empty strings (truthy check suffices — NULLs from SQLite come through as `null` or `undefined` and are falsy). If any are missing or empty, omit `bankDetails`.

### 9. DocumentStore (`src/infrastructure/projections/grantDocuments.ts`)

- Rename file to `src/infrastructure/projections/documents.ts`.
- Rename exported function `GrantDocumentStore` → `DocumentStore`.
- Rename exported type `GrantDocument` → `Document`, with field `grantId` → `entityId`.
- Rename table `grant_documents` → `documents` and column `grant_id` → `entity_id` in the schema and all queries.
- Update method signatures:
  - `store({ id, grantId, ... })` → `store({ id, entityId, ... })`
  - `getByGrantId(grantId)` → `getByEntityId(entityId)`
  - `getById(id)` return type: `grantId` field → `entityId`
- No data migration needed (development environment only).
- Update all call sites: `src/web/routes/grants.ts`, `src/web/server.ts`.

### 10. Server (`src/web/server.ts`)

- Pass `DocumentStore` into `createApplyRoutes`.

## Grant Panel (no change)

The `bankDetailsForm` in the grant panel retains the POA file input. It is only shown when the grant is in `awaiting_bank_details`, meaning the applicant did not supply complete details at apply time. The volunteer completes them then.

## State Machine (bank payment)

```
Apply (all details)  →  GrantCreated + BankDetailsSubmitted + ProofOfAddressApproved  →  poa_approved  →  record payment
Apply (incomplete)   →  GrantCreated                                                   →  awaiting_bank_details  →  (existing flow)
```

## Testing

- Unit test `decideCreate` with `bankDetails` present: assert three events emitted and final evolved state is `poa_approved`.
- Unit test `decideCreate` without `bankDetails`: assert one event emitted, state is `awaiting_bank_details`.
- Unit test applications projection: verify `sort_code`, `account_number`, `poa_ref` populated correctly.
- Integration test apply route: multipart POST with POA file stores document with correct `entityId` and passes ref through to the event.
- Existing grant flow tests must continue to pass (no regression on `awaiting_bank_details` path).
