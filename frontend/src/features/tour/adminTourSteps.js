const target = (name) => `[data-tour="${name}"]`;
const step = (element, title, description, side = "bottom") => ({
  element, popover: { title, description, side, align: "start" },
});
const page = (id, title, description, steps) => ({ id, title, description, steps });
const search = (description) => step('#dashboard-main input[placeholder^="Search"]', "Find the right record", description);
const table = (description) => step('#dashboard-main [data-tour="records"]', "Explore the list", description);

function accountsPage(reseller) {
  return page(reseller ? "resellers" : "users", reseller ? "Resellers" : "User accounts", "Manage account access, pricing, and credits.", [
    step(target("add-account"), reseller ? "Add a reseller" : "Add a user", "Create an account with a username, email, password, message rate, and access settings. Review the details before confirming."),
    search("Search by account name or email. Clear your search to return to the full list."),
    step('#dashboard-main [aria-label="Account status"]', "Filter account access", "Focus on active, blocked, or expired accounts."),
    table(reseller ? "Review contact details, assigned user counts, credits per recipient, expiry, and status. Select a name to inspect its profile and wallet. Sort supported columns and browse with the page controls."
      : "Review contact details, assigned reseller, credits per recipient, expiry, and status. Select a name to inspect its profile and wallet. Sort supported columns and browse with the page controls."),
    step('#dashboard-main button[aria-label^="Actions for"]', "Manage an account", "The menu contains account editing, access and expiry, rate and role changes, credit allocation and reclaim, and deletion. Login as account opens a separate tab with that account's access."),
  ]);
}

