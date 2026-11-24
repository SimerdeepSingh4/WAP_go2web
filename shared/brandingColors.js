export const BRAND_COLOR_FIELDS = {
    primaryColor: ["Primary buttons and links", "primary", "#008069"],
    secondaryColor: ["Secondary buttons and surfaces", "secondary", "#edf5ef"],
    accentColor: ["Highlights and selections", "accent", "#e7f5ed"],
    backgroundColor: ["Page background", "background", "#fbfdfb"],
    kpiCampaignsColor: ["Campaign KPI card", "kpi-campaigns", "#235f7b"],
    kpiNetworkColor: ["Resellers or purchase rates KPI card", "kpi-network", "#63497b"],
    kpiUsersColor: ["User accounts KPI card", "kpi-users", "#8d405f"],
    kpiCreditsColor: ["Credits KPI card", "kpi-credits", "#175b40"],
    kpiColor: ["KPI cards", "kpi", "#104936"],
    cardColor: ["Cards and panels", "card", "#ffffff"],
    popoverColor: ["Menus and popovers", "popover", "#ffffff"],
    sidebarColor: ["Sidebar background", "sidebar", "#f7fbf8"],
    headerColor: ["Top bar background", "header", "#ffffff"],
    textColor: ["Main text", "foreground", "#172b24"],
    mutedTextColor: ["Muted text", "muted-foreground", "#5d7064"],
    mutedColor: ["Muted surfaces", "muted", "#eff5f0"],
    borderColor: ["Borders and input outlines", "border", "#dce7df"],
    focusColor: ["Keyboard focus rings", "ring", "#128c7e"],
    successColor: ["Success messages", "success", "#176448"],
    warningColor: ["Warning messages", "warning", "#92400e"],
    dangerColor: ["Errors and destructive actions", "danger", "#dc2626"],
    infoColor: ["Informational messages", "info", "#1d4ed8"],
    chartColor: ["Dashboard charts", "chart", "#087f5b"],
};

export const BRAND_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function brandColors(branding) {
    return Object.fromEntries(Object.keys(BRAND_COLOR_FIELDS).map(key => [key, branding?.[key] || ""]));
}
