import { MoreHorizontal } from "lucide-react";
import { Link } from "react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export default function RowActionsMenu({ name, actions }) {
  const mobile = useIsMobile();
  const Trigger = mobile ? SheetTrigger : DropdownMenuTrigger;
  const Item = mobile ? SheetClose : DropdownMenuItem;
  const title = `Actions for ${name}`;
  const trigger = (
    <Trigger render={<Button variant="ghost" size="icon" aria-label={title} />}>
      <MoreHorizontal aria-hidden="true" />
    </Trigger>
  );
  const items = actions.map(({ label, icon: Icon, onClick, to, disabled, destructive }) => (
    <Item
      key={label}
      disabled={disabled}
      onClick={onClick}
      render={to ? <Link to={to} /> : undefined}
      {...(mobile ? {
        nativeButton: !to,
        className: cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-offset-0 disabled:opacity-50",
          destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent hover:text-accent-foreground",
        ),
      } : {
        variant: destructive ? "destructive" : "default",
        className: "min-h-9 gap-2.5 px-2.5 py-2",
      })}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Item>
  ));

  if (mobile) {
    return (
      <Sheet>
        {trigger}
        <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-2xl">
          <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
          <div className="detail-sheet-body">
            <div className="grid gap-1">{items}</div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align="end" className="w-52 p-1.5">{items}</DropdownMenuContent>
    </DropdownMenu>
  );
}
