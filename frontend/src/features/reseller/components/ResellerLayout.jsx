import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  ArrowUpRight,
  ChevronDown,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Plus,
  PlusCircle,
  ReceiptText,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { create } from "zustand";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useResellerQuery } from "../hooks/useReseller";
import { number } from "@/features/admin/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";

const useNavigation = create((set) => ({
  open: true,
  setOpen: (open) => set({ open }),
}));

const workspaceNavigation = [
  { title: "Overview", path: "/reseller", icon: LayoutDashboard },
  {
    title: "Campaigns",
    path: "/reseller/campaigns",
    icon: Megaphone,
    badgeKey: "pendingCampaigns",
  },
  { title: "Reports", path: "/reseller/reports", icon: ReceiptText },
];

const adminNavigation = [
  { title: "Users", path: "/reseller/users", icon: Users },
  { title: "Credits", path: "/reseller/credits", icon: Wallet },
  { title: "Activity", path: "/reseller/activity", icon: ReceiptText },
  { title: "Settings", path: "/reseller/settings", icon: Settings },
];

const allNavigation = [...workspaceNavigation, ...adminNavigation];

function matchesPath(pathname, path) {
  return path === "/reseller"
    ? pathname === path
    : pathname === path || pathname.startsWith(`${path}/`);
}

function Navigation() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const campaignsQuery = useResellerQuery("campaigns");
  const campaigns = campaignsQuery.data?.data || [];
  const pendingCount = campaigns.filter((campaign) =>
    ["pending", "scheduled"].includes(campaign.status)
  ).length;

  function renderNavigation(items) {
    return items.map(({ title, path, icon: Icon, badgeKey }) => {
      const badgeValue = badgeKey === "pendingCampaigns" ? pendingCount : 0;

      return (
        <SidebarMenuItem key={path}>
          <SidebarMenuButton
            isActive={matchesPath(pathname, path)}
            tooltip={title}
            render={<NavLink to={path} end={path === "/reseller"} />}
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
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to="/reseller" />}
              className="gap-3 hover:bg-transparent"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold leading-none tracking-tight">
                  go2web
                </span>
                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Reseller Portal
                </span>
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
              {renderNavigation(workspaceNavigation)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {renderNavigation(adminNavigation)}
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
  const { open, setOpen } = useNavigation();
  const activeItem = [...allNavigation]
    .sort((left, right) => right.path.length - left.path.length)
    .find((item) => matchesPath(pathname, item.path));
  const page = activeItem?.title || "Overview";
  const groupLabel = workspaceNavigation.some((item) =>
    matchesPath(pathname, item.path)
  )
    ? "Workspace"
    : "Administration";

  const myBalance = useResellerQuery("myBalance");
  const wallet = myBalance.data?.wallet;
  const isLocked = Boolean(wallet?.isLocked);

  async function signOut() {
    try {
      await logout();
      toast.add({ title: "Signed out", type: "success" });
    } catch (error) {
      toast.add({
        title: "Sign out failed",
        description:
          error instanceof Error ? error.message : "Something went wrong",
        type: "error",
      });
    }
  }

  return (
    <div className="admin-portal">
      <a
        href="#reseller-main"
        className="sr-only z-[100] rounded bg-background p-3 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only"
      >
        Skip to content
      </a>
      <TooltipProvider>
        <SidebarProvider
          open={open}
          onOpenChange={setOpen}
          style={{ "--sidebar-width": "15rem" }}
        >
          <Navigation />
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger aria-label="Toggle navigation" />
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {groupLabel}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden text-muted-foreground sm:inline"
                >
                  /
                </span>
                <span className="truncate text-sm font-semibold">{page}</span>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3">
                {wallet && (
                  <Link
                    to="/reseller/credits"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      isLocked
                        ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                        : "border-border bg-muted/40 text-foreground hover:bg-muted"
                    }`}
                    title={
                      isLocked
                        ? "Credits are expired and locked"
                        : "Available Credits"
                    }
                  >
                    {isLocked ? (
                      <>
                        <Lock className="size-3.5 shrink-0 text-red-600" />
                        <span className="font-bold tabular-nums text-red-700 dark:text-red-400">
                          {number(wallet.balance)}
                        </span>
                        <span className="rounded bg-red-200/80 px-1 py-0.5 text-[9px] font-bold uppercase text-red-800 dark:bg-red-900 dark:text-red-200">
                          Locked
                        </span>
                      </>
                    ) : (
                      <>
                        <Wallet className="size-3.5 shrink-0 text-primary" />
                        <span className="font-semibold tabular-nums">
                          {number(wallet.balance)} credits
                        </span>
                      </>
                    )}
                  </Link>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="hidden h-8 items-center gap-1.5 text-xs md:inline-flex"
                  render={<Link to="/reseller/credits?allocate=new" />}
                  disabled={isLocked}
                >
                  <PlusCircle className="size-3.5" />
                  Allocate Credits
                </Button>

                <Button
                  size="sm"
                  className="hidden h-8 items-center gap-1.5 text-xs font-semibold sm:inline-flex"
                  render={<Link to="/reseller/campaigns/create" />}
                  disabled={isLocked}
                >
                  <Plus className="size-3.5" />
                  Create Campaign
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        className="h-10 gap-2"
                        aria-label="Account menu"
                      />
                    }
                  >
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {user?.username?.slice(0, 2).toUpperCase() || "RP"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden flex-col items-start text-left sm:flex">
                      <span className="max-w-32 truncate text-xs font-medium leading-none">
                        {user?.username}
                      </span>
                      <span className="mt-0.5 text-[10px] text-muted-foreground">
                        Reseller Partner
                      </span>
                    </div>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-60">
                    <div className="px-2 py-2">
                      <p className="truncate text-sm font-medium">
                        {user?.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user?.email}
                      </p>
                      <Badge
                        variant="outline"
                        className="mt-2 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        {user?.role || "Reseller"}
                      </Badge>
                    </div>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem render={<Link to="/reseller/settings" />}>
                      <Settings className="mr-2 size-4" />
                      Account Settings
                    </DropdownMenuItem>
                    {user?.role === "Super Admin" && (
                      <DropdownMenuItem render={<Link to="/admin" />}>
                        <ArrowUpRight className="mr-2 size-4" />
                        Super Admin Portal
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      disabled={isLoggingOut}
                      onClick={signOut}
                    >
                      <LogOut className="mr-2 size-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <main
              id="reseller-main"
              tabIndex={-1}
              className="portal-main mx-auto w-full min-w-0 max-w-[1600px] flex-1 space-y-6 p-4 outline-none sm:p-6 lg:p-8"
            >
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
