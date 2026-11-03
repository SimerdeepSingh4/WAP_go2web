<<<<<<< HEAD
import AdminLayout from "../../admin/components/AdminLayout.jsx";

export default AdminLayout;
=======
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { LayoutDashboard, Megaphone, Users, Building2, Wallet, ReceiptText, Settings, LogOut, ChevronDown, MessageSquare, ArrowUpRight, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useResellerQuery } from "../hooks/useReseller";
import { number } from "@/features/admin/lib/format";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { create } from "zustand";

// Simple navigation mirroring admin but scoped to reseller routes
const navigation = [
  { title: "Overview", path: "/reseller", icon: LayoutDashboard },
  { title: "Campaigns", path: "/reseller/campaigns", icon: Megaphone },
  { title: "Reports", path: "/reseller/reports", icon: ReceiptText },
  // Resellers management is not applicable for a reseller user
  { title: "Users", path: "/reseller/users", icon: Users },
  { title: "Credits", path: "/reseller/credits", icon: Wallet },
  { title: "Activity", path: "/reseller/activity", icon: ReceiptText },
  { title: "Settings", path: "/reseller/settings", icon: Settings },
];

function Navigation() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/reseller" />} className="gap-3 hover:bg-transparent">
              <MessageSquare className="text-primary" />
              <span className="text-base font-semibold tracking-tight">go2web</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pt-3">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navigation.slice(0, 3).map(({ title, path, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton isActive={pathname === path} tooltip={title} render={<NavLink to={path} end />} onClick={() => setOpenMobile(false)} className="h-9">
                    <Icon />
                    <span>{title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navigation.slice(3).map(({ title, path, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton isActive={pathname === path} tooltip={title} render={<NavLink to={path} />} onClick={() => setOpenMobile(false)} className="h-9">
                    <Icon />
                    <span>{title}</span>
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

export default function ResellerLayout() {
  const { user, logout, isLoggingOut } = useAuth();
  const { pathname } = useLocation();
  const page = navigation.find((item) => item.path === pathname)?.title || "Overview";
  const myBalance = useResellerQuery("myBalance");
  const wallet = myBalance.data?.wallet;
  const isLocked = Boolean(wallet?.isLocked);

  async function signOut() {
    try {
      await logout();
      toast.add({ title: "Signed out", type: "success" });
    } catch (error) {
      toast.add({ title: "Sign out failed", description: error.message, type: "error" });
    }
  }

  return (
    <div className="admin-portal">
      <TooltipProvider>
        <SidebarProvider>
          <Navigation />
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger aria-label="Toggle navigation" />
                <span className="hidden text-sm text-muted-foreground sm:inline">Workspace</span>
                <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">/</span>
                <span className="truncate text-sm font-medium">{page}</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Live Wallet Balance Pill */}
                {wallet && (
                  <Link
                    to="/reseller/credits"
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      isLocked
                        ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                        : "border-border bg-muted/40 text-foreground hover:bg-muted"
                    }`}
                    title={isLocked ? "Credits are expired & locked" : "Available Credits"}
                  >
                    {isLocked ? (
                      <>
                        <Lock className="size-3.5 text-red-600 shrink-0" />
                        <span className="tabular-nums font-bold text-red-700">{number(wallet.balance)}</span>
                        <span className="rounded bg-red-200/80 px-1 py-0.2 text-[9px] font-bold text-red-800 uppercase">
                          Locked
                        </span>
                      </>
                    ) : (
                      <>
                        <Wallet className="size-3.5 text-primary shrink-0" />
                        <span className="tabular-nums">{number(wallet.balance)} credits</span>
                      </>
                    )}
                  </Link>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" className="h-10 gap-2" aria-label="Account menu" />}>
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-muted text-xs">{user?.username?.slice(0, 2).toUpperCase() || "R"}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-32 truncate text-sm sm:inline">{user?.username}</span>
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <div className="px-2 py-2">
                      <p className="truncate text-sm font-medium">{user?.username}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={isLoggingOut} onClick={signOut}>
                      <LogOut />Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main id="admin-main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 space-y-6 p-4 outline-none sm:p-6 lg:p-8">
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
>>>>>>> 64fa90846221c3aef2ece508ff2b9b2e919d20a6
