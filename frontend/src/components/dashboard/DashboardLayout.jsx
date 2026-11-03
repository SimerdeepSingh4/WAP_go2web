import { useState, useRef, useEffect } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { LayoutDashboard, Megaphone, Users, Contact, Building2, Wallet, ReceiptText, Settings, LogOut, ChevronDown, PanelLeftClose, PanelLeftOpen, Search, Bell, X } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import PreviewBanner from "@/components/PreviewBanner";

const rolePaths = { "Super Admin": "/admin", Reseller: "/reseller", User: "/user" };
const navigation = {
  "Super Admin": [
    ["Overview", "", LayoutDashboard],
    ["Campaigns", "/campaigns", Megaphone],
    ["Contacts", "/contacts", Contact],
    ["Super admins", "/administrators", Users],
    ["Resellers", "/resellers", Building2],
    ["Users", "/users", Users],
    ["Credits", "/credits", Wallet],
    ["Transactions", "/activity", ReceiptText],
    ["Settings", "/settings", Settings],
  ],
  Reseller: [
    ["Overview", "", LayoutDashboard],
    ["Campaigns", "/campaigns", Megaphone],
    ["Users", "/users", Users],
    ["Credits", "/credits", Wallet],
    ["Transactions", "/activity", ReceiptText],
    ["Settings", "/settings", Settings],
  ],
  User: [
    ["Overview", "", LayoutDashboard],
    ["Campaigns", "/campaigns", Megaphone],
    ["Credits", "/credits", Wallet],
    ["Transactions", "/activity", ReceiptText],
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const { pathname } = useLocation();
  const base = rolePaths[role];
  const items = navigation[role];

  // Keep a manager's data out of a workspace labelled for another role.
  if (user?.role !== role) return <Navigate to={rolePaths[user?.role] || "/login"} replace />;
  const username = user?.username || role;

  async function signOut() {
    try { await logout(); }
    catch (error) { toast.add({ title: "Sign out failed", description: error.message, type: "error" }); }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredItems = searchQuery.trim()
    ? items.filter(([label]) => label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  return (
    <div className="admin-portal dashboard-portal">
      {role !== "Super Admin" && <PreviewBanner />}
      <a href="#dashboard-main" className="portal-skip-link">Skip to content</a>
      <TooltipProvider>
        <SidebarProvider open={open} onOpenChange={setOpen} style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" }} className="portal-shell">
          <Navigation role={role} base={base} items={items} />
          <SidebarInset className="portal-inset">
            <header className="portal-topbar">
              <div className="portal-search-wrapper">
                <div className="portal-search-bar">
                  <Search className="size-4 text-slate-400 shrink-0" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="find a control"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                    aria-label="Find a control"
                    className="portal-search-input"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : (
                    <kbd className="portal-search-kbd">
                      <span>⌘</span>
                      <span>K</span>
                    </kbd>
                  )}
                </div>

                {isSearchFocused && filteredItems.length > 0 && (
                  <div className="portal-search-results">
                    <div className="portal-search-section-label">Pages</div>
                    {filteredItems.map(([label, path, Icon]) => (
                      <Link
                        key={path}
                        to={`${base}${path}`}
                        className="portal-search-result-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearchQuery("");
                          setIsSearchFocused(false);
                        }}
                      >
                        <Icon className="size-4 text-slate-500 shrink-0" />
                        <span>{label}</span>
                        <span className="portal-search-result-path">{base}{path || "/"}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="portal-topbar-actions">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Notifications"
                        className="portal-notification-btn"
                      />
                    }
                  >
                    <Bell className="size-4.5" aria-hidden="true" />
                    <span className="portal-notification-badge" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="portal-notifications-menu w-80 p-2">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-xs font-semibold text-slate-900">Notifications</span>
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        2 new
                      </span>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="space-y-1 py-1">
                      <div className="rounded-lg p-2 transition-colors hover:bg-slate-50 cursor-pointer">
                        <p className="text-xs font-medium text-slate-800">System Ready</p>
                        <p className="text-[11px] text-slate-500">All WhatsApp gateway channels are operational and synchronized.</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">Just now</span>
                      </div>
                      <div className="rounded-lg p-2 transition-colors hover:bg-slate-50 cursor-pointer">
                        <p className="text-xs font-medium text-slate-800">Campaign Dispatched</p>
                        <p className="text-[11px] text-slate-500">Scheduled broadcast completed reach confirmation.</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">1 hour ago</span>
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

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
