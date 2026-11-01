import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  LayoutDashboard, Megaphone, Users, Contact, Building2, Wallet,
  ReceiptText, Settings, LogOut, ChevronDown, MessageSquare,
  ArrowUpRight, Plus, ChevronRight, SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarInset, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { create } from "zustand";
import { useAdminQuery } from "../hooks/useAdmin";
import "./admin-dashboard.css";

const useNavigation = create((set) => ({
  open: true,
  setOpen: (open) => set({ open }),
}));

const workspaceNavigation = [
  { title: "Overview", path: "/admin", icon: LayoutDashboard },
  { title: "Campaigns", path: "/admin/campaigns", icon: Megaphone, showPending: true },
  { title: "Audience & contacts", path: "/admin/contacts", icon: Contact },
  { title: "Reports", path: "/admin/reports", icon: ReceiptText },
];
const adminNavigation = [
  { title: "Resellers", path: "/admin/resellers", icon: Building2 },
  { title: "Users", path: "/admin/users", icon: Users },
  { title: "Credits", path: "/admin/credits", icon: Wallet },
  { title: "Activity", path: "/admin/activity", icon: ReceiptText },
  { title: "Settings", path: "/admin/settings", icon: Settings },
];
const matchesPath = (pathname, path) =>
  pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`));

function Navigation() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const campaignsQuery = useAdminQuery("campaigns");
  const campaigns = campaignsQuery.data?.data || [];
  const pendingCount = campaigns.filter((campaign) =>
    ["pending", "scheduled"].includes(campaign.status)
  ).length;

  return (
    <Sidebar collapsible="icon" className="portal-sidebar">
      <SidebarHeader className="portal-sidebar-header">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to="/admin" aria-label="go2web admin home" />}
              onClick={() => setOpenMobile(false)}
              className="portal-brand"
            >
              <span className="portal-brand-mark"><MessageSquare aria-hidden="true" /></span>
              <span className="portal-brand-copy">
                <strong>go2web<span>.</span></strong>
                <span>Admin workspace</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="portal-sidebar-content">
        {[
          { label: "Workspace", items: workspaceNavigation },
          { label: "Administration", items: adminNavigation },
        ].map(({ label, items }) => (
          <SidebarGroup key={label} className="portal-nav-group">
            <SidebarGroupLabel className="portal-nav-label">{label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {items.map(({ title, path, icon: Icon, showPending }) => (
                  <SidebarMenuItem key={path}>
                    <SidebarMenuButton
                      isActive={matchesPath(pathname, path)}
                      tooltip={title}
                      render={<NavLink to={path} end={path === "/admin"} />}
                      onClick={() => setOpenMobile(false)}
                      className="portal-nav-link"
                    >
                      <Icon aria-hidden="true" />
                      <span className="portal-nav-text">{title}</span>
                      {showPending && pendingCount > 0 && (
                        <span className="portal-nav-count" aria-label={`${pendingCount} pending or scheduled campaigns`}>
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <div className="portal-sidebar-footer">
        <Link to="/admin/settings" onClick={() => setOpenMobile(false)} className="portal-workspace-link">
          <SlidersHorizontal aria-hidden="true" />
          <span><strong>Workspace controls</strong><span>Limits, devices & rates</span></span>
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <p>go2web · Super admin console</p>
      </div>
    </Sidebar>
  );
}

export default function AdminLayout() {
  const { user, logout, isLoggingOut } = useAuth();
  const { pathname } = useLocation();
  const { open, setOpen } = useNavigation();
  const allNavigation = [...workspaceNavigation, ...adminNavigation];
  const activeItem = allNavigation.find((item) => matchesPath(pathname, item.path));
  const page = activeItem?.title || "Overview";
  const group = workspaceNavigation.includes(activeItem) ? "Workspace" : "Administration";
  const username = user?.username || "Super admin";

  async function signOut() {
    try {
      await logout();
      toast.add({ title: "Signed out", type: "success" });
    } catch (error) {
      toast.add({ title: "Sign out failed", description: error?.message || "Please try again.", type: "error" });
    }
  }

  return (
    <div className="admin-portal">
      <a href="#admin-main" className="portal-skip-link">Skip to content</a>
      <TooltipProvider>
        <SidebarProvider
          open={open}
          onOpenChange={setOpen}
          style={{ "--sidebar-width": "15.75rem", "--sidebar-width-icon": "4rem" }}
          className="portal-shell"
        >
          <Navigation />
          <SidebarInset className="portal-inset">
            <header className="portal-topbar">
              <div className="portal-breadcrumb">
                <SidebarTrigger aria-label="Toggle navigation" className="portal-sidebar-trigger" />
                <span className="portal-breadcrumb-divider" aria-hidden="true" />
                <span className="portal-breadcrumb-group">{group}</span>
                <ChevronRight className="portal-breadcrumb-chevron" aria-hidden="true" />
                <span className="portal-breadcrumb-current">{page}</span>
              </div>
              <div className="portal-topbar-actions">
                <Button variant="outline" render={<Link to="/admin/credits?allocate=new" />} className="portal-header-credit">
                  <Plus aria-hidden="true" />Allocate credits
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" className="portal-account" aria-label={`Account menu for ${username}`} />}>
                    <Avatar className="portal-account-avatar">
                      <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="portal-account-copy"><strong>{username}</strong><span>Super admin</span></span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="portal-account-menu">
                    <div className="px-2 py-2">
                      <p className="truncate text-sm font-semibold">{username}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{user?.email}</p>
                      <span className="portal-role-badge">{user?.role || "Super admin"}</span>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem render={<Link to="/reseller" />}><ArrowUpRight aria-hidden="true" />Client console</DropdownMenuItem>
                    <DropdownMenuItem disabled={isLoggingOut} onClick={signOut}><LogOut aria-hidden="true" />{isLoggingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <div id="admin-main" tabIndex={-1} className="portal-main">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
