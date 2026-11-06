import { userPageTours } from "./userTourSteps.js";

const target = (name) => `[data-tour="${name}"]`;
const step = (element, title, description, side = "bottom") => ({
  element, popover: { title, description, side, align: "start" },
});
const page = (id, title, description, steps) => ({ id, title, description, steps });

export const resellerPageTours = {
  overview: page("overview", "Your reseller overview", "Start here to check your credits, campaigns, and client accounts.", [
    step('.portal-sidebar', "Move between pages", "Use this menu to open campaigns, manage your users, or check credits.", "right"),
    step('.dashboard-summary', "Your available credits", "See your balance and the cost per recipient. If your wallet is locked, contact your administrator."),
    step('.portal-page-actions', "Give credits to a user", "Choose Allocate credits to move credits from your wallet to a user. Refresh checks for the latest information."),
    step('.dashboard-two-column > :first-child', "Recent campaigns", "See recent campaigns and their owners. Select a campaign to open it, or View all to see the full list."),
    step('.dashboard-two-column > :last-child', "Your client users", "See your user accounts here. Choose Manage to add users or change their account details."),
    step('#tour-topbar-search', "Find something quickly", "Search for a user or campaign here, then select a result to open it."),
  ]),
  users: page("users", "Your users", "Manage your client accounts and the credits they use for campaigns.", [
    step(target("reseller-add-user"), "Add a user", "Create a client account with a name, email, password, and message rate. Review the details before confirming."),
    step('input[aria-label="Search username or email"]', "Find a user", "Type a username or email here. Clear the search to see all your users again."),
    step('[aria-label="Account status"]', "Check account access", "Choose active, blocked, or expired to show only users with that status."),
    step(target("records"), "Read the user list", "Check each user's details, rate, and status. Select a name to see the account profile and wallet balance."),
    step('button[aria-label^="Actions for"]', "Manage a user", "Open this menu to edit details, manage access and expiry, change the rate, or move credits. Check carefully before deleting an account."),
  ]),
  campaigns: page("campaigns", "Your campaigns", "See campaigns created by you and your users, and check their progress.", [
    step('a[href="/reseller/campaigns/create"]', "Create a campaign", "Start here to write a message, add phone numbers, and send your campaign for approval."),
    step('input[aria-label="Search campaigns or accounts"]', "Find a campaign", "Search by campaign name or account details to find the campaign you need."),
    step('[aria-label="Filter campaigns"]', "Choose a status", "Show only campaigns at one stage, such as pending, ongoing, or completed. Clear filters to see all results."),
    step(target("records"), "Check progress and results", "See the owner, recipient count, status, and report availability. Select a campaign name to open its details."),
    step('button[aria-label^="Actions for"]', "Open a report", "Use this menu to view the campaign report. Delete permanently removes a campaign, so check carefully before confirming."),
  ]),
  // The campaign form and its instructions are the same for users and resellers.
  create: userPageTours.create,
  detail: page("campaign-detail", "Campaign details", "Check the message, phone numbers, and progress for this campaign.", [
    step(target("campaign-header"), "Campaign status and actions", "See the campaign name, owner, status, and sending time. Any available schedule or cancel options appear here."),
    step('.portal-metrics', "Campaign numbers", "Check the recipient count and credit totals for this campaign."),
    step(target("campaign-message"), "Read the message", "This is the message submitted for the campaign. Choose Copy to copy its text."),
    step(target("campaign-attachments"), "View attached files", "Preview or download the images and files added to this campaign."),
    step(target("campaign-recipients"), "Check phone numbers", "Search the recipients and check available results. Use the download option to save a copy of the list."),
    step('#dashboard-main a[href$="/report"]', "See the report", "When a report is available, open it here to see the published results."),
  ]),
  report: page("campaign-report", "Campaign report", "Read the results your administrator has shared for this campaign.", [
    step('#dashboard-main header', "Check the campaign", "See which campaign this report belongs to and its status. A published report may also offer an Excel download."),
    step('[aria-label="Report summary"], [aria-label="Campaign summary"]', "Results and credits", "Check the recipient totals, credits charged, and credits refunded to the campaign owner's wallet."),
    step('[aria-labelledby="pending-report-title"]', "Waiting for results", "The administrator has not published the report yet. Use Check for updates to look again later."),
    step(target("report-failure"), "Why the campaign failed", "Read the reason given by your administrator. The charge and refund amounts are shown below it."),
    step('[aria-labelledby="recipient-report-heading"]', "Results for each number", "Search the list or filter the results. Each row shows one recipient's result. You can read this report but cannot edit it."),
    step(target("report-failure-contacts"), "Original phone numbers", "Check the phone numbers submitted for this campaign. Search the list to find a number."),
    step('[aria-label="Recipients per page"]', "Browse the report", "Choose how many rows to show. Use the page controls below the list to see more results."),
  ]),
  credits: page("credits", "Your credits", "Check your wallet, give credits to users, and review past credit changes.", [
    step(target("reseller-credit-summary"), "Understand your balance", "See available credits, credits received this month, assigned users, and active accounts. A locked wallet needs your administrator's attention."),
    step(target("reseller-allocate"), "Give credits to a user", "Choose a user and an amount, then review before confirming. The credits move from your wallet to the user's wallet."),
    step(target("reseller-reclaim"), "Take back unused credits", "Choose a user, enter an amount and a reason, then review. Reclaimed credits return to your wallet."),
    step('[aria-label="Transaction type"]', "Choose a type of change", "Show allocations, campaign charges, refunds, or reclaimed credits. Choose All transaction types to see everything."),
    step('[aria-label="Filter by account"]', "Choose an account", "Show your own transactions or those for a user you created. Clear filters to return to the full history."),
    step(target("records"), "Follow credit changes", "Check when credits moved, who they came from, who received them, and the notes. Use the page buttons below for older changes."),
  ]),
};

export function getResellerPageTour(pathname) {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/reseller") return resellerPageTours.overview;
  if (/^\/reseller\/campaigns\/(create|new)$/.test(path)) return resellerPageTours.create;
  if (/^\/reseller\/campaigns\/[^/]+\/report$/.test(path)) return resellerPageTours.report;
  if (/^\/reseller\/campaigns\/[^/]+$/.test(path)) return resellerPageTours.detail;
  const pages = { campaigns: "campaigns", users: "users", credits: "credits" };
  return /^\/reseller\/[^/]+$/.test(path) ? resellerPageTours[pages[path.split("/")[2]]] || null : null;
}