export const adminPageTours = {
  overview: page("overview", "Admin overview", "Get familiar with the tools for managing campaigns, accounts, and credits.", [
    step('.portal-sidebar', "Your workspace navigation", "Move between campaigns, super admins, resellers, users, credits, transactions, notifications, and settings.", "right"),
    step('.portal-metrics', "Platform totals", "See campaign totals, active resellers, user accounts, and credits in circulation. Select a card to open its management page."),
    step('.portal-page-actions', "Refresh or allocate credits", "Refresh reloads dashboard data. Allocate credits opens the credit form to fund an account."),
    step('.dashboard-two-column > :first-child', "Campaigns awaiting attention", "Review pending submissions and their owners. Open a campaign to inspect it, or select View all for the complete queue."),
    step('.dashboard-two-column > :last-child', "Your reseller network", "Review reseller accounts and status, then use Manage to open the full network."),
    step('.portal-overview > .dashboard-section', "Recent credit movements", "Review recent allocations and adjustments. Open the full transaction history for a complete audit trail."),
    step('#tour-topbar-search', "Search your workspace", "Find accounts and campaigns from the top bar, then select a result to open it."),
    step('#tour-notification-bell', "Catch up on updates", "Open recent campaign, credit, and account notifications. The Notifications page contains the full history.", "left"),
  ]),
  campaigns: page("campaigns", "Campaigns", "Find submissions, monitor progress, and open campaign and report tools.", [
    step(target("campaign-status"), "Focus on a campaign stage", "Switch status tabs to narrow the queue. Counts show the number of campaigns in each stage."),
    search("Search by campaign title or account details to find a submission quickly."),
    step(target("campaign-dates"), "Filter by submission date", "Choose a date range and apply it. Clear the date range or all filters to broaden your results."),
    table("Compare owners, recipient counts, status, report availability, and dates. Select a title to inspect the campaign. Sort supported columns and use the page controls to browse."),
    step('#dashboard-main button[aria-label^="Actions"]', "Campaign and report actions", "Open campaign details or its report from the row menu. Available actions depend on the campaign's state."),
  ]),
  resellers: accountsPage(true),
  users: accountsPage(false),
  credits: page("credits", "Credits and wallets", "Understand balances and manage credits for reseller and user accounts.", [
    step(target("credit-summary"), "Understand the totals", "The super admin sending pool is unlimited. Total credits given tracks network allocations; circulating balances are credits currently held in account wallets."),
    step(target("credit-actions"), "Add or reclaim credits", "Add Credits funds an active account. Reclaim takes back available credits. Review the account, amount, and notes before confirmation."),
    search("Search for an account by name or email before changing its balance."),
    step('#dashboard-main [aria-label="Filter by role"]', "Focus on a role", "Show all wallets, reseller wallets, or user wallets."),
    table("Compare balances, message rates, wallet expiry, and locked status. Row actions let you add or reclaim credits and view history. Wallet credit expiry is separate from account access expiry."),
  ]),
  activity: page("activity", "Transactions", "Follow the audit trail for allocations, campaign charges, refunds, and deductions.", [
    step('#dashboard-main [aria-label="Transaction type"]', "Filter credit movements", "Isolate allocations, charges, refunds, or other adjustments by transaction type."),
    step('#dashboard-main [aria-label="Filter by account"]', "Inspect one account", "Choose an account to narrow the ledger. All accounts returns to network-wide history."),
    table("Read the time, type, source, destination, amount, operator, and notes. Positive and negative amounts indicate the direction of each credit movement."),
    step('#dashboard-main nav[aria-label="Table pagination"]', "Browse the ledger", "Use previous and next to browse history. The record count reflects your current filters."),
    step('.portal-page-heading', "Manage wallets and credits", "Manage Wallets opens current balances. Add Credits starts a new allocation."),
  ]),
  settings: page("settings", "Operating rules", "Explore campaign, device, and billing preferences, and manage signed-in sessions.", [
    step('.portal-settings-notice', "Where preferences apply", "Preferences are saved in this browser only and do not update server rules. Device sign-out actions apply immediately."),
    step('.portal-settings-summary', "Your current preferences", "This summary shows your selected daily campaign allowance, sending window, and device limit."),
    step('#operating-tab-campaigns', "Campaign preferences", "The Campaigns tab contains daily allowances, sending hours, and behavior outside the sending window."),
    step('#operating-tab-devices', "Device access", "The Devices tab contains limit preferences and live signed-in sessions. Disconnect ends a session immediately. Signing out all devices also ends your current session."),
    step('#operating-tab-billing', "Rates and balances", "The Billing tab contains default message rates, low-balance thresholds, credit expiry, refund preferences, and overdraft protection."),
    step('.portal-settings-panel', "Edit the selected category", "Review the active tab's fields and explanations. Address validation messages before saving. Switch tabs after this walkthrough to explore each category."),
    step('.portal-savebar', "Save your preferences", "Save changes keeps edits in this browser. Restore defaults resets the form; save afterward to keep the defaults."),
  ]),
  detail: page("campaign-detail", "Campaign details", "Inspect content, schedule, recipients, and available management actions.", [
    step(target("campaign-header"), "Identity, status, and actions", "Review title, owner, dates, and schedule. Available controls let you manage status, launch or reschedule eligible campaigns, cancel, and open report tools."),
    step('.portal-metrics', "Campaign totals", "Check recipient and credit figures before making changes. These totals summarize this campaign."),
    step(target("campaign-message"), "Review the message", "Read the submitted message and use Copy when you need its text."),
    step(target("campaign-attachments"), "Inspect attachments", "Preview or download the campaign's images and files when present."),
    step(target("campaign-recipients"), "Review recipients", "Search recipients, inspect status, copy numbers, or export available data. Use pagination for larger lists."),
  ]),
  reportCreate: page("campaign-report-create", "Create or edit a report", "Organize delivery outcomes and their credit treatment before publishing.", [
    step(target("report-editor-actions"), "Save and review", "Save and review stores a draft and opens the review page. Saving a draft does not publish or post credit adjustments."),
    step(target("report-editor-summary"), "Check report totals", "Review recipient totals, billable numbers, and refund estimates as you organize the report."),
    step(target("report-categories"), "Organize delivery outcomes", "Paste numbers into outcome categories, rename categories, or add your own. Choose Keep charged or Refund credits for each category. Resolve validation messages before saving."),
    step('#failure-reason', "Explain a failed campaign", "Enter the reason its owner should see, then save and review. The full refund is posted on publication."),
    step(target("report-editor"), "Review before publishing", "Check numbers and credit treatment carefully. On the review page, inspect the owner's preview before confirming publication."),
  ]),
  report: page("campaign-report", "Review and publish a report", "Check the owner's preview and credit adjustments before making a report available.", [
    step(target("report-review-header"), "Report state and actions", "Check the last publication time. Refresh reloads data. Edit report opens the editor. Publish report opens a confirmation."),
    step(target("report-credit-preview"), "Check the credit adjustment", "Review the estimated refund or deduction. Publication applies the adjustment; draft edits alone do not change the owner's balance."),
    step(target("report-owner-preview"), "See the owner's report", "Inspect the content and outcomes the owner will see after publication. Correct errors with Edit report before publishing."),
  ]),
};

export function getAdminPageTour(pathname) {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/admin") return adminPageTours.overview;
  if (/^\/admin\/campaigns\/[^/]+\/report\/create$/.test(path)) return adminPageTours.reportCreate;
  if (/^\/admin\/campaigns\/[^/]+\/report$/.test(path)) return adminPageTours.report;
  if (/^\/admin\/campaigns\/[^/]+$/.test(path)) return adminPageTours.detail;
  return /^\/admin\/[^/]+$/.test(path) ? adminPageTours[path.split("/")[2]] || null : null;
}

