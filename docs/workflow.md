# Grant Lottery System

**Proposal for volunteer approval — March 2026**

## Summary

We're moving from manually awarding £40 grants to a **lottery-based system**: anyone applies during a limited window, winners are randomly drawn at month end, limited by available funds.

---

## Full Workflow

```mermaid
flowchart TD
    %% APPLICATION PHASE
    subgraph "📥 APPLICATION PHASE · volunteer opens/closes the window"
        SMS([📱 Person texts or<br/>emails to apply]) --> LINK[Auto-reply with<br/>unique form link]
        WEB([🌐 Person visits<br/>website form]) --> FORM
        LINK --> FORM["Complete Online Form<br/>(name, phone number (required),<br/>email (optional),<br/>meeting place or address,<br/>payment preference: bank or cash;<br/>if bank: optionally upload POA +<br/>sort code + account no. now<br/>to speed up payment later)"]

        FORM --> WINDOW{Window<br/>open?}
        WINDOW -->|No| REJ_CLOSED[❌ Rejected<br/>Window closed — notify]
        WINDOW -->|Yes| ID{"Identity<br/>Resolution"}

        ID -->|Phone + name match| EXISTING[Link to existing<br/>applicant profile]
        ID -->|Known phone,<br/>different name| FLAG["📧 Auto-notify:<br/>'A volunteer will<br/>contact you shortly'"]
        ID -->|No match| NEW[Create new<br/>applicant profile]

        EXISTING --> ELIG
        NEW --> ELIG

        FLAG --> REVIEW{Volunteer<br/>reviews}
        REVIEW -->|Confirms identity| ELIG
        REVIEW -->|Rejects| REJ_ID[❌ Rejected<br/>Identity mismatch — notify]

        ELIG{Eligibility<br/>Check}
        ELIG -->|Last grant < 3 months| REJ_COOL[❌ Rejected<br/>Too soon — notify]
        ELIG -->|Already applied<br/>this month| REJ_DUP[❌ Rejected<br/>Duplicate — notify]
        ELIG -->|✅ Eligible| POOL[✅ Added to<br/>Lottery Pool]
    end

    %% LOTTERY PHASE
    subgraph "🎲 LOTTERY PHASE · Volunteer-driven lifecycle"
        POOL --> OPEN([Volunteer opens<br/>application window])
        OPEN --> ACCEPT["Applications<br/>accepted"]
        ACCEPT --> CLOSE([Volunteer closes<br/>application window])
        CLOSE --> BALANCE["Volunteer enters<br/>balance, reserve & grant amount"]
        BALANCE --> CALC["Calculate slots:<br/>floor((balance − reserve) ÷ £40)"]
        CALC --> DRAW[🎲 Draw lottery<br/>with auditable RNG seed]

        DRAW --> FANOUT["Process manager fans out<br/>SelectApplication / RejectFromLottery"]
        FANOUT --> WINNERS[🏆 Selected winners<br/>in ranked order]
        FANOUT --> LOSERS[Not selected]

        WINNERS --> ASSIGN["Volunteer assigned<br/>to grant"]
        ASSIGN --> WIN_NOTIFY[📧 Notify winners<br/>via email/SMS]
        LOSERS --> LOSE_NOTIFY[📧 Notify non-winners<br/>via email/SMS]
    end

    %% PAYMENT PHASE
    subgraph "💳 PAYMENT PHASE"
        WIN_NOTIFY -->|Chose bank transfer| VERIFY{Volunteer<br/>verifies POA}
        WIN_NOTIFY -->|Chose cash| CASH_MEET["Volunteer contacts<br/>applicant to arrange<br/>cash handover"]

        VERIFY -->|✅ Approved| CLEARED[Due diligence<br/>passed]
        VERIFY -->|❌ Rejected| RETRY{Attempts<br/>< 3?}
        RETRY -->|Yes| EDIT["Volunteer contacts applicant,<br/>edits bank details if needed,<br/>re-reviews POA"]
        EDIT --> VERIFY
        RETRY -->|No| OFFER_CASH{"Offer cash<br/>instead?"}
        OFFER_CASH -->|Accepts| CASH_MEET
        OFFER_CASH -->|Declines| RELEASE[Slot released<br/>to waitlist]

        CASH_MEET --> CASH_DONE([Cash handed<br/>over in person])
        CASH_DONE --> CASH_PAID["✅ GrantPaid (cash)<br/>awaiting_reimbursement"]
        CASH_PAID --> REIMBURSE["Volunteer submits<br/>expense reference"]
        REIMBURSE --> REIMBURSED["✅ VolunteerReimbursed<br/>Grant complete"]

        CLEARED --> PAY["💸 Pay £40<br/>(bank transfer)"]
        PAY --> BANK_PAID["✅ GrantPaid (bank)<br/>Grant complete"]
    end

    %% NO-RESPONSE HANDLING
    subgraph "⏳ NO-RESPONSE HANDLING"
        WIN_NOTIFY -->|No response<br/>7 days| REMIND["Send reminder<br/>+ try calling if<br/>phone number on file"]
        REMIND -->|No response<br/>14 days| HOLD[Slot held until<br/>month end]
        HOLD -->|Month end| RELEASE
    end

    %% WAITLIST
    subgraph "📋 WAITLIST"
        RELEASE --> WAIT{Next person<br/>on waitlist?}
        WAIT -->|Yes| WIN_NOTIFY
        WAIT -->|No| ROLLOVER[Funds roll over<br/>to next month]
    end

    %% STYLE DEFINITIONS
    style SMS fill:#4CAF50,color:#fff
    style WEB fill:#4CAF50,color:#fff
    style REJ_COOL fill:#f44336,color:#fff
    style REJ_DUP fill:#f44336,color:#fff
    style REJ_CLOSED fill:#f44336,color:#fff
    style REJ_ID fill:#f44336,color:#fff
    style POOL fill:#2196F3,color:#fff
    style DRAW fill:#9C27B0,color:#fff
    style CASH_PAID fill:#4CAF50,color:#fff
    style BANK_PAID fill:#4CAF50,color:#fff
    style REIMBURSED fill:#4CAF50,color:#fff
    style PAY fill:#FF9800,color:#fff
```

