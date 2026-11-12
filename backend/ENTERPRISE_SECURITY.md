# Audit security for manual record management

This portal manages campaign records, resellers, users, and credit balances. Campaign approval, sending outside the portal, reporting, and publication remain manual. There is no external sending integration, provider credential requirement, completion webhook, or automatic report publication.

## Durable records and credits

Campaign status and report progress remain saved in MongoDB. A restart does not erase them. Existing wallet changes, ledger postings, and report credit adjustments use MongoDB transactions: either the complete operation commits or it rolls back. A failed request can be retried using the existing credit idempotency keys. Approval does not charge a campaign a second time.

Failed/Completed draft status changes do not move credits. Refunds from manual report editing are finalized with report publication. Retained background jobs cannot approve or reopen campaigns or invent delivery results. There is no background sender to configure.

## Signing configuration

Use a persistent random signing secret of at least 32 bytes in the backend environment or deployment secret manager. Never commit it or change it on each restart.

```dotenv
AUDIT_SIGNING_KEY=<persistent-random-secret-at-least-32-bytes>
AUDIT_KEY_ID=v1
# Optional: only list your actual trusted reverse proxy IPs/CIDRs.
# TRUST_PROXY=127.0.0.1,10.0.0.0/24
```

The local signing key is configured in the ignored `backend/.env` file. Production requires its own persistent secret. Missing or short keys stop startup so the portal cannot silently run without its audit trail. MongoDB must support transactions (a replica set), as required by the existing credit system.

## What is recorded

Authenticated changes and admin/reseller reads record the actor, timestamp, request ID, method/path, IP address, user agent, and sanitized input. The effective account and original impersonating administrator are retained. Passwords, tokens (including preview tokens), cookies, and secrets are redacted. Large recipient/report arrays are represented by counts and SHA-256 digests rather than duplicated into every event.

Each request writes an intent before its handler runs and an outcome before the response is sent. A crash leaves an identifiable unresolved intent. Outcomes describe the HTTP response, not an assertion that every step of a multi-step handler committed.

User, wallet, campaign, and credit-transaction changes additionally write before/after audit records inside the same MongoDB transaction as the change. This covers creation, rates, account and credit expiry, role/access changes, allocations, reclaims, charges, refunds, campaign status decisions, report publication, and deletions. Rolled-back changes do not leave successful business-change events. Device/session actions and other authenticated actions have request-level records.

Audit recording failure blocks the action or rolls back its transaction. If a business transaction committed but recording the HTTP outcome fails, the client receives an audit-confirmation error; inspect the request ID and reuse the original credit idempotency key when retrying.

## Integrity and retention

Audit events are append-only through the application model, with no update/delete API. Per-resource sequence numbers, previous hashes, and HMAC signatures allow verification of edits, missing events, and truncated tails. The database runtime principal should have **insert/find only on `audit_events`**, with find/insert/update on `audit_heads`. Provision indexes separately or grant the deployment principal `createIndex`; startup currently ensures the indexes exist.

Database superusers can bypass application hooks. For infrastructure-enforced immutability, retain verified exports and checkpoints in independently managed retention-locked/WORM storage, keep signing keys separate from database administration, and apply the restricted database role above. A database superuser can otherwise roll back both events and heads together. This code provides application-level append-only records and tamper detection; it does not by itself certify regulatory compliance.

Use a new `AUDIT_KEY_ID` when rotating the signing key. Preserve old verification keys in the secret-manager-provided `AUDIT_VERIFY_KEYS_JSON` map keyed by their old IDs. Keep previously exported checkpoints outside the database.

## Read-only audit access

Only Super Admin can read or verify the audit history. Preview sessions are blocked. Open **Audit log** in the Super Admin sidebar to search records, inspect before/after values, and verify a record's history. The default view shows saved record changes; choose Request activity or All audit records for request-level records.

- `GET /api/enterprise/audit?stream=campaign:<id>&limit=50&before=<cursor>`
- `GET /api/enterprise/audit?actorId=<id>`
- `GET /api/enterprise/audit?requestId=<request-id>`
- `GET /api/enterprise/audit?scope=requests&search=<name-or-reference>`
- `GET /api/enterprise/audit/verify?stream=campaign:<id>`

Streams include `user:<id>`, `wallet:<wallet-id>`, `transaction:<id>`, `campaign:<id>`, and `request:<request-id>`. Verify one stream with `npm run audit:verify -- <stream>` or omit it to verify all heads.

Export a verified stream with `node scripts/export-audit-trail.js '<stream>' > archive.jsonl`. Require exit code 0 and a final signed checkpoint before accepting the archive. The script sends connection messages to stderr and writes only signed records/checkpoints to stdout. Store the archive separately from the application database.

## Campaign attachment safety

The backend requires Node.js 22 or newer for the maintained file-signature detector.
Campaign uploads allow JPG/PNG/WebP images, MP4/MOV/WebM videos, supported binary
audio formats, and PDF documents. File extensions must match detected contents;
the entire batch is checked before any file is stored. Images are re-encoded as
WebP and local filenames are generated by the server. Cloudinary uploads use an
explicit image/video/raw resource type and generated identifiers.

Local PDF documents and legacy uploads are served as downloads with `nosniff`
and a restrictive sandbox policy, including HTML files saved before this fix.
Generated media and profile images retain inline previews. This prevents uploaded
documents from becoming executable application-origin pages; it does not provide
malware scanning or change attachment access permissions.

### Upload memory and DoS protections

Campaign multipart uploads enforce parser-level limits before buffering into RAM:
- Maximum 16 MB per file, up to 15 files per campaign request.
- Maximum 4 MB per non-file text/JSON field, up to 50 fields.
- 35 MB total aggregate upload budget:
  - Header inspection: Declared `Content-Length > 35 MB` is rejected with 413 immediately.
  - Stream inspection: Chunked or missing `Content-Length` requests count incoming stream bytes continuously. Exceeding 35 MB triggers an immediate 413, unpipes the parser, drains the remaining TCP stream to prevent pipe stall, and halts memory buffering.
  - Bounded memory storage: Custom `BoundedMemoryStorage` enforces the aggregate 35 MB budget across all parsed file chunks.
- Process-local concurrency limiter: Up to 5 concurrent multipart uploads per process; excess requests receive 429 `CONCURRENT_UPLOAD_LIMIT`. Slots are reliably freed upon completion, errors, or client aborts.
- Ingress alignment: Production edge reverse proxies (e.g. Nginx `client_max_body_size 35M` or matching Cloudflare/Render ingress limits) should be kept aligned with the application-layer 35 MB limit.

## Validation

Socket connections validate the active database session and current account status
at handshake, before every incoming action, and before application notifications
are delivered. JWT, session and account expiry set server-side disconnect timers.
Role or reseller changes require a fresh connection with current permissions.
Logout, device eviction, account blocking/deletion and role changes disconnect
transports server-side; the client cannot retain access by ignoring logout events.
Preview and full-access impersonation exits close only their temporary session
without sending a logout event that would clear the restored manager credentials.

Idle sockets are revalidated every 30 seconds for out-of-band database changes;
notifications still require a fresh access check during that interval. Database
verification errors or timeouts fail closed. Send application events through the
socket service notification helpers so outgoing authorization is always applied.

The `xlsx` dependency is pinned to SheetJS CE 0.20.3 from the vendor's official
CDN, with an integrity hash in `package-lock.json`. This replaces the unmaintained
npm-registry release 0.18.5 and includes the fixes for CVE-2023-30533 and
CVE-2024-22363. Keep the official distribution URL when updating; installing
`xlsx@latest` from the npm registry would restore the vulnerable release.
