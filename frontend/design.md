Design and implement a premium, minimal, light dashboard with three role-based panels: **Super Admin, Reseller, and User**.

Follow modern 2026 dashboard UI/UX principles through clear hierarchy, readable typography, balanced spacing, accessible interactions, responsive layouts, and efficient workflows. Avoid blindly copying design trends.

**Do not include any charts, graphs, sparklines, decorative progress rings, or data visualizations.** Use meaningful summaries, tables, lists, and clear status information.

### 1. Understand the product before designing

The platform works as follows:

- Super Admin manages resellers, users, credits, rates, limits, account access, and campaign approvals.
- Super Admin allocates credits to resellers.
- Resellers manage their assigned users and allocate credits to them.
- Users create and submit campaigns using their available credits.
- Resellers can view campaigns belonging to their users.
- Super Admin can view all campaigns and is the only role allowed to approve, change operational status, or initiate processing.
- Actual message delivery happens through a separate system. Do not imply that this dashboard performs delivery unless an existing integration supports it.
- Each role must only access its permitted records and actions. Super Admin must have central management views for all three roles.

Inspect the existing project, routes, components, permissions, and available data first. Preserve working functionality and follow existing business rules. Flag contradictions instead of inventing rules.

Do not add unrelated features merely to make the dashboard appear larger.

### 2. Define premium through usability

The experience should feel calm, polished, professional, and comfortable for daily use.

- Use a cohesive light palette with restrained accents and strong readability.
- Prefer warm neutral surfaces, with deep green and subtle brown accents where they suit the existing brand.
- Give colors consistent meanings across all panels.
- Use a consistent type scale, spacing system, border treatment, corner radius, and control sizing.
- Keep practical information density: avoid cramped screens and oversized empty sections.
- Use cards only when they create a useful grouping.
- Give each page a clear purpose and an obvious primary action when appropriate.
- Keep common workflows short and understandable.
- Make all three panels equally polished while adjusting navigation and information to each role.
- Avoid replacing every useful table with large cards.

Premium should come from the quality of the experience, not from decoration.

### 3. Use plain, restrained interface language

Write short, natural labels that ordinary business users understand.

- Use “Users,” “Credits,” “Campaigns,” “Transactions,” and “Settings” where those terms are accurate.
- Use specific action labels such as “Add user,” “Allocate credits,” “View campaign,” and “Save changes.”
- Use sentence case consistently.
- Keep terminology consistent across all panels.
- Add helper text only when it explains a real choice, consequence, requirement, or unfamiliar field.
- Show information at the point where users need it rather than explaining everything upfront.

Do not use:

- Fake text, fabricated statistics, invented testimonials, or unsupported claims.
- Excessive subtitles, repeated explanations, or labels that explain obvious controls.
- Funky, exaggerated, overly cheerful, or motivational language.
- Generic slogans such as “Unlock your potential,” “Your command center,” or “Your success starts here.”
- Buzzwords such as “revolutionary,” “next-generation,” “seamless,” or “intelligent” without a specific reason.
- “AI-powered” labels, sparkles, or AI badges unless a real, relevant feature requires them.
- Technical implementation terms such as JWT, Redis, BullMQ, API payload, database record, or webhook in ordinary user workflows.
- Random system IDs, UUIDs, database keys, or internal identifiers in normal lists and cards.
- Repeated references to the platform’s purpose in every title, subtitle, empty state, or button.

Use recognizable names and relevant details to identify records. If a support or transaction reference is genuinely necessary, show a readable reference in an appropriate detail view with a copy action.

Do not hide information that users need to understand a failure, permission restriction, or transaction.

### 4. Exclude these common AI design habits

Audit the implementation against all of the following.

**Visual clutter**

- Excessive gradients, purple-blue gradient defaults, glowing borders, glass effects, floating blobs, and random shapes.
- Arbitrary accent colors, heavy shadows, double borders, and inconsistent styling.
- Cards inside cards, identical card grids for every section, and oversized cards with little content.
- Huge routine headings, tiny operational text, excessive uppercase labels, and unnecessary font weights.
- Excessive padding, large empty gaps, and decorative sections pushing useful content below the fold.
- Icons beside every label, meaningless sparkles, emojis, arbitrary illustrations, inconsistent icons, and unlabeled icon buttons.
- Forced symmetry that weakens information hierarchy.

**Misleading or unnecessary information**

