import NotificationBell from "@/features/notifications/NotificationBell";
import GlobalSearch from "./GlobalSearch";
import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { LayoutDashboard, Megaphone, Users, Building2, Wallet, ReceiptText, Settings, LogOut, ChevronDown, PanelLeftClose, PanelLeftOpen, Bell } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import PreviewBanner from "@/components/PreviewBanner";

const rolePaths = { "Super Admin": "/admin", Reseller: "/reseller", User: "/user" };
const navigation = {
  "Super Admin": [
    ["Overview", "", LayoutDashboard],
    ["Campaigns", "/campaigns", Megaphone],
    ["Super admins", "/administrators", Users],
    ["Resellers", "/resellers", Building2],
    ["Users", "/users", Users],
    ["Credits", "/credits", Wallet],
    ["Transactions", "/activity", ReceiptText],
    ["Notifications", "/notifications", Bell],
    ["Settings", "/settings", Settings],
  ],
  Reseller: [
    ["Overview", "", LayoutDashboard],
    ["Campaigns", "/campaigns", Megaphone],
    ["Users", "/users", Users],
    ["Credits", "/credits", Wallet],
    ["Notifications", "/notifications", Bell],
    ["Settings", "/settings", Settings],
  ],
  User: [
    ["Overview", "", LayoutDashboard],
    ["Campaigns", "/campaigns", Megaphone],
    ["Credits", "/credits", Wallet],
    ["Notifications", "/notifications", Bell],
    ["Settings", "/settings", Settings],
  ],
};

function Navigation({ role, base, items }) {
  const { pathname } = useLocation();
  const { setOpenMobile, toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";
  return (
    <Sidebar collapsible="icon" className="portal-sidebar">
      <SidebarHeader className="portal-sidebar-header">
        {isCollapsed ? (
          <div className="flex items-center justify-center w-full">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="portal-sidebar-logo-toggle group"
            >
              <span className="portal-logo-layer portal-logo-default">
                <img
                  src="https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp"
                  alt="Promotion"
                />
              </span>
              <span className="portal-logo-layer portal-logo-hover">
                <PanelLeftOpen className="size-5" aria-hidden="true" />
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full min-w-0">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="portal-sidebar-logo-toggle group"
            >
              <span className="portal-logo-layer portal-logo-default">
                <img
                  src="https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp"
                  alt="Promotion"
                />
              </span>
              <span className="portal-logo-layer portal-logo-hover">
                <PanelLeftClose className="size-5" aria-hidden="true" />
              </span>
            </button>
            <Link
              to={base}
              aria-label="Promotion home"
              onClick={() => setOpenMobile(false)}
              className="portal-brand-copy flex-1 min-w-0"
            >
              <strong>Promotion<span>.</span></strong>
              <span>{role === "Super Admin" ? "Super admin" : role}</span>
            </Link>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="portal-sidebar-content">
        <SidebarGroup className="portal-nav-group">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map(([label, path, Icon]) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton isActive={path ? pathname.startsWith(`${base}${path}`) : pathname === base} tooltip={label} render={<NavLink to={`${base}${path}`} end={!path} />} onClick={() => setOpenMobile(false)} className="portal-nav-link">
                    <Icon aria-hidden="true" />
                    <span className="portal-nav-text">{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout({ role }) {
  const { user, logout, isLoggingOut } = useAuth();
  const [open, setOpen] = useState(true);
  const base = rolePaths[role];
  const items = navigation[role];

  // Keep a manager's data out of a workspace labelled for another role.
  const username = user?.username || role;

  async function signOut() {
    try { await logout(); }
    catch (error) { toast.add({ title: "Sign out failed", description: error.message, type: "error" }); }
  }

  if (user?.role !== role) return <Navigate to={rolePaths[user?.role] || "/login"} replace />;

  return (
    <div className="admin-portal dashboard-portal">
      {role !== "Super Admin" && <PreviewBanner />}
      <a href="#dashboard-main" className="portal-skip-link">Skip to content</a>
      <TooltipProvider>
        <SidebarProvider open={open} onOpenChange={setOpen} style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" }} className="portal-shell">
          <Navigation role={role} base={base} items={items} />
          <SidebarInset className="portal-inset">
            <header className="portal-topbar">
              <SidebarTrigger className="md:hidden" aria-label="Toggle navigation" />
              <GlobalSearch />
              <div className="portal-topbar-actions ml-auto">
                <NotificationBell base={base} />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Account menu for ${username}`}
                        className="portal-profile-trigger"
                      />
                    }
                  >
                    <Avatar className="size-8.5 rounded-lg border border-slate-200 bg-slate-100 shrink-0">
                      <AvatarFallback className="rounded-lg bg-sky-100 text-[#000080] font-bold text-xs">
                        {username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="size-3.5 text-slate-500 transition-transform portal-profile-chevron" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="portal-account-menu w-60 p-2">
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-semibold text-slate-900 leading-none">{username}</p>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">{user?.email || "admin@go2web.in"}</p>
                      <span className="portal-role-badge">
                        {role === "Super Admin" ? "Super admin" : role}
                      </span>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem render={<Link to={`${base}/settings`} />}>
                      <Settings aria-hidden="true" className="size-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isLoggingOut} onClick={signOut} className="text-red-600 focus:text-red-600">
                      <LogOut aria-hidden="true" className="size-4" />
                      {isLoggingOut ? "Signing out…" : "Sign out"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main id="dashboard-main" tabIndex={-1} className="portal-main"><Outlet /></main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
