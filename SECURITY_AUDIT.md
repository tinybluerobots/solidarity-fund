# Security Audit — 2026-03-12

## CRITICAL

### C1 — CDN Script Without SRI ✅ Fixed 2026-03-12
- **File:** `src/web/pages/layout.ts:17`
- **Description:** Datastar loads from jsDelivr with no `integrity` hash. A CDN compromise or MITM injects arbitrary JS into every authenticated page. TODO comment in code acknowledges this.
- **Fix:** Added `integrity="sha384-l31DqEvDq6UMs2jK/XNO8hHjWNkHvwcU4xr3h2Sq+w0zH0lvnL4WYwpPUXiKa1Z7"` to the script tag.

### C2 — Password Hash Stored in Event Store ✅ Fixed 2026-03-12
- **Files:** `src/domain/volunteer/types.ts:101,113,142`
- **Description:** `passwordHash` is embedded in `VolunteerCreated`, `VolunteerUpdated`, and `PasswordChanged` events. Event stores are append-only — every historical hash is retained forever, multiplying breach impact.
- **Fix:** Introduced `volunteer_credentials` table as a separate mutable store. Command handlers write hashes directly as a side effect; `passwordHash` removed from all event and command types. Startup migration copies existing hashes from the projection table.

---

## HIGH

### H1 — Security Headers Miss All Routed Responses
- **File:** `src/web/server.ts:149-327`
- **Description:** `withSecurityHeaders()` only runs in the `fetch()` fallback (lines 332, 592). Every route in `routes: {}` — including `/login`, `/apply`, `/change-password` — returns responses with no CSP, no `X-Frame-Options`, no `X-Content-Type-Options`.
- **Fix:** Wrap every route handler's response with `withSecurityHeaders()`, or apply it as a response-interceptor.

### H2 — No CSRF Protection on State-Mutating POSTs
- **Files:** `src/web/server.ts:153,211,218,228`
- **Description:** `SameSite=Lax` doesn't block form-submission CSRF. `/login` is vulnerable to login CSRF (attacker logs victim into attacker's account).
- **Fix:** Add CSRF tokens to all mutating forms, or use `SameSite=Strict` for admin cookies.

### H3 — XSS via Unescaped `volunteerName`
- **File:** `src/web/pages/applicantHistoryPanel.ts:28-33`
- **Description:** `volunteerName` interpolated raw into HTML. A volunteer named `<script>alert(1)</script>` executes in every history panel view.
- **Fix:** Wrap with `escapeHtml()`.

### H4 — Bank Details in Query String
- **File:** `src/web/pages/grantPanel.ts:150`
- **Description:** Sort codes and account numbers sent as URL query params — logged in server access logs, browser history, and proxy logs.
- **Fix:** Move to request body.

### H5 — No Rate Limiting on `/apply`
- **File:** `src/web/server.ts:153-155`
- **Description:** ALTCHA present but no IP-based rate limit — application flooding and ALTCHA challenge exhaustion are possible.
- **Fix:** Apply a `checkLoginRateLimit()` equivalent to the `/apply` POST route.

### H6 — Sequential Integer Refs Enable Enumeration
- **Files:** `src/web/routes/status.ts:53-54`, `src/web/pages/status.ts:337-358`
- **Description:** `/status?ref=1`, `ref=2`, ... exposes all applicants' status and payment progress. The 30 req/min rate limit is no meaningful barrier.
- **Fix:** Replace sequential integers with random alphanumeric tokens (e.g., 8-char base62).

---

## MEDIUM

### M1 — File Upload Trusts Client-Reported MIME Type
- **Files:** `src/web/routes/apply.ts:121`, `src/web/routes/grants.ts:172`
- **Description:** `poaFile.type` comes from the browser's `Content-Type` header, which is trivially spoofable. An attacker uploads an HTML file labelled as `image/png`; it's served back with the stored MIME type, enabling stored XSS.
- **Fix:** Validate file content magic bytes. Force `Content-Disposition: attachment` on document serving.

### M2 — Uploaded Documents Served Inline with Client-Controlled Content-Type
- **File:** `src/web/routes/grants.ts:169-178`
- **Description:** Documents served with `Content-Disposition: inline` and the attacker-controlled MIME type. Enables stored XSS if magic-byte check is absent.
- **Fix:** Serve user-uploaded documents from a separate origin, or force `Content-Disposition: attachment` and detect type from magic bytes.

### M3 — Lottery/Grant/Application Mutations Lack Admin-Role Check
- **File:** `src/web/server.ts:261-306`
- **Description:** Routes for lottery draw, application review, grant payment recording, and slot assignment only check authentication, not admin role. Any authenticated volunteer can perform these operations.
- **Fix:** Add admin guards matching the pattern used on `/volunteers` routes.

