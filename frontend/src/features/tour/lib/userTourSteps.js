const target = (name) => `[data-tour="${name}"]`;
const step = (element, title, description, side = "bottom") => ({
  element, popover: { title, description, side, align: "start" },
});
const page = (id, title, description, steps) => ({ id, title, description, steps });

export const userPageTours = {
  overview: page("overview", "Your overview", "This is your home page. See your credits and recent campaigns here.", [
    step('.portal-sidebar', "Move between pages", "Use this menu to open your campaigns, credits, notifications, or settings.", "right"),
    step('.dashboard-summary', "Your credits", "See how many credits you have, the cost per recipient, and when your credits expire."),
    step('.portal-page-actions', "Start a campaign", "Choose Create campaign to send a new message. Refresh checks for the latest information."),
    step('.dashboard-section', "Your recent campaigns", "See your latest campaigns and their status. Select a campaign to learn more, or View all to see the full list."),
    step('.dashboard-note', "Need more credits?", "Choose Request credits to ask your account manager for more credits."),
    step('#tour-topbar-search', "Find something quickly", "Use this search to find a campaign without looking through the full list."),
    step('#tour-notification-bell', "Your latest updates", "Open the bell to see updates about your campaigns, credits, and account.", "left"),
  ]),
  campaigns: page("campaigns", "Your campaigns", "A campaign is a message sent to a list of phone numbers. This page shows yours.", [
    step('a[href="/user/campaigns/create"]', "Create a campaign", "Choose this button to write a message and add the people you want to send it to."),
    step('#dashboard-main input[placeholder="Search campaigns"]', "Find a campaign", "Type part of a campaign name here. Clear the search to see all campaigns again."),
    step('[aria-label="Campaign status"]', "Check progress", "Choose a status to show only campaigns at that stage. Pending campaigns are waiting for review."),
    step(target("records"), "Read your campaign list", "See the number of recipients, status, credits charged, and report availability. Select a campaign name to open it."),
    step('button[aria-label^="Actions for"]', "More options", "Open this menu to view the campaign or its report. Delete permanently removes the campaign, so check carefully before confirming."),
  ]),
  create: page("campaign-create", "Create a campaign", "Let's look at how to prepare a message and send it for approval.", [
    step(target("create-details"), "Name your campaign", "Give it a name you will recognize later. The description is optional."),
    step(target("create-message"), "Write your message", "This is the message people will receive. Use the toolbar to format it. Keep it within the character limit shown here."),
    step(target("create-media"), "Add a file if needed", "You can attach one image, one video, and one PDF. Attachments are optional. The file limits are shown here."),
    step(target("create-recipients"), "Add phone numbers", "Paste numbers with their country codes, or upload a CSV or TXT file. Each entered number costs credits, including repeated numbers."),
    step(target("create-timing"), "Choose when to send", "Send now means after admin approval. Choose Schedule to pick a future date and time."),
    step(target("create-summary"), "Check the cost", "See the estimated cost and the credits you will have left. Fix any checklist problems before continuing."),
    step('#dashboard-main button[type="submit"]', "Review before sending", "Review campaign opens a final check. Nothing is submitted until you confirm. Credits are charged when your submission is accepted."),
  ]),
  detail: page("campaign-detail", "Campaign details", "This page shows what you submitted and how your campaign is progressing.", [
    step(target("campaign-header"), "Check the status", "See your campaign name, status, and sending time. Any available schedule or cancel options are shown here."),
    step('.portal-metrics', "Your campaign numbers", "Check the recipient count and credit totals for this campaign."),
    step(target("campaign-message"), "Your message", "Read the message you submitted. Choose Copy if you need to copy its text."),
    step(target("campaign-attachments"), "Your attachments", "View or download the files you added to this campaign."),
    step(target("campaign-recipients"), "Your recipients", "Search phone numbers and check their available results. Use the download option to save a copy of the list."),
    step('#dashboard-main a[href$="/report"]', "Open the report", "When a report is available, open it here to see the published results."),
  ]),
  report: page("campaign-report", "Your campaign report", "This page shows the results shared by your administrator.", [
    step('#dashboard-main header', "Check which campaign this is", "See the campaign name and status here. A published report may also offer an Excel download."),
    step('[aria-label="Report summary"], [aria-label="Campaign summary"]', "Results and credits", "Check the recipients, credits charged, and any credits returned to your wallet."),
    step('[aria-labelledby="pending-report-title"]', "Waiting for a report", "Your administrator has not published the report yet. You do not need to do anything. Use Check for updates to look again."),
    step(target("report-failure"), "Why the campaign failed", "Read your administrator's explanation here. The charge and refund amounts are shown below it."),
    step('[aria-labelledby="recipient-report-heading"]', "Results for each number", "Search the list or filter the results. Each row shows the result for one recipient. This report is read-only."),
    step(target("report-failure-contacts"), "Original phone numbers", "This list shows the numbers submitted with the campaign. Use search to find a number."),
    step('[aria-label="Recipients per page"]', "Browse more results", "Choose how many rows to show. The page controls below the list help you move through the report."),
  ]),
  credits: page("credits", "Your credits", "Credits pay for your campaigns. Check your balance and past credit changes here.", [
    step('.dashboard-summary', "Your available balance", "See the credits you can use and the cost per recipient. If your wallet is locked, contact your account manager."),
    step(target("request-credits"), "Ask for more credits", "Enter the amount you need and an optional note, then review and send the request. Your balance changes only when your manager adds credits."),
    step('[aria-label="Transaction type"]', "Choose what to see", "Show all credit changes, or choose a type such as campaign charges, refunds, or credit requests."),
    step(target("records"), "Your credit history", "See when credits changed, why they changed, and your balance afterward. A request is only a request; it does not add credits."),
    step('nav[aria-label="Table pagination"]', "See older changes", "Use the page buttons to look through older credit history."),
  ]),
};

export function getUserPageTour(pathname) {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/user") return userPageTours.overview;
  if (/^\/user\/campaigns\/(create|new)$/.test(path)) return userPageTours.create;
  if (/^\/user\/campaigns\/[^/]+\/report$/.test(path)) return userPageTours.report;
  if (/^\/user\/campaigns\/[^/]+$/.test(path)) return userPageTours.detail;
  const pages = { campaigns: "campaigns", credits: "credits" };
  return /^\/user\/[^/]+$/.test(path) ? userPageTours[pages[path.split("/")[2]]] || null : null;
}
