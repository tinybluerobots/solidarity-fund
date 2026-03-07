# Application Form & Applications Management Design

## 1. Public Application Form (`/apply`)

Plain HTML form, no auth, no Datastar.

- Server determines current month cycle automatically
- If window is closed, show a static "applications are currently closed" page instead of the form
- Form fields:
  - Name (required)
  - Phone number (required)
  - Email (optional)
  - Meeting place / address (text, required)
  - Payment preference: bank transfer or cash (radio buttons)
  - If bank: sort code + account number fields (shown via basic JS toggle)
- `POST /apply` runs `submitApplication`, then redirects to `/apply/result?status=accepted|rejected|flagged&reason=...`
- Result page shows:
  - **accepted**: "You're in this month's lottery pool"
  - **flagged**: "A volunteer will contact you shortly to confirm your identity"
  - **rejected (window_closed)**: "Applications are currently closed"
  - **rejected (cooldown)**: "You received a grant recently -- you can reapply in [month]"
  - **rejected (duplicate)**: "You've already applied this month"

Styling: Same Tailwind palette (cream, bark, amber) but standalone page with no dashboard nav. Simple centered card.

## 2. Applications Management (`/applications`)

Authenticated (all volunteers), Datastar SSE, follows recipients pattern.

- Table columns: Name, Phone, Status (badge), Payment Pref, Applied date
- Filter by month cycle -- dropdown defaulting to current month, SSE-driven refresh
- Status badges: accepted (blue), flagged (amber), rejected (red), selected (green), not_selected (gray)
- Slide-out panel on row click:
  - View mode: all application details + applicant info
  - For flagged applications: "Confirm Identity" and "Reject" buttons
  - For other statuses: read-only detail view
- Dashboard card linking to `/applications`

## 3. Out of Scope

- No manual application creation by volunteers
- No edit/delete of applications
- No notification sending
- No search/filter beyond month cycle
