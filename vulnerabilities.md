# Production vulnerability checklist

Last reviewed: **6 November 2026**.

This tracks the findings from the production security review against the current
workspace code. Checked items have an implemented fix; they do not establish that
the fix has been deployed. Unchecked items require work or deployment verification.
This is a tracking document, not a complete penetration-test certification.

**Status: 4 resolved findings, 1 partially mitigated finding, 15 remaining code
findings.** Deployment checks are listed separately.

## Resolved

- [x] **High — Uploaded documents could execute on the application origin.**
  Campaign uploads now require allowed extensions matching detected file contents.
  Images are re-encoded, filenames are server-generated, and local documents and
  legacy uploads are served as downloads with `nosniff` and a restrictive sandbox.
  Generated media retains inline previews. This closes the application-origin
  document execution issue; private-file authorization remains a separate finding.
  Evidence: [content validation](backend/src/helpers/campaign-media.js),
  [safe file serving](backend/src/middlewares/uploads-static.middleware.js),
  [campaign storage](backend/src/controllers/campaign.controller.js).
  Verification: the 9 isolated upload-security tests passed during implementation.

- [x] **High — Spreadsheet parser had known prototype-pollution and ReDoS vulnerabilities.**
  Replaced npm-registry `xlsx` 0.18.5 with SheetJS CE 0.20.3 from the official CDN.
  The manifest pins the distribution URL and the lockfile records its integrity
  hash. This addresses CVE-2023-30533 and CVE-2024-22363; do not replace it with
  npm-registry `xlsx@latest`.
  Evidence: [manifest](backend/package.json), [lockfile](backend/package-lock.json).
  Verification: 5 isolated spreadsheet version/import/export/report tests passed.
  References: [official installation instructions](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
  [prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
  [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9).

- [x] **High — Password changes double-hashed passwords and retained other sessions.**
  The controller now assigns the new password directly and lets the model hash it
  once. Other sessions are deleted and their sockets receive server-side eviction.
  The current session is retained when identified.
  Evidence: [password change](backend/src/controllers/auth.controller.js),
  [password hashing hook](backend/src/models/user.model.js).
  Verification: current code inspected; a dedicated password-change regression
  test was not verified as part of creating this checklist.

- [x] **High — Live connections survived revocation and expiry.**
  Socket authentication now checks active sessions and account status. Incoming
  actions and outgoing application notifications revalidate access. Server timers
  enforce JWT/session/account expiry; logout, blocking, deletion and role changes
  disconnect transports. Idle sockets are checked every 30 seconds for out-of-band
  database changes, with fresh checks before notification delivery. Temporary
  preview/impersonation exits close their sockets without logging out the restored
  manager account.
  Evidence: [socket service](backend/src/services/socket.service.js),
  [authentication actions](backend/src/controllers/auth.controller.js),
  [account actions](backend/src/controllers/user.controller.js).
  Verification: all 18 isolated Socket.IO security tests passed.

## Partially mitigated

- [ ] **High — Campaign uploads can exhaust server memory.**
  **Implemented:** 16 MB per-file parser limit, 15 files, 4 MB per text field,
  50 fields, and 5 concurrent campaign uploads per process. A declared
  `Content-Length` above 35 MB is rejected.
  **Remaining:** enforce the total byte budget while reading the request. The
  current total-size check trusts the presence of `Content-Length`; chunked
  requests can omit it and exceed the intended 35 MB aggregate limit while staying
  within individual parser limits. Concurrency protection is process-local.
  Add regression coverage for missing/chunked content length, aggregate file/field
  size, aborted requests and concurrency-slot cleanup. Verify matching ingress
  limits in production.
  Evidence: [upload middleware](backend/src/middlewares/upload.middleware.js).

## Remaining code findings

- [ ] **High — Weak passwords and insufficient authentication abuse controls.**
  Account creation does not enforce a consistent strong password policy. Add
  account/IP login throttling and MFA for privileged accounts. Confirm any upstream
  protection rather than assuming it exists.
  Evidence: [user model](backend/src/models/user.model.js),
  [authentication routes](backend/src/routes/auth.routes.js).

- [ ] **Medium — Preview credentials disclose the original manager token.**
  Remove the parent bearer token from preview JWT payloads and `/auth/me` responses.
  Keep restoration credentials server-side and return only nonsecret identity.
  Evidence: [preview creation](backend/src/controllers/user.controller.js),
  [current-account response](backend/src/controllers/auth.controller.js).

- [ ] **Medium — Private templates can be fetched across tenants by ID.**
  Scope template reads to the owner, authorized administrator, or public templates.
  Evidence: [getTemplateById](backend/src/controllers/template.controller.js).

- [ ] **Medium — Contact creation/import accepts foreign group IDs.**
  Authorize group ownership before insertion and count updates. Prevent cross-tenant
  group contamination and disclosure of another account's group name.
  Evidence: [contact controller](backend/src/controllers/contact.controller.js).

- [ ] **Medium — Preview mode permits some account-management writes.**
  Enforce preview restrictions centrally across account creation/deletion,
  registration, password changes and session-management actions. Define any
  intentional exceptions explicitly.
  Evidence: [user routes](backend/src/routes/user.routes.js),
  [authentication routes](backend/src/routes/auth.routes.js).

- [ ] **Medium — Manual wallet locks are not consistently enforced.**
  Allocation checks expiry but can overlook the source wallet's manual lock and
  clears the receiving wallet's lock. Separate unlocking authorization from
  ordinary allocation and enforce it in backend operations.
  Evidence: [credit controller](backend/src/controllers/credit.controller.js).

- [ ] **Medium — Private campaign attachments remain publicly retrievable.**
  Download/sandbox headers prevent browser execution but do not authorize access.
  Add authenticated downloads scoped to the campaign or short-lived signed URLs.
  Evidence: [uploads mount](backend/src/app.js),
  [static upload serving](backend/src/middlewares/uploads-static.middleware.js).

- [ ] **Medium — Rejected campaigns can leave uploaded files and incur storage costs.**
  Validate campaign fields and eligibility before persisting media. Clean up files
  when creation fails and apply account/storage quotas.
  Evidence: [createCampaign](backend/src/controllers/campaign.controller.js).

- [ ] **Medium — Campaign query caches can expose data after account switching.**
  Include account identity in campaign detail/report query keys and clear sensitive
  queries on logout, preview transitions and account switches.
  Evidence: [detail query](frontend/src/features/campaigns/pages/CampaignDetailPage.jsx),
  [report query](frontend/src/features/campaigns/pages/CampaignReportPage.jsx),
  [authentication cache cleanup](frontend/src/features/auth/auth.context.jsx).

- [ ] **Medium — Contact CSV exports permit formula injection.**
  Neutralize formula-capable prefixes in untrusted text at export boundaries.
  Upgrading SheetJS does not resolve this application-level issue.
  Evidence: [exportContactsToCSV](backend/src/controllers/contact.controller.js).

- [ ] **Medium, deployment-dependent impact — Credentialed CORS accepts every origin.**
  Both HTTP and Socket.IO CORS callbacks approve unrecognized origins. Use an
  explicit production allowlist and review CSRF protection. Existing
  `SameSite=Strict` cookies limit unrelated cross-site attacks; exploitation must
  account for browser cookie policy and same-site sibling origins.
  Evidence: [HTTP CORS](backend/src/app.js),
  [socket CORS](backend/src/services/socket.service.js).

- [ ] **Medium, defense gap — Disabled CSP and JavaScript-readable bearer tokens amplify XSS.**
  Introduce an application CSP compatible with required resources and review
  sessionStorage bearer-token usage. The restrictive policy on downloaded uploads
  does not establish a CSP for the application itself.
  Evidence: [Helmet configuration](backend/src/app.js),
  [session token storage](frontend/src/api/sessionToken.js).

- [ ] **Medium, defense gap — Credit-transfer password confirmation is optional in the API.**
  If confirmation is intended to protect transfers, require it server-side or use
  an explicit recent-authentication challenge. Omitting `password` currently skips
  its verification.
  Evidence: [allocateCredits](backend/src/controllers/credit.controller.js).

- [ ] **Low — Three-device session limit can be exceeded by parallel logins.**
  Serialize session creation per account or reserve device slots atomically.
  Exploitation requires valid credentials; this is not an authentication bypass.
  Evidence: [createDeviceSession](backend/src/controllers/auth.controller.js).

- [ ] **Medium/Low, deployment-dependent — Other resource-abuse and diagnostic exposure risks.**
  Review the 50 MB JSON limit applied before authentication, unbounded collection
  reads/import workloads, and unauthenticated detailed health checks that perform
  database/Redis operations and expose process metrics. Apply endpoint-specific
  budgets, pagination, throttling and restricted detailed diagnostics.
  Evidence: [request parsing](backend/src/app.js),
  [contacts](backend/src/controllers/contact.controller.js),
  [groups](backend/src/controllers/group.controller.js),
  [health diagnostics](backend/src/controllers/health.controller.js).

## Production verification still required

- [ ] Verify HTTPS termination, production `NODE_ENV`, and secure cookie behavior.
- [ ] Restrict trusted reverse proxies and reject spoofed forwarding headers.
- [ ] Restrict MongoDB and Redis network access to required services.
- [ ] Verify Redis transport encryption where traffic crosses untrusted networks.
- [ ] Apply least-privilege database roles, including audit collection restrictions.
- [ ] Verify secret storage, rotation and separation of audit signing keys.
- [ ] Run dependency/advisory scanning in CI and retain reproducible lockfiles.
- [ ] Verify backups, restore procedures and independently retained audit exports.

## Focused checks

Run from `backend/` against the intended Node.js 22+ development environment:

```sh
npm run test:uploads
npm run test:spreadsheets
npm run test:sockets
```

These suites use isolated test fixtures and do not establish production deployment
status. The broader credit suite previously failed because of missing test-double
exports; its successful completion is not claimed here.
