import { CalendarClock, ChevronDown, RotateCw, ShieldOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { whiteLabelAccessState } from "@/features/branding/lib/whiteLabelAccess";
import { dateTime } from "@/lib/format";
import "@/features/accounts/components/account-access-menu.css";

const labels = { active: "Active", disabled: "Disabled", expired: "Expired" };
export function WhiteLabelStateBadge({ state }) {
  return <Badge variant="outline" className="portal-status font-normal" data-tone={state === "active" ? "success" : state === "expired" ? "warning" : "neutral"}>{labels[state]}</Badge>;
}

export default function WhiteLabelAccessMenu({ account, onSelect, disabled = false }) {
  const access = account.whiteLabel || {};
  const state = whiteLabelAccessState(access);
  const expiry = access.expiresAt ? `${state === "expired" ? "Expired" : "Expires"} ${dateTime(access.expiresAt)}` : "No expiry";
  const action = state === "disabled" ? { intent: "enable", label: "Enable access", description: "Allow custom branding and a subdomain.", Icon: Sparkles }
    : state === "expired" ? { intent: "renew", label: "Renew access", description: "Choose a new duration to restore branding.", Icon: RotateCw }
    : { intent: "expiry", label: "Manage expiry", description: "Change how long access stays active.", Icon: CalendarClock };
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" className="portal-status account-state-pill white-label-access-trigger" data-tone={state === "active" ? "success" : state === "expired" ? "warning" : "neutral"} disabled={disabled} aria-label={`White-label access for ${account.username}, currently ${labels[state]}`} />}>
      <span className="account-state-dot" aria-hidden="true" />{labels[state]}<ChevronDown aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="account-access-menu white-label-access-menu">
      <DropdownMenuLabel className="account-menu-heading">White-label access<strong>{account.username}</strong>{state !== "disabled" && <small>{expiry}</small>}</DropdownMenuLabel>
      <DropdownMenuItem className="account-menu-option" onClick={() => onSelect(action.intent)}>
        <span className="account-menu-icon"><action.Icon aria-hidden="true" /></span><span className="account-menu-copy"><span>{action.label}</span><small>{action.description}</small></span>
      </DropdownMenuItem>
      {access.enabled && <DropdownMenuItem className="account-menu-option" variant="destructive" onClick={() => onSelect("disable")}>
        <span className="account-menu-icon"><ShieldOff aria-hidden="true" /></span><span className="account-menu-copy"><span>Disable access</span><small>Turn off custom branding for this reseller.</small></span>
      </DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
