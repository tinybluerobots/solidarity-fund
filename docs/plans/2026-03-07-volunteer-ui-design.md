# Volunteer Management UI — Design

## Data Model Changes

Add two boolean flags to the volunteer aggregate:

- **`isAdmin`** — gates access to volunteer management routes. Set via `VolunteerCreated` event, not changeable through the UI (only via seed/direct command).
- **`requiresPasswordReset`** — set `true` on creation. On login, if flag is true, redirect to `/change-password` instead of dashboard. Cleared when password is changed.

New command: `ChangePassword` — validates old password, hashes new one, clears `requiresPasswordReset`.
New event: `PasswordChanged` — stores new hash, sets `requiresPasswordReset: false`.

## Auth Flow Change

```
Login -> check requiresPasswordReset -> if true, redirect to /change-password
Change password form -> PasswordChanged event -> redirect to /
```

The change-password page is accessible to any logged-in volunteer (not just those with the flag). The flag just forces a redirect on login.

## Admin Middleware

New `requireAdmin()` middleware wrapping volunteer management routes. Returns 403 if `!volunteer.isAdmin`. Non-admins don't see the "Volunteers" nav link.

## UI — Same Pattern as Recipients

- **List page** (`/volunteers`) — table with name, phone, email, admin badge. Search input with Datastar signals.
- **Sliding panel** — view/edit/create forms, identical interaction pattern to recipient panel.
- **Create form** — name, phone, email, initial password, isAdmin checkbox.
- **Edit form** — same fields. Password field optional (only updates if filled). Can't remove own admin flag.
- **Delete** — can't delete yourself.

## Routes

| Method | Path | What |
|--------|------|------|
| GET | `/volunteers` | List page |
| GET | `/volunteers/new` | Create panel |
| GET | `/volunteers/:id` | View panel |
| GET | `/volunteers/:id/edit` | Edit panel |
| GET | `/volunteers/close` | Close panel |
| POST | `/volunteers` | Create |
| PUT | `/volunteers/:id` | Update |
| DELETE | `/volunteers/:id` | Delete |
| GET | `/change-password` | Password reset page |
| POST | `/change-password` | Handle password change |

## Seed Update

`seed.ts` creates initial volunteer with `isAdmin: true, requiresPasswordReset: true`.

## Nav

Add "Volunteers" link to dashboard/layout — visible only to admins.

## Safety Rules

- Can't delete yourself
- Can't remove your own admin flag
- Password field on edit is optional (blank = no change)
- `requiresPasswordReset` is set automatically on create, cleared on password change
