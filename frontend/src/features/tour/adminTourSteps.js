/**
 * Guided tour steps for Super Admin.
 * Words are kept simple, friendly, and free of technical jargon.
 */

export const adminTourSteps = [
  {
    popover: {
      title: "Welcome to Promotion! 👋",
      description: "Take a quick 1-minute tour to see how everything works. You can click 'Next' to explore, or close this anytime.",
      side: "center",
      align: "center",
    },
  },
  {
    element: ".portal-sidebar",
    popover: {
      title: "Main Navigation Menu 📋",
      description: "This is your main menu. Use it to easily switch between your dashboard, campaigns, resellers, users, and credits.",
      side: "right",
      align: "start",
    },
  },
  {
    element: ".portal-metrics",
    popover: {
      title: "Your Numbers at a Glance 📊",
      description: "See your total message campaigns, active resellers, client users, and how many credits are currently in use.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: 'a[href="/admin/campaigns"]',
    popover: {
      title: "WhatsApp Campaigns 📢",
      description: "View all broadcast campaigns sent by users. You can check delivery reports, approve scheduled messages, or review status.",
      side: "right",
      align: "center",
    },
  },
  {
    element: 'a[href="/admin/resellers"]',
    popover: {
      title: "Resellers Network 🏢",
      description: "Manage your partners who sell to clients. Set their message prices, allocate credits to them, and view their users.",
      side: "right",
      align: "center",
    },
  },
  {
    element: 'a[href="/admin/users"]',
    popover: {
      title: "User Accounts 👥",
      description: "See and manage all client accounts. You can edit their information, change their message rate, or set account expiry dates.",
      side: "right",
      align: "center",
    },
  },
  {
    element: 'a[href="/admin/credits"]',
    popover: {
      title: "Credits & Wallet 💳",
      description: "Add credits to any reseller or user account, take back unused credits, and review the full balance history.",
      side: "right",
      align: "center",
    },
  },
  {
    element: "#tour-topbar-search",
    popover: {
      title: "Quick Search 🔍",
      description: "Type any account name, email address, or campaign title to find it immediately without searching manually.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "#tour-notification-bell",
    popover: {
      title: "Live Alerts 🔔",
      description: "Receive instant notifications when campaigns finish, when credits run low, or when an account needs attention.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "#tour-help-button",
    popover: {
      title: "Need Help Later? ✨",
      description: "You can click this 'Tour' button anytime if you want to see this walkthrough again. You're ready to get started!",
      side: "bottom",
      align: "end",
    },
  },
];