- Fake metrics, vanity metrics, invented business health scores, and unexplained efficiency scores.
- Unsupported percentage changes, missing comparison periods, and unjustified decimal precision.
- Automatically treating every increase as positive.
- Random progress bars without a defined target.
- Duplicate balances and counts repeated throughout the page.
- Generic activity feeds with no useful event details.
- Fake “live” indicators, pulsing status dots, and real-time claims without actual updates.
- Placeholder users, transactions, or campaign results presented as production data.
- Decorative or misleading visualizations of any kind.

**Navigation and interaction clutter**

- Too many sidebar groups, empty destinations, unrelated shortcuts, and unnecessary breadcrumbs.
- Several equally prominent primary actions.
- Duplicate buttons leading to the same destination.
- Important routine actions hidden unnecessarily in three-dot menus.
- Overlapping tabs, nonfunctional search, decorative filters, and fabricated notification counts.
- Unnecessary onboarding tours.
- Showing restricted actions as available or relying only on frontend hiding for permissions.

**Weak forms and tables**

- Unclear status badges or excessive badge colors.
- Missing sorting, filtering, pagination, or bulk actions where the workflow needs them.
- Truncated names that cannot be inspected.
- Unnecessary multi-step forms and confusing custom controls.
- Missing validation and vague errors.
- Success messages shown before the server confirms the action.
- Destructive actions that look like routine actions.
- Missing loading, empty, error, access-denied, or partial-success states.
- No clear outcome after important actions.

**Unnecessary motion**

- Entrance animations on every card, staggered content delays, and animated counting.
- Continuously moving backgrounds or status decorations.
- Confetti for routine actions.
- Hover effects suggesting noninteractive elements are clickable.
- Skeletons unrelated to the final layout.
- Layout shifts and motion that ignores reduced-motion preferences.

### 5. Design each panel around actual work

**Super Admin**

Prioritize pending campaign decisions, account management, credit allocation, rates, limits, and meaningful recent activity. Provide searchable management views for all resellers, users, and campaigns, including clear ownership relationships.

**Reseller**

Prioritize available credits, assigned users, credit allocation, permitted rate management, and visibility into those users’ campaigns. Do not expose Super Admin-only actions.

**User**

Prioritize available credits, campaign creation, submitted campaigns, clear statuses, and relevant transaction history. Make the next step understandable without filling the screen with instructions.

Use existing data and permissions to determine exact fields. Do not invent financial calculations, campaign outcomes, or operational capabilities.

### 6. Make workflows clear and reliable

- Use steps only when a task genuinely benefits from them.
- Campaign creation may use details, recipients, review, and submission if supported by the existing workflow.
- Keep simple edits in a single form.
- Preserve entered data when users move between steps.
- Show credit amounts, recipients, applicable costs, and consequences before committing an important action.
- Confirm important outcomes clearly, including the affected account and resulting balance where available.
- Prevent duplicate submissions.
- Provide contextual recovery actions when something fails.
- Use confirmations for consequential or destructive actions without interrupting every routine operation.

### 7. Make responsiveness and accessibility part of the design

- Support small phones, tablets, laptops, desktops, and large displays.
- Avoid page-level horizontal overflow.
- Adapt navigation, forms, dialogs, and tables to the available space.
- Keep essential table information readable; use a contained horizontal scroll only when necessary.
- Do not shrink desktop screens until text and controls become unusable.
- Ensure visible keyboard focus, accessible names, sufficient contrast, and comfortable touch targets.
- Never rely on color alone to communicate status.
- Keep dialogs and menus within the viewport.
- Use content-aware layouts rather than blindly stacking every desktop card.

### 8. Complete the work in stages without losing context

Execute these stages in order. Continue autonomously between stages unless a missing business decision blocks implementation.

**Stage 1 — Audit**
Inspect the existing application and identify the routes, role permissions, reusable components, available data, and main workflows.

**Stage 2 — Plan**
Create a concise role-to-page map and shared design rules. Record requirements, decisions, and an implementation checklist in the project’s existing documentation location.

**Stage 3 — Shared foundation**
Implement the dashboard shell, responsive navigation, typography, colors, buttons, fields, tables, dialogs, status treatments, and feedback states.

**Stage 4 — Super Admin**
Complete the main management views and connected workflows first. Verify existing behavior before continuing.

**Stage 5 — Reseller**
Implement the reseller experience using the shared components and correct account scope.

**Stage 6 — User**
Implement the user experience, including campaign creation and review, with the same visual quality.

**Stage 7 — Verification and cleanup**
Check responsiveness, accessibility, role boundaries, forms, data states, and existing functionality. Remove every unnecessary label, decoration, duplicate element, fake claim, exposed internal ID, and unsupported feature.

After each stage, update the checklist with completed work, remaining tasks, decisions, and relevant files. Consult it before starting the next stage so requirements remain consistent.

