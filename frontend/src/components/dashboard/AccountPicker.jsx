import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getAccountOptions } from "@/features/accounts/services/accountPicker.api";
import "./account-picker.css";

export default function AccountPicker({ id, label, value, onChange, options, disabled, accountSearch }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["account-picker", user?.id || user?._id, user?.role, accountSearch, debounced],
    queryFn: ({ signal }) => getAccountOptions({ ...accountSearch, q: debounced }, signal),
    enabled: open && !disabled,
    staleTime: 15000,
    retry: false,
  });
  const waiting = search.trim() !== debounced || query.isFetching;
  const ownId = String(user?.id || user?._id || "");
  const special = options.filter(option => !/^[a-f\d]{24}$/i.test(String(option.value)) || String(option.value) === ownId);
  const allowed = new Set(options.map(option => String(option.value)));
  const results = (waiting ? [] : query.data?.users || []).filter(account => allowed.has(String(account._id))).map(account => ({
    value: account._id,
    label: account.username,
    description: [account.companyName, account.email, account.phone].filter(Boolean).join(" · "),
    role: account.role,
  }));
  const visible = [...special, ...results];
  const selected = options.find(option => String(option.value) === String(value)) || null;
  return <Combobox.Root items={visible} filteredItems={visible} value={selected} isItemEqualToValue={(a, b) => a.value === b.value} onValueChange={option => { if (option) onChange(option.value); }} inputValue={search} onInputValueChange={setSearch} open={open} onOpenChange={next => { setOpen(next); if (!next) { setSearch(""); setDebounced(""); } }} disabled={disabled}>
    <Combobox.Trigger id={id} aria-label={label} className="account-picker-trigger" data-slot="select-trigger">
      <span>{selected?.label || "Select account"}</span><ChevronsUpDown aria-hidden="true" />
    </Combobox.Trigger>
    <Combobox.Portal><Combobox.Positioner align="start" sideOffset={6} className="account-picker-positioner"><Combobox.Popup className="account-picker-popup">
      <div className="account-picker-search"><Search aria-hidden="true" /><Combobox.Input aria-label={`Search ${label.toLowerCase()}`} placeholder="Name, company, email, phone or ID..." maxLength={120} /></div>
      <Combobox.List className="account-picker-list">{option => <Combobox.Item key={option.value} value={option} className="account-picker-option">
        <span className="account-picker-option-copy"><span className="account-picker-option-title">{option.label}{option.role && <small>{option.role}</small>}</span>{option.description && <span className="account-picker-description">{option.description}</span>}</span>
        <Combobox.ItemIndicator><Check aria-hidden="true" /></Combobox.ItemIndicator>
      </Combobox.Item>}</Combobox.List>
      <div role="status" className="account-picker-status">{waiting ? <><Loader2 className="animate-spin" aria-hidden="true" />Searching accounts...</> : query.isError ? <><span>Could not load accounts.</span><button type="button" onClick={() => query.refetch()}>Retry</button></> : !results.length ? "No matching accounts." : query.data?.hasMore ? "More matches available. Type more to narrow your search." : "Search by name, company, email, phone or account ID."}</div>
    </Combobox.Popup></Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
}
