# Cambridge Solidarity Fund — Grant Lottery System

**Proposal for volunteer approval — March 2026**

## Summary

We're moving from manually awarding £40 grants to a **lottery-based system**: anyone applies during the month, winners are randomly drawn at month end, limited by available Open Collective funds.

---

## Full Workflow

```mermaid
flowchart TD
    subgraph "📥 APPLICATION PHASE · 1st—28th of month"
        SMS([📱 Person texts or<br/>emails to apply]) --> LINK[Auto-reply with<br/>unique form link]
        WEB([🌐 Person visits<br/>website form]) --> FORM
        LINK --> FORM["Complete Online Form<br/>(name, phone OR email,<br/>meeting place or address,<br/>payment preference: bank or cash)"]

        FORM --> ID{Identity<br/>Resolution}
        ID -->|Email + name or<br/>phone + name match| EXISTING[Link to existing<br/>applicant profile]
        ID -->|Known email or phone,<br/>different name| FLAG["📧 Auto-notify:<br/>'A volunteer will<br/>contact you shortly'"]
        ID -->|No match| NEW[Create new<br/>applicant profile]

        EXISTING --> ELIG
        FLAG -->|Volunteer contacts<br/>& confirms identity| ELIG
        NEW --> ELIG

        ELIG{Eligibility<br/>Check}
        ELIG -->|Last grant < 3 months| REJ_COOL[❌ Rejected<br/>Too soon — notify]
        ELIG -->|Already applied<br/>this month| REJ_DUP[❌ Rejected<br/>Duplicate — notify]
        ELIG -->|✅ Eligible| POOL[✅ Added to<br/>Lottery Pool]
    end

    subgraph "🎲 LOTTERY PHASE · Month End"
        TIMER([⏰ Month-end<br/>scheduler fires]) --> CLOSE[Close application<br/>window]
        CLOSE --> BALANCE[Query Open Collective<br/>for fund balance]
        BALANCE --> CALC["Calculate slots:<br/>floor((balance − reserve) ÷ £40)"]
        CALC --> DRAW[🎲 Draw lottery<br/>with auditable RNG seed]

        DRAW --> WINNERS[🏆 Selected winners<br/>in ranked order]
        DRAW --> LOSERS[Not selected]

        WINNERS --> WIN_NOTIFY[📧 Notify winners<br/>via email/SMS]
        LOSERS --> LOSE_NOTIFY[📧 Notify non-winners<br/>via email/SMS]
    end

    subgraph "💳 PAYMENT PHASE"
        WIN_NOTIFY -->|Chose bank transfer| BANK_FORM["📧 Auto-send secure form:<br/>• Upload proof of address<br/>• Enter bank details<br/>(sort code + account no.)"]
        WIN_NOTIFY -->|Chose cash| CASH_MEET["Volunteer contacts<br/>recipient to arrange<br/>cash handover"]

        BANK_FORM --> UPLOAD([Recipient submits<br/>POA + bank details])
        UPLOAD --> VERIFY{Volunteer<br/>verifies POA}
        VERIFY -->|✅ Approved| CLEARED[Due diligence<br/>passed]
        VERIFY -->|❌ Rejected| RETRY{Attempts<br/>< 3?}
        RETRY -->|Yes| BANK_FORM
        RETRY -->|No| RELEASE[Slot released<br/>to waitlist]

        CASH_MEET --> CASH_DONE([Cash handed<br/>over in person])
        CASH_DONE --> RECORD

        CLEARED --> RECHECK[Re-check fund<br/>balance]
        RECHECK -->|Sufficient ✅| PAY["💸 Pay £40<br/>(transfer or cash)"]
        RECHECK -->|Insufficient ❌| PAUSE[⚠️ Paused<br/>Alert volunteers]

        PAY --> RECORD[✅ Grant recorded<br/>3-month cooldown starts]
    end

    subgraph "⏳ NO-RESPONSE HANDLING"
        WIN_NOTIFY -->|No response<br/>7 days| REMIND[Send reminder]
        REMIND -->|No response<br/>14 days| RELEASE
    end

    subgraph "📋 WAITLIST"
        RELEASE --> WAIT{Next person<br/>on waitlist?}
        WAIT -->|Yes| WIN_NOTIFY
        WAIT -->|No| ROLLOVER[Funds roll over<br/>to next month]
    end

    POOL -.->|End of month| TIMER

    style SMS fill:#4CAF50,color:#fff
    style WEB fill:#4CAF50,color:#fff
    style REJ_COOL fill:#f44336,color:#fff
    style REJ_DUP fill:#f44336,color:#fff
    style POOL fill:#2196F3,color:#fff
    style DRAW fill:#9C27B0,color:#fff
    style RECORD fill:#4CAF50,color:#fff
    style PAY fill:#FF9800,color:#fff
    style PAUSE fill:#f44336,color:#fff
```