---

## Key Rules

| Rule | Detail |
|------|--------|
| **Grant amount** | £40 fixed |
| **Cooldown** | 3 months from selection month (selected Jan → reapply Apr) |
| **Application window** | Volunteer explicitly opens and closes each month's window; applications outside the window are rejected with reason `window_closed` |
| **Phone number** | Mandatory — helps with eligibility checking and contacting winners |
| **Slots available** | Volunteer enters fund balance; `floor((balance − reserve) ÷ £40)`, reserve set by admin |
| **Unresponsive winners** | Reminder + phone call attempt at 7 days, slot held until month end then released to waitlist |
| **POA verification** | Max 3 attempts, then offered cash as alternative before releasing slot |
| **Payment options** | Bank transfer or cash (in-person meeting) |
| **Data retention** | Applicant info auto-deleted after 6 months (matching existing volunteer data policy) |

---

## Automated vs. Volunteer Actions

### Automated (implemented)
- Identity resolution (phone + name matching)
- Eligibility checks (window status, cooldown, duplicates)
- Applicant profile creation on first application
- Lottery draw (seeded RNG, deterministic, auditable)
- Selection fan-out (process manager dispatches to application streams)
- Grant creation from lottery selection (process manager)
- Cash alternative offered after 3 failed POA attempts
- Slot release on cash alternative decline

### Automated (not yet implemented)
- Auto-reply to SMS/email with form link
- Winner/non-winner notifications
- Bank details + POA form delivery
- Reminders for unresponsive winners
- Waitlist promotion

### Volunteer Actions (implemented)
- Resolve identity mismatches (review flagged applications)
- Open application window (manual, starts acceptance for the month)
- Close application window (manual, ends acceptance for the month)
- Trigger lottery draw (manual, after entering fund balance)
- Verify proof of address uploads (approve/reject)
- Assign volunteer to grant
- Record payment (bank transfer or cash handover)
- Record reimbursement (volunteer logs expense reference after cash handover)
- Release slot for unresponsive winners