### M4 — `Secure` Cookie Flag Relies on Implicit `NODE_ENV` Check
- **File:** `src/infrastructure/auth/cookie.ts:6`
- **Description:** `Secure` flag is set when `NODE_ENV !== "development"`. If `NODE_ENV=development` is set in production (e.g., for debugging), cookies transmit over HTTP.
- **Fix:** Default to secure; disable only via an explicit opt-out env var like `INSECURE_COOKIES=true`.

### M5 — In-Memory Rate Limiters Not Shared Across Instances
- **Files:** `src/web/server.ts:32`, `src/web/routes/status.ts:19`
- **Description:** Rate limits stored in in-memory Maps. Bypassed trivially under a load balancer. Maps also grow unbounded — expired entries are only evicted on new attempts.
- **Fix:** Use Redis or SQLite for rate limit state. Add periodic cleanup sweep and Map size cap as interim measure.

### M6 — Static File Routes Missing Security Headers
- **File:** `src/web/server.ts:166-196`
- **Description:** Static file responses (`/scripts/altcha.js`, `/styles/app.css`, etc.) returned without `X-Content-Type-Options: nosniff` or other security headers.
- **Fix:** Apply security headers to all responses including static files.

### M7 — Disabled Volunteers' Sessions Not Invalidated
- **Files:** `src/web/routes/volunteers.ts:100-114`, `src/web/server.ts:78-88`
- **Description:** `getAuthenticatedVolunteer()` does not check `isDisabled`. A disabled volunteer can continue using the app for up to 24 hours until session expiry.
- **Fix:** Check `volunteer.isDisabled` in `getAuthenticatedVolunteer()` and return `null` if disabled. Destroy active sessions when a volunteer is disabled.

---

## LOW

### L1 — Volunteer Creation Has No Password Minimum Length
- **File:** `src/web/routes/volunteers.ts:165`
- **Description:** Change-password enforces 12 chars (`auth.ts:96`) but volunteer creation accepts any non-empty password.
- **Fix:** Enforce the same 12-character minimum in the volunteer creation flow.

### L2 — `X-Forwarded-For` Trusted Without Validation
- **Files:** `src/web/server.ts:36`, `src/web/routes/status.ts:39`
- **Description:** XFF header trusted blindly — attacker rotates fake IPs to bypass rate limiting.
- **Fix:** Configure trusted proxy count and extract IP from the correct XFF chain position only.

### L3 — Internal State Names Leak in Error Messages
- **File:** `src/domain/volunteer/decider.ts:29`
- **Description:** Error messages include internal state machine values (`initial`, `active`, `disabled`). If these propagate to clients they reveal implementation details.
- **Fix:** Return generic error messages to clients; log details server-side.

### L4 — No `Cache-Control: no-store` on Authenticated Pages
- **File:** `src/web/server.ts` (throughout)
- **Description:** Authenticated pages containing PII (names, phone numbers, bank details) served without cache-prevention headers. Browsers and proxies may cache them.
- **Fix:** Add `Cache-Control: no-store, no-cache, must-revalidate` to all authenticated responses.

### L5 — `clearSessionCookie()` Omits `Secure` Flag
- **File:** `src/infrastructure/auth/cookie.ts:17-19`
- **Description:** Minor inconsistency — the cleared cookie doesn't match the flags of the set cookie.
- **Fix:** Apply same flags as `setSessionCookie()`.

### L6 — UUIDs Exposed in URL Paths
- **Description:** URLs like `/applicants/{uuid}/edit` expose internal IDs in access logs and browser history alongside PII routes.
- **Fix:** Low priority; consider opaque tokens if log hygiene is a concern.

### L7 — Disabled Volunteer Can Act Until Session Expires
- **File:** `src/web/server.ts:78-88`
- **Description:** Covered by M7 above; listed separately as the root cause is the missing `isDisabled` check in session validation rather than missing session destruction.

### L8 — No Complexity Requirements Beyond Length
- **File:** `src/web/routes/auth.ts:96`
- **Description:** Password policy is length-only (12 chars). No entropy or complexity check.
- **Fix:** Consider dictionary/common-password check (e.g., zxcvbn) rather than arbitrary complexity rules.

---

## Priority Order

1. **C2** — Remove password hashes from event payloads (architectural — can't be patched retroactively)
2. **C1** — Add SRI hash to datastar CDN script
3. **H1** — Apply security headers to all routed responses
4. **M3** — Admin-role guards on lottery/grant mutations
5. **H6** — Replace sequential ref numbers with random tokens
6. **M7** — Invalidate sessions on volunteer disable
7. **H3** — Escape `volunteerName` in history panel
8. **H4** — Move bank details out of query strings

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 6 |
| Medium | 7 |
| Low | 8 |
