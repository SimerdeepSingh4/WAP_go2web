# Dashboard design implementation

Source of truth: `design.md`. This update edits the existing React application locally.

## Audit and decisions

- Super Admin: overview, campaigns/reports and campaign creation, contacts, resellers, users, credits/transactions, settings. Existing API supports central account management, credit allocation/reclaim, rates, campaign status and report updates.
- Reseller: overview, assigned users, their campaigns/reports, credit allocation, transactions, account settings. The server scopes records to the signed-in reseller. Existing campaign creation remains supported by the server for all roles.
- User: overview, own campaigns and creation, credits/transactions, account settings. Add the missing campaign list; the existing creation screen incorrectly returns users to the admin panel.
- Use one responsive shell and shared headings, controls, tables, status badges and feedback. Warm off-white, white surfaces, deep green actions, brown credit accents; 14px operational text, 40–44px controls, visible focus, contained table scrolling, restrained borders, no charts or decorative motion.
- Keep real server data and server authorization. Do not show admin status/report mutations in reseller/user campaign details. Existing reseller details use a disabled admin query and must be corrected.
- No profile-update route exists: present account information and supported password/session controls instead of a broken edit form.
- Credit requests record a request; they do not add balance. Standalone manual deductions are not a normal user workflow; campaign submission already charges credits. Remove that user control and label requests accurately.
- Admin operating preferences are browser-local only; retain the existing disclosure. Account status/device policy APIs are not invented.
- Retain existing backend processing semantics; use “submit campaign” language, with reported delivery results only.

## Staged checklist

- [x] 1. Audit routes, reusable components, hooks and server permissions.
- [x] 2. Record role map, design rules and integration limitations here.
- [x] 3. Shared shell, light theme, responsive controls, tables and dialogs.
- [x] 4. Super Admin overview and management workflow cleanup.
- [x] 5. Reseller overview, scoped campaign details and account settings.
- [x] 6. User overview/campaign list, credit requests, settings, campaign review.
- [ ] 7. Build, existing tests, responsive/accessibility and permission checks.

## Verification

Pending. Record actual checks and remaining limitations here; no simulated production data.

Stage 3: all role layouts use `features/dashboard/components/DashboardLayout.jsx` and `dashboard.css`. Shared light tokens cover dialogs. Navigation reflects each role; manager visits to another role route return to their own panel (account preview still uses the target role).

Stage 4: admin overview prioritizes review queue and resellers, without charts. Existing account, credits, contacts and campaign operations inherit shared controls. Removed account IDs and pulsing status marks; corrected published-report counts. Build attempted; Windows sandbox blocked Vite dependency resolution (EPERM), retry requested.

Stage 5: reseller overview now shows real balance, rate, campaigns and assigned users. Campaign detail uses a scoped read-only request; no admin actions. Shared account settings support real password/session endpoints with confirmation and error recovery. Intermediate production build passed outside sandbox.

Stage 6: added user campaign list and read-only details; shared settings, accurate credit-request review and transaction history; campaign submission now reviews real rate, recipients, charge and balance, returns to the correct role, prevents double submission and refreshes role data. Recipient validation now matches the server (10?15 digits). Server default for nonpositive rates remains 12; Super Admin is exempt. Nine unit tests passed.

## Pause checkpoint ? 3 November 2026

Paused at the user?s request during Stage 7. Stages 1?6 are implemented. Latest production build and all 9 tests passed; browser and live-backend verification remain incomplete. Resume instructions and the specific outstanding audits are appended to `frontend/design.md`. No commit or deployment performed.
