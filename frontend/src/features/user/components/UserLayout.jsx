import { Link, NavLink, Outlet, useLocation } from "react-router";
import { LayoutDashboard, Users, Wallet, ReceiptText, SlidersHorizontal, LogOut, ChevronDown, MessageSquare } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";

// Navigation for regular users (role: "User")
const navigation = [
  { title: "Overview", path: "/user", icon: LayoutDashboard },
  { title: "Credits", path: "/user/credits", icon: Wallet },
  { title: "Activity", path: "/user/activity", icon: ReceiptText },
  { title: "Settings", path: "/user/settings", icon: SlidersHorizontal },
];

function Navigation() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/user" />} className="gap-3 hover:bg-transparent">
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
              {navigation.map(({ title, path, icon: Icon }) => (
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
      </SidebarContent>
    </Sidebar>
  );
}

export default function UserLayout() {
  const { user, logout, isLoggingOut } = useAuth();
  const { pathname } = useLocation();
  const page = navigation.find((item) => item.path === pathname)?.title || "Overview";

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
              <div className="flex items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" className="h-10 gap-2" aria-label="Account menu" />}>
                    <Avatar className="size-7">
                      <AvatarFallback className="bg-muted text-xs">{user?.username?.slice(0, 2).toUpperCase() || "U"}</AvatarFallback>
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
            <main id="admin-main" tabIndex={-1} className="portal-main mx-auto w-full min-w-0 max-w-[1600px] flex-1 space-y-6 p-4 outline-none sm:p-6 lg:p-8">
              <Outlet />
            </main>
            </SidebarInset>
            </SidebarProvider>
        </TooltipProvider>
        </div>
    );
}