### Volunteer Actions (not yet implemented)
- Handle edge cases / paused payments

---

## Domain Events

### Application Aggregate (implemented)

#### Commands

| Command | Who | Allowed States | What Happens |
|---------|-----|----------------|--------------|
| `SubmitApplication` | System (form handler) | initial | Resolves identity, checks eligibility; emits Submitted + (Accepted / Rejected / Flagged) |
| `ReviewApplication` | Volunteer | flagged | Confirms or rejects flagged identity; re-checks eligibility if confirmed |
| `SelectApplication` | System (process manager) | accepted, confirmed | Marks applicant as lottery winner with rank |
| `RejectFromLottery` | System (process manager) | accepted, confirmed | Marks applicant as not selected this month |

#### Events

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `ApplicationSubmitted` | Form completed | Resolve identity → Check eligibility; optionally carries bank details (sort code, account no., POA ref) if provided at apply time |
| `ApplicationFlaggedForReview` | Known phone, different name | Auto-notify applicant; add to volunteer queue |
| `ApplicationConfirmed` | Volunteer confirms flagged applicant | Re-check eligibility → Accept or reject |
| `ApplicationAccepted` | Eligibility passed | Add to lottery pool |
| `ApplicationRejected` | Cooldown/duplicate/identity_mismatch/window_closed | Notify applicant with reason |

### Applicant Aggregate (implemented)

Applicant holds identity only (phone, name, email). Per-application choices (payment preference, meeting place, bank details) live on each Application. Deterministic composite key: `applicant-${phone}-${normalizedName}`. Multiple applicants can share a phone number with different names.

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `ApplicantCreated` | New applicant submits form | Create applicant profile with phone, name, email |
| `ApplicantUpdated` | Volunteer updates applicant details | Update identity fields |
| `ApplicantDeleted` | Volunteer removes applicant | Soft-delete from read model |

### Volunteer Aggregate (implemented)

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `VolunteerCreated` | Admin creates volunteer account | Store name, contact details, password hash |
| `VolunteerUpdated` | Volunteer updates their profile | Update profile fields |
| `VolunteerDeleted` | Admin removes volunteer | Soft-delete from read model |

### Lottery Aggregate (implemented)

#### Commands

| Command | Who | Allowed States | What Happens |
|---------|-----|----------------|--------------|
| `OpenApplicationWindow` | Volunteer | initial | Opens the application window for this month's cycle; applications can now be submitted |
| `CloseApplicationWindow` | Volunteer | open | Closes the application window; no more applications accepted |
| `DrawLottery` | Volunteer | windowClosed | Volunteer provides fund balance, reserve, and grant amount; seeded RNG selects winners |

#### Events

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `ApplicationWindowOpened` | Volunteer opens window | Start accepting applications for this month |
| `ApplicationWindowClosed` | Volunteer closes window | Stop accepting new applications for this month |
| `LotteryDrawn` | Volunteer triggers draw | Seeded RNG selects winners; process manager fans out selection commands |

### Application Selection (implemented)

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `ApplicationSelected` | Process manager (post-draw) | Applicant won the lottery; ranked for waitlist |
| `ApplicationNotSelected` | Process manager (post-draw) | Applicant not selected this month |

### Grant Aggregate (implemented)

#### Commands

