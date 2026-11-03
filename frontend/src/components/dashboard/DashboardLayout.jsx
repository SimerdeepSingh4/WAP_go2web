import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { LayoutDashboard, Megaphone, Users, Contact, Building2, Wallet, ReceiptText, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import PreviewBanner from "@/components/PreviewBanner";

const rolePaths = { "Super Admin": "/admin", Reseller: "/reseller", User: "/user" };
const navigation = {
  "Super Admin": [["Overview", "", LayoutDashboard], ["Campaigns", "/campaigns", Megaphone], ["Reports", "/reports", ReceiptText], ["Contacts", "/contacts", Contact], ["Super admins", "/administrators", Users], ["Resellers", "/resellers", Building2], ["Users", "/users", Users], ["Credits", "/credits", Wallet], ["Transactions", "/activity", ReceiptText], ["Settings", "/settings", Settings]],
  Reseller: [["Overview", "", LayoutDashboard], ["Campaigns", "/campaigns", Megaphone], ["Reports", "/reports", ReceiptText], ["Users", "/users", Users], ["Credits", "/credits", Wallet], ["Transactions", "/activity", ReceiptText], ["Settings", "/settings", Settings]],
  User: [["Overview", "", LayoutDashboard], ["Campaigns", "/campaigns", Megaphone], ["Credits", "/credits", Wallet], ["Transactions", "/activity", ReceiptText], ["Settings", "/settings", Settings]],
};

function Navigation({ role, base, items }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return <Sidebar collapsible="icon" className="portal-sidebar">
    <SidebarHeader className="portal-sidebar-header"><SidebarMenu><SidebarMenuItem>
      <SidebarMenuButton size="lg" render={<Link to={base} aria-label="Promotion home" />} onClick={() => setOpenMobile(false)} className="portal-brand">
        <span className="portal-brand-mark"><img src="https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp" alt="Promotion" className="size-full object-contain" /></span>
        <span className="portal-brand-copy"><strong>Promotion<span>.</span></strong><span>{role === "Super Admin" ? "Super admin" : role}</span></span>
      </SidebarMenuButton>
    </SidebarMenuItem></SidebarMenu></SidebarHeader>
    <SidebarContent className="portal-sidebar-content"><SidebarGroup className="portal-nav-group"><SidebarGroupContent><SidebarMenu className="gap-1">
      {items.map(([label, path, Icon]) => <SidebarMenuItem key={path}>
        <SidebarMenuButton isActive={path ? pathname.startsWith(`${base}${path}`) : pathname === base} tooltip={label} render={<NavLink to={`${base}${path}`} end={!path} />} onClick={() => setOpenMobile(false)} className="portal-nav-link">
          <Icon aria-hidden="true" /><span className="portal-nav-text">{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
    </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    <div className="portal-sidebar-footer"><p>Promotion · {role === "Super Admin" ? "Super admin" : role}</p></div>
  </Sidebar>;
}

export default function DashboardLayout({ role }) {
  const { user, logout, isLoggingOut } = useAuth();
  const [open, setOpen] = useState(true);
  const { pathname } = useLocation();
  const base = rolePaths[role];
  const items = navigation[role];
  // Keep a manager's data out of a workspace labelled for another role.
  if (user?.role !== role) return <Navigate to={rolePaths[user?.role] || "/login"} replace />;
  const page = /\/campaigns\/(create|new)$/.test(pathname) ? "Create campaign" : [...items].reverse().find(([, path]) => pathname.startsWith(`${base}${path}`))?.[0] || "Overview";
  const username = user?.username || role;
  async function signOut() {
    try { await logout(); }
    catch (error) { toast.add({ title: "Sign out failed", description: error.message, type: "error" }); }
  }
  return <div className="admin-portal dashboard-portal">
    {role !== "Super Admin" && <PreviewBanner />}
    <a href="#dashboard-main" className="portal-skip-link">Skip to content</a>
    <TooltipProvider><SidebarProvider open={open} onOpenChange={setOpen} style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" }} className="portal-shell">
      <Navigation role={role} base={base} items={items} />
      <SidebarInset className="portal-inset">
        <header className="portal-topbar">
          <div className="portal-breadcrumb"><SidebarTrigger aria-label="Toggle navigation" className="portal-sidebar-trigger" /><span className="portal-breadcrumb-divider" aria-hidden="true" /><span className="portal-breadcrumb-current">{page}</span></div>
          <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" className="portal-account h-auto py-1 px-2.5 rounded-lg" aria-label={`Account menu for ${username}`} />}>
            <Avatar className="portal-account-avatar"><AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <span className="portal-account-copy"><strong>{username}</strong><span>{role === "Super Admin" ? "Super admin" : role}</span></span><ChevronDown aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger><DropdownMenuContent align="end" className="portal-account-menu">
            <div className="p-2 text-sm break-all">{user?.email}</div><DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={`${base}/settings`} />}><Settings aria-hidden="true" />Settings</DropdownMenuItem>
            <DropdownMenuItem disabled={isLoggingOut} onClick={signOut}><LogOut aria-hidden="true" />{isLoggingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </header>
        <main id="dashboard-main" tabIndex={-1} className="portal-main"><Outlet /></main>
      </SidebarInset>
    </SidebarProvider></TooltipProvider>
  </div>;
}
