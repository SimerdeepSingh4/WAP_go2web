# Credit system implementation plan

Draft for approval. One Campaign Credit covers one chargeable recipient. Number Filtering Credits fund pre-campaign checks. Each category has its own balance, purchase rate, and history.

- [Current system](#current-system)
- [Decisions and agreed workflow](#decisions-and-agreed-workflow)
- [Implementation phases](#implementation-phases)
- [Credit lifecycle](#credit-lifecycle)
- [Migration and verification](#migration-and-verification)
- [Worked examples](#worked-examples)

## Current system

### Wallets, allocations and requests

MongoDB has one Wallet per User or Reseller. It stores balance in legacy credits, a companion balanceMinor in hundredths of a credit, and a lock. Super Admin can issue unlimited stock to resellers or users. Resellers transfer stock from their own wallet to assigned users. Reclaim reverses stock toward the reseller or the platform, depending on the actor.

POST /api/credits/request creates a REQUEST and support/notification records, with no wallet movement. User routing currently considers the creator and reseller assignment. Later allocation is a separate operation. The reviewed repo has no payment order, checkout integration, verified settlement or monetary purchase ledger. The dashboard’s “purchased” count uses allocations received.

User.ratePerMsg defaults to 12 legacy credits per recipient and appears in account creation/edit, rate settings, balances, dashboards, credit history and campaign/report estimates. It describes usage, with no INR price attached. GET /credits/balance calculates message capacity from balance ÷ rate. The generic /credits/deduct path supports a count multiplied by rate or an explicit amount.

Code references · [Wallet model](backend/src/models/wallet.model.js) · [Credit controller](backend/src/controllers/credit.controller.js) · [Rates and account lifecycle](backend/src/controllers/user.controller.js) · [Dashboard aggregates](backend/src/controllers/dashboard.controller.js)

### Campaign creation, sending and settlement

Campaign creation rejects the full request if any supplied line fails the digits-only 10–12 digit validation. It preserves original occurrences, deduplicates exact valid strings for the recipient list and debits submitted row count × ratePerMsg when the campaign is created, including duplicate occurrences. The client uses the submitted row count too.

Campaign operation is manual. The BullMQ campaign worker keeps compatibility with old jobs and performs no delivery. Super Admin records status and publishes reports. The app has spreadsheet draft/publish, manual metrics and legacy report/recipient update paths that can affect credits. Pending or scheduled cancellation can refund the outstanding charge. Failure publication refunds the remaining legacy charge. Settled campaign deletion preserves the ledger. There is no automated sent/delivered source in the worker.

The admin campaign detail “Filter numbers” action classifies existing report rows and previews changes using known categories. Report search, recipient tracking and input syntax validation also exist. A customer-facing filtering request and a place for admins to paste and publish external results are new.

Code references · [Campaign controller](backend/src/controllers/campaign.controller.js) · [Campaign worker](backend/src/workers/campaign.worker.js) · [Shared phone validation](shared/campaignRecipients.js) · [Campaign estimate](frontend/src/features/campaigns/lib/submission.js) · [Admin report filter](frontend/src/features/campaigns/lib/filterRecipients.js)

### Ledger, safeguards and downstream consumers

Transactions record ALLOCATE, DEDUCT, REFUND, RECLAIM and REQUEST, with account and campaign references, rate snapshots and balanced postings for newer entries. The posting service, model/session guards, MongoDB transactions, idempotency receipts, per-wallet request queues, audit and reconciliation already protect wallet movements. Some historical rows predate balanced postings. The existing unique refund index and old rate snapshots are part of legacy replay.

Credit changes fan out to support tools, account locks and reassignment, reconciliation cases and repairs, audit exports and CLI, notification hooks, WALLET_UPDATED events, search and transaction detail. Frontend callers span Admin Accounts/Credits/Overview, Reseller Users/Credits/Overview, User Credits/Overview/Activity, shared dashboards and campaign creation/detail/report. Every reader that assumes a single amount or one legacy rate needs review.

Code references · [Credit posting](backend/src/services/credit-posting.service.js) · [Transactions and indexes](backend/src/models/transaction.model.js) · [Reconciliation evidence](backend/src/services/credit-evidence.service.js) · [Support tools](backend/src/controllers/support-tools.controller.js) · [Credit request client](frontend/src/api/creditRequest.js)

## Decisions and agreed workflow

### Campaign charging and refunds

Deduct one Campaign Credit for every submitted recipient row when the campaign is accepted. Preserve the current validation and duplicate handling. Malformed input blocks submission before any charge. Duplicate occurrences count toward the initial debit and remain visible in the report.

Super Admin marks rejected rows for refund through the existing reporting workflow. Each rejected row refunds one Campaign Credit. Drafts have zero wallet effect. Preserve the current rules for pre-launch cancellation and full-failure refunds. Billing depends on the submitted rows and approved refunds. Delivery and read counts remain report metrics.

**Your earlier answer**

> it should work like current way charge credit in every receipent and refund those which is rejected by admin

### Number filtering and result publication

Deduct one Number Filtering Credit for every submitted row when a filtering request is accepted. A request that fails validation or fails to save has zero wallet effect. An accepted request keeps its original charge through admin review, result publication and retries.

The admin team filters the data outside the website and pastes the results back into the request. Reuse the existing recipient UI and logic for pasted rows, validation, duplicate handling, result preview, and draft and publish actions where they fit. Publish the list to the requester and offer a copy or download. Show any WhatsApp membership status only when the admin result supplies it.

**Your earlier answer**

> it should also work like current campaign way, charge credit in every receipent but no refund in it.

**Your earlier answer**

> no need to change in this current system is good

### Account ownership, routing and stock

Account ownership is fixed at creation. User accounts stay with the reseller who created them. Recharge requests for reseller-created users go to that reseller. Reseller recharge requests and requests for Super Admin-created users go to Super Admin. Reuse the current creator-based routing and validate the ownership relationship on approval. The current admin account editor and API can update the reseller assignment, so review those entry points and enforce the fixed ownership rule for existing user accounts.

Super Admin sets purchase rates for resellers by category. Resellers set purchase rates for the users they create by category. For accounts that buy directly from Super Admin, Super Admin sets the rate. **Stock proposal.** Super Admin issues credits to resellers and direct buyers. Resellers fulfill each user purchase from their available stock in the matching category. Keep manual grants distinct from paid recharges.

Code references ? [Credit request routing](backend/src/controllers/credit.controller.js) ? [Account editing](backend/src/controllers/user.controller.js)

### Recharge, payment proof and approval

Provide a Recharge Credits page for Users and Resellers. The buyer picks a category and enters a whole-number quantity. The server uses the buyer's configured rate or that seller's category default to calculate and save the INR total. Show the payment instructions and let the buyer attach a screenshot. The original creator reviews the request and uses one approval action to add the requested credits exactly once.

**Proposal.** Collect a payment reference alongside the screenshot so the seller can match it to the received payment. Snapshot the rate, currency and total when showing payment instructions. Store exact per-credit rates and round the order total once to integer paisa. For reseller sales, hold the quoted quantity of stock through payment review and release it on expiry or rejection. Agree the default rates and the payment instructions each seller displays before paid recharges go live.

**Your earlier answer**

> a simple method we can create by adding a recharge credits page in both reseller and user super admin can set the price of credits for reseller and same reseller can do for their user so in recharge page reseller have to type how much credit they want to purchase and the final price will be calculated according to the set price or defualt price and then page will ask reseller to do a payment and attach a screenshot of it and after submitting a credit purchase request the request will go to super admin/reseller who created that user and after verfying screenshot they will add credit in the account.

### Existing test data

Use fresh balances and rates in the designated test environment. Skip legacy balance conversion there. Inventory the legacy test records that interfere with the change, take a snapshot, then clean only those dependencies in the confirmed test database. Preserve the test accounts. If discovery identifies real payment or production data, pause the cleanup and define a separate preservation plan.

**Your earlier answer**

> it is a testing phase so current data doesn't matter much make these changes and delete data which is creating issue or might create an issue

## Implementation phases

### Phase 0 ? Confirm configuration and test data

Confirm the designated test database, inventory affected records, and prepare a dry run for cleanup. Set the default campaign and filtering rates for each seller level. Confirm payment instructions and use a representative pasted filtering result from the admin team to verify the result format.

### Phase 1 ? Add category accounting

Use the fixed categories CAMPAIGN and NUMBER_FILTERING. Keep one Wallet document per account, with separate integer available quantities and any reseller stock held for recharge by category. Keep the account-wide wallet lock. Provision both categories at account creation and exercise lock behavior on debit, allocation, recharge approval, and refunds.

Add versioned purchase rates by seller, buyer or default, and category. Store the per-credit INR rate at exact precision, the quoted integer quantity and total paisa, and the purchasing and selling accounts. Add a Purchase record with category, immutable rate snapshot, payment screenshot and reference, review status, reviewer, and fulfillment or adjustment references. Keep purchase requests and zero-cost grants distinguishable in history.

Extend Transaction with category, signed integer quantity via balanced postings, actor, operation key, reason, and purchase, campaign, filtering request, or original-entry references. Keep issuance, transfer, reclaim, debit, and refund distinct. Map stock holds and releases to the appropriate balance bucket when used. Index account and category history and require unique fulfillment and charge/refund operation references. Extend the existing posting service, reconciliation, audit and support tools to respect category boundaries.

Add a charge reference with the submitted row count to Campaign. Use its permanent row IDs for rejected rows and report revisions. Add a NumberFilterRequest with owner, original submitted rows or row storage reference, debit reference, request status, admin draft, published results, and reviewer metadata. Scope reads and exports to authorized accounts and keep phone numbers and payment images out of ledger notes and routine logs.

Code references ? [Wallet model](backend/src/models/wallet.model.js) ? [Transaction model](backend/src/models/transaction.model.js) ? [Posting service](backend/src/services/credit-posting.service.js) ? [Reconciliation](backend/src/services/credit-evidence.service.js) ? [Campaign spreadsheet storage](backend/src/models/campaignSpreadsheet.model.js)

### Phase 2 ? Pricing, recharge and allocation

Extend credit balance, history, rate, request, allocation and reclaim routes to carry the category. Add APIs to calculate and save a purchase quote, submit proof, list and review requests, and approve or reject. Validate category, positive safe integer quantity, stock, buyer and seller identity, quote total and currency, payment proof permissions, and reviewer scope. Handle a missing configured rate with a seller-specific default by category. Require a configured valid rate before showing payment instructions.

Tie the request to its original seller and enforce the same ownership when fulfilling. Approve in a MongoDB transaction that updates purchase status, issues or transfers the exact credit quantity, writes balanced postings, and records the receipt. Reject duplicate approval or reused payment references. Keep proof uploads private to the buyer and authorized reviewers. Preserve preview-mode restrictions and scope generic usage deduction to the workflows authorized to post usage.

Update Super Admin, Reseller and User dashboards, account forms, recharge screens, allocation forms, transaction histories, support, search and reconciliation views. Show category-specific purchase rates, payment amounts, stock, purchase status, and credited quantity. Use existing frontend feature APIs and TanStack Query. Add category and operation references to committed wallet updates and notifications.

Code references ? [Credit routes](backend/src/routes/credit.routes.js) ? [Super Admin accounts](frontend/src/features/admin/pages/Accounts.jsx) ? [Reseller users](frontend/src/features/reseller/pages/Users.jsx) ? [User credits](frontend/src/features/user/pages/Credits.jsx) ? [Support routes](backend/src/routes/support.routes.js)

### Phase 3 ? Campaign debit and report refunds

Keep the existing shared campaign input validation, scheduling, report UI and Super Admin exemption. Replace the rate-multiplied usage calculation with the submitted row count. Show submitted rows, duplicates, required Campaign Credits, and available credits on review. Check the balance on the server and atomically create the campaign, debit the category, and save its receipt.

Refund one credit per rejected row. Apply refunds on the existing authorized report or cancellation paths. Base adjustments on permanent recipient identities and compare with the previous settlement to prevent refunding a row twice. Cap total refunds at the original debit. Keep drafts, exports, lookup and delivery metrics read-only for credit purposes. Show charged, refunded and net Campaign Credits in report and history views.

Code references ? [Campaign routes](backend/src/routes/campaign.routes.js) ? [Campaign controller](backend/src/controllers/campaign.controller.js) ? [Shared input validation](shared/campaignRecipients.js) ? [Create campaign](frontend/src/features/campaigns/pages/CreateCampaignPage.jsx) ? [Recipient report editor](frontend/src/features/campaigns/components/detail/CampaignRecipientsSection.jsx)

### Phase 4 ? Number filtering requests and pasted results

Add a Number Filtering entry point using the existing navigation and recipient input components. Show the submitted row count, Number Filtering Credits required and balance. On confirmation, validate and debit the row count in the same transaction that saves the request and receipt. Show the requester the review status and published results.

Give Super Admin a request list and a result editor built from the existing recipient UI. Reuse paste, preview, duplicate handling and draft/publish interactions. Store the original submission separately from the pasted results. Validate and preview the result rows against the original submission and flag unmatched entries before publishing. Keep result publication and corrections independent of billing. Expose the published list for copy or download. The admin team performs all number checking externally.

Code references ? [Recipient report editor](frontend/src/features/campaigns/components/detail/CampaignRecipientsSection.jsx) ? [Filter logic](frontend/src/features/campaigns/lib/filterRecipients.js)

## Credit lifecycle

### Debits, refunds and retries

Debit campaign and filtering requests on acceptance in their own category. If acceptance fails, rolling back the transaction leaves the balance and request history consistent. For a campaign, pre-launch cancellation refunds the unreversed debit and rescheduling preserves it. For partial completion, refund only rows the admin classifies for refund. Use the current full-failure publication rule for a failed campaign. Track corrections as linked, auditable ledger deltas and cap cumulative refunds at the charge.

For a filtering request, publishing fewer results, editing them, closing the request, or publishing the same draft again has zero wallet effect. Keep the original accepted charge and allow admin to resume work on the same request. A requester who explicitly submits a new request pays for its rows.

### Concurrency, reconciliation and payment review

Reuse Idempotency-Key, request fingerprints and durable receipts. Include account, category and operation identity in the scope. Guard balance changes with MongoDB transactions, conditional available balance updates and deterministic lock ordering. Apply request state or revision checks to simultaneous approvals, campaign refunds, and filtering result publication. Replay an uncertain result with the same receipt. Send wallet notifications after commit.

Reconcile each category separately. Verify stock holds against open recharge orders, cancellation and report refunds against campaign debits, and filtering charges against accepted requests. Escalate mismatched or late payment proofs for manual review while keeping the original purchase and evidence linked.

## Migration and verification

### Test cleanup and rollout

Deploy the category schemas, posting changes and compatibility reads in test first. Snapshot the designated test database. Dry-run a targeted cleanup of incompatible legacy balances, transactions and linked test campaigns or requests, then confirm the target and affected records before any destructive command. Review reconciliation references and pending jobs before cleaning their source records. Initialize both balances at zero and seed approved rates and grants. Retain any records outside the confirmed test cleanup scope.

Roll out category-aware accounting and recharge first, then campaign charging and reporting, and then filtering requests and the admin result editor. Run a manual round trip with Super Admin, a Reseller and a User for each category. Check reconciliation, requests awaiting review, payment evidence and refunds before opening the workflow to additional accounts.

### Verification and acceptance gates

Verify category and price separation, custom and default rates, payment totals and proof visibility, creator routing, fixed reseller ownership, and stock checks. Test direct Super Admin users and reseller-created users separately. Test proof and approval retries, concurrent orders, insufficient stock and rejected payment proof. A purchase must fulfill once and record the exact quoted quantity and paid amount.

Verify a campaign with 100 submitted valid rows charges 100 credits, even when some rows are duplicates. If the admin refunds 10 rows, verify a net charge of 90. Cover malformed input, full failure, cancellation, partial report publication, revisions, duplicated requests and mixed endpoints. Exercise concurrent writes on MongoDB with idempotent receipts and no negative balances.

Verify an accepted filtering request for 100 rows charges 100 filtering credits and leaves Campaign Credits untouched. Reuse the existing paste, preview and draft UI for an admin who publishes fewer results. Confirm the owner sees the published list, repeat publication leaves the balance at the original charge, and a failed request creation commits no debit. Verify category-specific histories and reconciliation for every movement.

## Worked examples

### Campaign Credits ? ?1,000 for 100,000

100,000 credits at ?0.01 each cost ?1,000, or 1 paisa per recipient row charged. A campaign with 100 accepted rows immediately uses 100 Campaign Credits. If Super Admin refunds 10 rejected rows after review, the net charge is 90 and the available balance is 99,910.

### Number Filtering Credits ? ?1,000 for 50,000

50,000 credits at ?0.02 each cost ?1,000, or 2 paise per submitted row. A request for 1,000 accepted rows spends 1,000 Number Filtering Credits. If the admin pastes 820 results, the balance remains 49,000. A separate campaign submitted with those 820 rows uses 820 Campaign Credits.

### Wholesale and user purchase

At illustrative rates set by Super Admin, a reseller pays ?800 for 100,000 Campaign Credits at ?0.008 each and ?750 for 50,000 Number Filtering Credits at ?0.015 each. That reseller can sell the categories at ?0.01 and ?0.02 per credit respectively. When the reseller approves a user's paid recharge, the purchased quantity transfers from the reseller's matching balance. Each purchase retains its own price separately from the number of credits.