---

## Application State Machine

```mermaid
stateDiagram-v2
    direction TB

    state "📥 Intake" as intake {
        [*] --> Submitted: Form completed
        Submitted --> FlaggedForReview: Known contact,\nname mismatch
        Submitted --> Accepted: Eligibility passed
        Submitted --> Rejected: Cooldown / duplicate
        FlaggedForReview --> Accepted: Volunteer confirms
        FlaggedForReview --> Rejected: Volunteer rejects
    }

    state "🎲 Lottery" as lottery {
        Accepted --> Selected: Lottery win
        Accepted --> NotSelected: Lottery loss
    }

    state "💳 Payment" as payment {
        Selected --> AwaitingBankDetails: Notified (chose bank)
        Selected --> CashHandover: Notified (chose cash)
        AwaitingBankDetails --> AwaitingBankDetails: Attempt failed\n(retries remain)
        AwaitingBankDetails --> DueDiligencePassed: POA verified
        DueDiligencePassed --> Paid: Transfer sent
        CashHandover --> Paid: Volunteer hands over cash
    }

    state "📋 Release & Waitlist" as release {
        Selected --> Released: No response (14 days)
        AwaitingBankDetails --> Released: Max attempts exceeded
        CashHandover --> Released: No-show / timeout
        Released --> Selected: Waitlist next-up
    }

    Paid --> [*]: Cooldown recorded
    Rejected --> [*]
    NotSelected --> [*]

    note right of Selected: Reminder sent at 7 days
```

---

## Key Rules

| Rule | Detail |
|------|--------|
| **Grant amount** | £40 fixed |
| **Cooldown** | 3 months from selection month (selected Jan → reapply Apr) |
| **Application window** | 1st–28th of each month |
| **Slots available** | `floor((balance − reserve) ÷ £40)`, reserve set by admin |
| **Unresponsive winners** | Reminder at 7 days, released to waitlist at 14 days |
| **POA verification** | Max 3 attempts, then slot released to waitlist |
| **Payment options** | Bank transfer or cash (in-person meeting) |

---

## Automated vs. Volunteer Actions

### Automated
- Auto-reply to SMS/email with form link
- Eligibility checks (cooldown, duplicates)
- Lottery draw (auditable random seed)
- Winner/non-winner notifications
- Bank details + POA form delivery
- Reminders for unresponsive winners
- Waitlist promotion

### Volunteer Actions
- Resolve identity mismatches (known contact, different name)
- Verify proof of address uploads
- Contact recipients and hand over cash
- Handle edge cases / paused payments

---

## Domain Events

| Event | Trigger | What Happens |
|-------|---------|--------------|
| `FormLinkRequested` | SMS/email received | Auto-reply with unique pre-filled form URL |
| `ApplicationSubmitted` | Form completed | Resolve identity → Check eligibility |
| `IdentityFlagged` | Known email or phone, different name | Auto-notify applicant; add to volunteer queue |
| `IdentityConfirmed` | Volunteer confirms flagged applicant | Proceed to eligibility check |
| `ApplicationAccepted` | Eligibility passed | Add to lottery pool |
| `ApplicationRejected` | Cooldown/duplicate/ineligible | Notify applicant with reason |
| `ApplicationWindowClosed` | Scheduler (month end) | Query OC balance → Calculate slots → Draw lottery |
| `LotteryDrawn` | RNG draw complete | Notify winners (bank: send POA form, cash: notify volunteer) + notify non-winners |
| `BankDetailsSubmitted` | Recipient submits POA + bank details | Add to volunteer verification queue |
| `ProofOfAddressVerified` | Volunteer approves | Initiate payment |
| `ProofOfAddressRejected` | Volunteer rejects | Notify recipient, allow retry (max 3) |
| `WinnerUnresponsive` | 14 days no response | Release slot to waitlist |
| `SlotReleased` | Max POA attempts or cash no-show | Release slot to waitlist |
| `CashHandoverCompleted` | Volunteer hands over cash in person | Record grant, start 3-month cooldown |
| `BankTransferCompleted` | Funds transferred | Record grant, start 3-month cooldown |

---

## External Systems

| System | Purpose |
|--------|---------|
| Open Collective | Query fund balance (GraphQL API) |
| Email service | Notifications + form links |
| SMS gateway | Inbound SMS parsing + outbound notifications |
| Web form | Application intake |
| Document storage | Proof of address uploads |

---

*Once approved, we'll implement this as a TypeScript + Node.js event-driven system.*