| Command | Who | Allowed States | What Happens |
|---------|-----|---------------|--------------|
| `CreateGrant` | System (process manager) | initial | Creates grant stream from ApplicationSelected; bank grants start at `awaiting_review` with bank details (sort code, account no., POA ref) copied from the application; cash grants start at `awaiting_cash_handover` |
| `AssignVolunteer` | Volunteer | any non-terminal | Assigns a volunteer to handle this grant |
| `UpdateBankDetails` | Volunteer | awaiting_review | Corrects sort code and/or account number after contacting applicant |
| `ApproveProofOfAddress` | Volunteer | awaiting_review | Approves POA; grant ready for bank payment |
| `RejectProofOfAddress` | Volunteer | awaiting_review | Rejects POA; grant stays in `awaiting_review`, `poaAttempts` incremented; after 3rd rejection, cash alternative is offered |
| `AcceptCashAlternative` | Applicant | offered_cash_alternative | Accepts cash; routes to cash handover |
| `DeclineCashAlternative` | Applicant | offered_cash_alternative | Declines cash; slot released |
| `RecordPayment` | Volunteer | poa_approved (bank only), awaiting_cash_handover (cash only) | Records payment; bank grants complete, cash grants await reimbursement |
| `RecordReimbursement` | Volunteer | awaiting_reimbursement | Records expense reference; cash grant fully complete |
| `ReleaseSlot` | Volunteer | any non-terminal | Manually releases slot (unresponsive, no-show, etc.) |

#### Events

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `GrantCreated` | Process manager reacts to ApplicationSelected | Create grant; bank grants start at `awaiting_review` with sort code, account number, and POA ref copied from the application; cash grants start at `awaiting_cash_handover` |
| `VolunteerAssigned` | Volunteer claims a grant | Track which volunteer handles the grant |
| `BankDetailsUpdated` | Volunteer corrects bank details | Update sort code and/or account number on the grant |
| `ProofOfAddressApproved` | Volunteer approves POA | Grant moves to `poa_approved`, ready for bank payment |
| `ProofOfAddressRejected` | Volunteer rejects POA | `poaAttempts` incremented; grant stays in `awaiting_review`; after 3rd rejection, `CashAlternativeOffered` also emitted |
| `CashAlternativeOffered` | 3rd POA rejection | Offer applicant cash instead of bank transfer |
| `CashAlternativeAccepted` | Applicant accepts cash | Route to cash handover flow |
| `CashAlternativeDeclined` | Applicant declines cash | Slot released |
| `GrantPaid` | Transfer sent or cash handed over | Bank grants complete; cash grants move to awaiting_reimbursement |
| `VolunteerReimbursed` | Volunteer records expense | Cash grant fully complete |
| `SlotReleased` | Volunteer releases / cash declined | Release slot to waitlist |

#### State Machine

```mermaid
stateDiagram-v2
    [*] --> awaiting_review : GrantCreated (bank)
    [*] --> awaiting_cash_handover : GrantCreated (cash)

    awaiting_review --> poa_approved : ProofOfAddressApproved
    awaiting_review --> awaiting_review : ProofOfAddressRejected (< 3, poaAttempts++)
    awaiting_review --> offered_cash_alternative : ProofOfAddressRejected (3rd)

    poa_approved --> paid : GrantPaid (bank)

    offered_cash_alternative --> awaiting_cash_handover : CashAlternativeAccepted
    offered_cash_alternative --> released : CashAlternativeDeclined

    awaiting_cash_handover --> awaiting_reimbursement : GrantPaid (cash)
    awaiting_reimbursement --> reimbursed : VolunteerReimbursed

    awaiting_review --> released : SlotReleased
    poa_approved --> released : SlotReleased
    offered_cash_alternative --> released : SlotReleased
    awaiting_cash_handover --> released : SlotReleased

    note right of paid : Terminal (bank)
    note right of reimbursed : Terminal (cash)
    note right of released : Terminal
```

### Not Yet Implemented

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `FormLinkRequested` | SMS/email received | Auto-reply with unique pre-filled form URL |
| `ApplicantDataExpired` | 6 months since last activity | Auto-delete applicant info (retain inbox records) |

---

## External Systems

| System | Purpose |
|--------|---------|
| Email service | Notifications + form links |
| SMS gateway | Inbound SMS parsing + outbound notifications |
| Web form | Application intake |
| Document storage | Proof of address uploads |

> **Note:** Fund balance queries are not automated — volunteers manually provide the fund balance and enter expense references when recording reimbursements.

---

*Implemented as a TypeScript + Bun event-driven system using Emmett for event sourcing.*
