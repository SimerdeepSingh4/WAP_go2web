import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Contact,
  Building2,
  Wallet,
  ReceiptText,
  SlidersHorizontal,
  LogOut,
  ChevronDown,
  MessageSquare,
  ArrowUpRight,
  PlusCircle,
} from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { create } from "zustand";
import { useAdminQuery } from "../hooks/useAdmin";

const useNavigation = create((set) => ({ open: true, setOpen: (open) => set({ open }) }));

const workspaceNavigation = [
  { title: "Overview", path: "/admin", icon: LayoutDashboard },
  { title: "Campaigns", path: "/admin/campaigns", icon: Megaphone, badgeKey: "pendingCampaigns" },
  { title: "Audience & Contacts", path: "/admin/contacts", icon: Contact },
  { title: "Reports", path: "/admin/reports", icon: ReceiptText },
];

const adminNavigation = [
  { title: "Resellers", path: "/admin/resellers", icon: Building2 },
  { title: "Users", path: "/admin/users", icon: Users },
  { title: "Credits", path: "/admin/credits", icon: Wallet },
  { title: "Activity", path: "/admin/activity", icon: ReceiptText },
  { title: "Limits & hours", path: "/admin/settings", icon: SlidersHorizontal },
];

function Navigation() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const campaignsQuery = useAdminQuery("campaigns");

  const campaigns = campaignsQuery.data?.data || [];
  const pendingCount = campaigns.filter((c) =>
    ["pending", "scheduled"].includes(c.status)
  ).length;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/admin" />} className="gap-3 hover:bg-transparent">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-4.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold tracking-tight leading-none">go2web</span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider mt-0.5">Admin Portal</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="pt-3">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {workspaceNavigation.map(({ title, path, icon: Icon, badgeKey }) => {
                const isSelected = path === "/admin" ? pathname === "/admin" : pathname.startsWith(path);
                const badgeValue = badgeKey === "pendingCampaigns" ? pendingCount : 0;

                return (
                  <SidebarMenuItem key={path}>
                    <SidebarMenuButton
                      isActive={isSelected}
                      tooltip={title}
                      render={<NavLink to={path} end={path === "/admin"} />}
                      onClick={() => setOpenMobile(false)}
                      className="h-9 justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="size-4" />
                        <span>{title}</span>
                      </div>
                      {badgeValue > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          {badgeValue}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {adminNavigation.map(({ title, path, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    isActive={pathname === path}
                    tooltip={title}
                    render={<NavLink to={path} />}
                    onClick={() => setOpenMobile(false)}
                    className="h-9"
                  >
                    <Icon className="size-4" />
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

export default function AdminLayout() {
  const { user, logout, isLoggingOut } = useAuth();
  const { pathname } = useLocation();
  const { open, setOpen } = useNavigation();

  const allNav = [...workspaceNavigation, ...adminNavigation];
  const activeItem = allNav.find((item) => (item.path === "/admin" ? pathname === "/admin" : pathname.startsWith(item.path)));
  const page = activeItem?.title || "Overview";
  const groupLabel = workspaceNavigation.some((item) => (item.path === "/admin" ? pathname === "/admin" : pathname.startsWith(item.path)))
    ? "Workspace"
    : "Administration";

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
      <a href="#admin-main" className="sr-only z-[100] rounded bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <TooltipProvider>
        <SidebarProvider open={open} onOpenChange={setOpen} style={{ "--sidebar-width": "15rem" }}>
          <Navigation />
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger aria-label="Toggle navigation" />
                <span className="hidden text-sm text-muted-foreground sm:inline">{groupLabel}</span>
                <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">/</span>
                <span className="truncate text-sm font-semibold">{page}</span>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden md:inline-flex items-center gap-1.5 text-xs h-8"
                  render={<Link to="/admin/credits?allocate=new" />}
                >
                  <PlusCircle className="size-3.5" />
                  Allocate Credits
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" className="h-10 gap-2" aria-label="Account menu" />}>
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {user?.username?.slice(0, 2).toUpperCase() || "SA"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden flex-col items-start text-left sm:flex">
                      <span className="max-w-32 truncate text-xs font-medium leading-none">{user?.username}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">Super Admin</span>
                    </div>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <div className="px-2 py-2">
                      <p className="truncate text-sm font-medium">{user?.username}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                      <Badge variant="outline" className="mt-2 text-[10px] border-purple-200 bg-purple-50 text-purple-700">
                        {user?.role}
                      </Badge>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem render={<Link to="/reseller" />}>
                      <ArrowUpRight className="size-4 mr-2" />
                      Client Console
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isLoggingOut} onClick={signOut}>
                      <LogOut className="size-4 mr-2" />
                      Sign out
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
