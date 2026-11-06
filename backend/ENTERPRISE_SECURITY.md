# Durable campaigns and audit records

The campaign lifecycle uses the existing BullMQ queue and a MongoDB transactional outbox. MongoDB is the source of truth for the next workflow step; Redis is the execution transport. A recovery loop checks due workflows every 10 seconds. No external sender is contacted unless workflows are explicitly enabled and configured.

## Configuration

Set these values in the deployment secret manager or backend environment. Do not commit secrets.

```dotenv
# Required for backend startup and all signed audit writes. Use a random secret.
AUDIT_SIGNING_KEY=<at-least-32-random-bytes>
AUDIT_KEY_ID=v1

# Enable only after the external sender implements the contract below.
CAMPAIGN_WORKFLOW_ENABLED=true
CAMPAIGN_PROVIDER_URL=https://sender.example.com/campaigns
CAMPAIGN_PROVIDER_TOKEN=<sender-api-token>
CAMPAIGN_CALLBACK_URL=https://your-app.example.com/api/webhooks/campaigns/completion
CAMPAIGN_WEBHOOK_SECRET=<a-separate-at-least-32-byte-random-secret>

# Optional: only list your actual trusted reverse proxy IPs/CIDRs.
# TRUST_PROXY=127.0.0.1,10.0.0.0/24
```

Audit logging is always enabled. Missing signing configuration fails startup rather than silently running without an audit trail. Disabling campaign workflows preserves the existing manual campaign processing. Keep workflows enabled until all in-flight workflows finish: disabling workers leaves pending work in MongoDB but stops automatic dispatch and completion processing.

MongoDB must be a replica set with transactions and majority journaled writes. Configure Redis with persistence (AOF), persistent storage, and `maxmemory-policy noeviction`. MongoDB outbox recovery can recreate jobs lost from Redis. Run at least one API/worker process continuously. Server shutdown drains recovery and campaign workers.

## Lifecycle and credit safety

1. Submission reserves credits using the existing atomic wallet deduction and ledger entry, and creates a `pending_approval` workflow in the same transaction. Approval does not deduct those credits again.
2. Admin approval records `ready` in MongoDB. Scheduling respects the saved send time. A crash between approval and enqueue is recovered from the outbox.
3. A worker claims a renewable-by-retry, two-minute database lease and verifies the submitted credit reservation against the ledger. HTTP dispatch has a 30-second timeout. An expired lease can be reclaimed by another worker after a restart.
4. The worker calls the sender using the same durable idempotency key on every retry. A successful response moves to `waiting_webhook`. This waiting state uses no occupied BullMQ worker.
5. A signed, complete webhook stores provider results in bounded MongoDB chunks and advances to `settling`. Repeated identical callbacks are acknowledged. Conflicting callbacks are rejected for manual review.
6. One MongoDB transaction calculates failed-message refunds, updates the wallet, posts the refund ledger entry, writes the published report, and marks the workflow `completed`. Transaction failure rolls back all of these changes. A stable refund operation ID and unique ledger index provide additional duplicate protection.

Repeated and invalid submitted numbers are classified locally as failed/refundable and are not dispatched twice. The sender receives only the original, valid first occurrence of each number, with its permanent original row number. Every dispatched row must have a terminal result before the report is published. Refunds never exceed the original charge; inconsistent reservations or prior manual adjustments stop automatic settlement for review.

Once dispatch is leased or attempted, campaign editing, cancellation, and manual report publication are blocked until delivery completes, including after an ambiguous network failure. A provider cancellation API is not assumed. Deleting an account or wallet with unfinished workflows is blocked. Recovery also backfills legacy approved campaigns that do not already have a workflow. Review existing approved campaigns before enabling the feature in production. Manual Failed/Completed draft decisions do not move credits; manual refunds remain tied to final report publication.

The workflow offers retry-safe financial effects, not a promise of exactly-once network delivery. The sender **must honor `Idempotency-Key`**, including the ambiguous case where it accepted a request but the response was lost. It must retain deduplication records for the lifetime of a dispatch and return the same job ID on retries. Without that sender guarantee, any at-least-once queue can send duplicate messages. See [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs).

## Configurable sender contract

The app sends `POST CAMPAIGN_PROVIDER_URL` with `Authorization: Bearer <token>`, `Content-Type: application/json`, and `Idempotency-Key: <dispatchKey>`:

```json
{
  "campaignId": "MongoDB campaign ID",
  "dispatchKey": "stable dispatch UUID",
  "callbackUrl": "https://your-app.example.com/api/webhooks/campaigns/completion",
  "title": "Campaign title",
  "message": "Submitted message HTML",
  "recipients": [{ "rowNumber": 1, "phoneNumber": "919876543210" }],
  "media": { "images": [], "video": [], "audio": [], "documents": [] }
}
```

