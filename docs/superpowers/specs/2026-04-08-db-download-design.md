# Database Download Feature

## Purpose

Allow admin volunteers to download a full copy of the SQLite database as a backup, protecting against data loss.

## Design

### Route

`GET /download-db` — admin-only, returns the raw SQLite database as a file download.

### Implementation

1. **Auth**: Use existing `requireAuth(req)` → check `volunteer.isAdmin`
2. **Snapshot**: Call `db.serialize()` on the SQLite connection to get a safe point-in-time `Uint8Array`
3. **Response**: Return with `Content-Disposition: attachment; filename="solidarity-fund-YYYY-MM-DD.sqlite"` and `Content-Type: application/x-sqlite3`

### Access to DB

The `pool` (SQLiteConnectionPool) is already available in `startServer()`. We need to get the underlying `Database` instance from the pool to call `.serialize()`. The pool's `execute()` callback receives a connection — we can use that to serialize.

### Route registration

Add to the `routes` object in `server.ts` alongside other admin routes like `/logs`.

### Security

- Admin-only (403 for non-admins, redirect for unauthenticated)
- No data stripping — this is a full backup
- Rate limiting not required (admin trust boundary)

### Testing

- Test that non-admin volunteers get 403
- Test that unauthenticated users get redirected
- Test that admins receive a response with correct content-type and disposition headers
