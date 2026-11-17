import { ArrowRight } from "lucide-react";
import UserAvatar from "./UserAvatar";

export function AccountAccessIdentity({ account }) {
  return <div className="access-account-identity"><UserAvatar user={account} className="size-10 shrink-0" /><div><strong>{account.username}</strong><span>{account.email || account.role}</span></div></div>;
}

export function AccountAccessSummary({ current, next }) {
  return <div className="access-change-summary"><div><span>Current</span>{current}</div><ArrowRight aria-hidden="true" /><div><span>After confirmation</span>{next}</div></div>;
}
