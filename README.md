# Cambridge Solidarity Fund

A grant lottery system for distributing monthly grants to people in need. Applications are collected during a limited window, then winners are randomly drawn at month end, funded by Open Collective.

## How it works

1. People apply via SMS, email, or web form during a monthly window
2. Identity is resolved against known applicants by phone number
3. Eligibility is checked (3-month cooldown, no duplicate applications)
4. Eligible applicants enter the lottery pool
5. At month end, winners are drawn based on available funds
6. Winners receive grants via bank transfer or cash

## Architecture

Event-sourced using [Emmett](https://event-driven-io.github.io/emmett/) with SQLite.

```
Form data
  |
  v
submitApplication()          -- application service (orchestrates I/O)
  |
  |-- resolveIdentity()      -- queries known_applicants projection
  |-- decide()               -- pure decider, no I/O
  |-- CommandHandler          -- persists events to event store
  |
  v
Events --> Projections       -- inline projections update read models
```

### Domain (`src/domain/application/`)

| File | Role |
|------|------|
| `submitApplication.ts` | Application service. Single entry point for the submission flow |
| `decider.ts` | Pure decider. Command + state in, events out |
| `resolveIdentity.ts` | Queries the `known_applicants` read model by phone number |
| `normalizeName.ts` | Strips diacritics, normalizes whitespace and casing for name comparison |
| `types.ts` | Commands, events, state, and value objects |

### Infrastructure (`src/infrastructure/`)

| File | Role |
|------|------|
| `eventStore.ts` | Creates the SQLite event store with inline projections |
| `projections/eligibility.ts` | Tracks accepted applications per month cycle |
| `projections/knownApplicants.ts` | Maps phone numbers to applicant IDs and names |

### Identity resolution

When an application is submitted, the phone number is looked up against known applicants:

- **No match** -- new applicant, assigned `applicant-{phone}` as ID
- **Phone + name match** -- linked to existing applicant
- **Phone matches, name differs** -- flagged for volunteer review, eligibility deferred

### Event flow

```
SubmitApplication (command)
  |
  +--> ApplicationSubmitted        (always emitted)
  |
  +--> ApplicationAccepted         (eligible, identity resolved)
  |  or ApplicationRejected        (cooldown / duplicate)
  |  or ApplicationFlaggedForReview (name mismatch on known phone)
```

## Running

```sh
bun install
bun test
```

## Docs

- [Full workflow and state machines](docs/workflow.md)
- [Volunteer-friendly proposal](docs/proposal.md)