Return a successful HTTP status and JSON `{ "jobId": "your-stable-provider-job-id" }`. HTTPS and non-redirecting endpoints are required. The sender must handle the submitted message format and hosted media URLs; implement a provider adapter if its native API differs.

After all recipients finish, POST JSON to the configured callback URL:

```json
{
  "campaignId": "MongoDB campaign ID",
  "dispatchKey": "the UUID from dispatch",
  "jobId": "your-stable-provider-job-id",
  "results": [{ "rowNumber": 1, "status": "delivered" }]
}
```

Allowed statuses: `delivered`, `read`, `failed`. Include exactly one result for each dispatched row. The server derives phone numbers and refund amounts from its own records; the sender cannot supply credit amounts. Partial callbacks are rejected. Keep callbacks under 10 MB.

Include `X-Campaign-Timestamp` (current Unix seconds) and `X-Campaign-Signature` (hex HMAC-SHA256 using the webhook secret over `timestamp + "." + raw_request_body_bytes`). Timestamps must be within five minutes. Sign the exact bytes sent. Retries after that window must use a fresh timestamp/signature. Successful acceptance, including a duplicate, returns HTTP 202. Retry transport errors and server failures. HTTP 400/409 requires correcting the payload or manual review; 401 indicates an invalid signature or clock.

No completion is invented when the sender stops responding. `waiting_webhook` remains visible for operator investigation; a timeout never causes an automatic refund while delivery may still be happening.

## Audit trail

Authenticated mutations, plus authenticated admin/reseller reads, write an intent before the handler runs and a response outcome before sending the response. Interrupted requests remain identifiable as intents with no outcome. Successful business-model changes to users, wallets, campaigns, and credit transactions additionally write before/after audit records **inside the same MongoDB transaction**. This includes rates, account/credit expiry, status approvals/rejections, credit allocation/reclaim, report publication, and deletion. Request IDs join these records; actor snapshots retain the effective account and original impersonating administrator. Device/session management and other authenticated mutations are covered by their request intent and outcome.

Audit entries include server timestamps, request method/path, the client IP as determined by Express's trusted proxy configuration, user agent, and sanitized input. Passwords, tokens, cookies, and secrets are redacted. Large arrays are represented by counts and SHA-256 digests, preserving proof of report/recipient changes without copying full recipient lists into every audit entry. A system actor distinguishes automatic workflow events from human actions. HTTP outcomes describe the response, not an assertion that every step in a multi-step handler committed; business events provide the transaction-level evidence.

Events are append-only through the application model and have a per-resource sequence, previous hash, and HMAC signature. The application exposes no update/delete audit routes. Runtime database credentials should have **insert/find only on `audit_events`**, plus find/insert/update on `audit_heads`. Provision indexes with a separate deployment principal; startup currently ensures indexes, so either permit `createIndex` to the deployment/runtime principal or pre-provision and adapt startup for your database policy. Do not grant audit update/delete permissions to the application principal. Protect backup and signing keys separately from database administration.

Database superusers can bypass application hooks. Signatures detect edits without the signing key, while heads detect truncation. A superuser who rolls back both events and heads can hide the tail unless a previous signed checkpoint is kept outside that database. Export and retain checkpoints and records in independently managed, retention-locked/WORM storage. This application change alone is not regulatory certification or an infrastructure-enforced WORM store.

Super-admin-only read APIs (blocked in preview mode):

- `GET /api/enterprise/audit?stream=campaign:<id>&limit=50&before=<cursor>`
- `GET /api/enterprise/audit?actorId=<id>` or `?requestId=<request-id>`
- `GET /api/enterprise/audit/verify?stream=campaign:<id>`
- `GET /api/enterprise/workflows?stage=waiting_webhook`

Streams include `user:<id>`, `wallet:<wallet-id>`, `transaction:<id>`, `campaign:<id>`, and `request:<request-id>`. Run verification with `npm run audit:verify -- <stream>` or omit the stream to check all current heads. Export one verified stream with `node scripts/export-audit-trail.js '<stream>' > archive.jsonl`; require exit code 0 and a final signed checkpoint before accepting an archive. The export script only writes JSONL to stdout and never prints signing keys. Archive external checkpoints before key rotation. Keep old verification keys in the secret-manager-provided `AUDIT_VERIFY_KEYS_JSON` map, keyed by the old `AUDIT_KEY_ID`, and use a new ID for the new signing key.

## Validation

`npm run test:enterprise` starts a disposable MongoDB replica set and never connects to the configured application database. It tests audit immutability and tampering, transaction rollback, actor metadata, approval gating, lost-response dispatch retries, expired leases, result validation, duplicate/concurrent webhooks, refund/publication rollback and replay, early callbacks, and signature verification.