Do not stop after producing a plan or a static mockup. Complete the implementation within the project’s supported capabilities. If an integration or required data source is missing, describe that limitation clearly instead of simulating success.

The finished result should be a cohesive, premium dashboard where users can understand their situation and complete their work with minimal friction.

---

## Implementation checkpoint ? paused 3 November 2026

Paused at the user's request after completing implementation stages 1?6. **Resume at Stage 7: verification and cleanup.** The changes are local and have not been committed or deployed.

### Completed

- **Stage 1 ? Audit:** inspected routes, role query hooks, reusable components and backend permissions. Findings and decisions are recorded in `frontend/design-implementation.md`.
- **Stage 2 ? Plan:** recorded the role-to-page map, shared design rules, integration limits and staged checklist in that document.
- **Stage 3 ? Shared foundation:** all roles use `src/components/dashboard/DashboardLayout.jsx` and `dashboard.css`; consistent light palette, responsive sidebar, keyboard skip link, readable tables, shared controls and viewport-constrained dialogs. Role routes return managers to their own panel unless using the existing account preview flow.
- **Stage 4 ? Super Admin:** overview prioritizes pending campaigns and reseller accounts; charts removed from the active overview; searchable super-admin account view added; existing management pages use shared styling. Contact deletion now requires confirmation. Removed exposed account IDs and pulsing campaign decorations. Corrected published-report counts and simplified time entry.
- **Stage 5 ? Reseller:** overview shows balance, rate, assigned users and campaigns. Campaign details use a scoped read-only query instead of the disabled admin query. Shared settings provide supported password and session controls.
- **Stage 6 ? User:** added campaign list/search/status filtering and read-only details; corrected campaign return routes; replaced misleading credit-add/manual-deduct controls with reviewed credit requests; improved transaction history and settings. Campaign submission now reviews actual account rate, validated recipients, estimated charge, remaining balance and schedule, prevents duplicate submissions and refreshes role data after success.

### Verification already completed

- Latest production build passed: `npm run build` in `frontend`. Vite still reports an entry chunk larger than 500 kB.
- All 9 tests passed: `node --test src/features/admin/lib/admin.test.js src/features/campaigns/lib/submission.test.js` in `frontend`.
- New tests cover account-rate estimates, the Super Admin exemption, existing backend rate fallback, recipient length validation and deduplication.
- These commands required execution outside the Windows sandbox because child-process spawning failed with EPERM inside it.
- **Browser, visual and live-backend verification have not been completed.** Do not treat the build and unit tests as proof that every workflow or viewport passes.

### Continue from here

1. Read this checkpoint and `frontend/design-implementation.md`, inspect the current diff, and continue **Stage 7** without restarting stages 1?6.
2. Browser-check every active role page at phone, tablet and desktop widths, particularly 320/390/768/1280 px: sidebar collapse/drawer, page overflow, tables, campaign editor, sheets, dialogs, keyboard focus and long names. Microsoft Edge is installed locally; no browser test harness has been created yet.
3. Check loading, empty, error and retry states. Management-page summary counts still need a final audit so unavailable data never appears as a real zero.
4. Exercise campaign review/back/edit/submission, failed submission recovery, correct role redirects and balance refresh. Verify actual backend response shapes, media attachment display and message formatting in the new read-only detail. No live campaign or account mutation was performed during this work.
5. Verify account preview and role boundaries end to end. User/reseller read queries were enabled in preview to avoid endless loading; confirm preview mutations remain blocked and restricted actions are not presented as available.
6. Audit ordinary actions still hidden in management menus, sentence-case labels, extra summaries, and leftover decorative or technical content on active routes. Old unrouted dashboard/chart components remain in the repository; ensure none is reachable from the current route tree before deciding whether to remove them.
7. Check socket-driven cache invalidation for the new user/reseller query keys and shared `accountSessions` key; the existing socket context still predominantly invalidates legacy/admin keys.
8. Review all changes, rerun the build and relevant tests after any fixes, and update the Stage 7 checklist with actual browser/backend verification results and remaining limits.

### Preserved integration limits

- Admin operating preferences remain local to this browser; they do not enforce server-side limits. Keep the existing disclosure.
- No profile-update backend route exists. Account information is read-only; password and session controls use existing endpoints.
- Credit requests record a request and do not increase the wallet balance.
- The existing campaign controller defaults nonpositive/missing rates to 12 credits and exempts Super Admin. The estimate now follows those existing rules; no billing rules were changed.
- The new super-admin account view is read-only because role changes/removal have no supported management endpoint.
