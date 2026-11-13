import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import "./account-creation.css";

export function AccountCreationFields({ fields, renderField }) {
  const identity = new Set(["username", "email", "companyName", "phone"]);
  return <div className="account-create-sections">{[
    { title: "Account details", description: "Who this account belongs to", icon: UserRound, fields: fields.filter(field => identity.has(field.key)) },
    { title: "Access & billing", description: "Set sign-in details, pricing and ownership", icon: ShieldCheck, fields: fields.filter(field => !identity.has(field.key)) },
  ].filter(section => section.fields.length).map(({ title, description, icon: Icon, fields: sectionFields }) => <section className="account-create-section" key={title}>
    <div className="account-create-section-heading"><span><Icon aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div></div>
    <div className="account-create-field-grid">{sectionFields.map(renderField)}</div>
  </section>)}</div>;
}

export function AccountCreationPassword(props) {
  const [visible, setVisible] = useState(false);
  return <div className="account-create-password"><Input {...props} type={visible ? "text" : "password"} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>;
}

export function accountCreationLabel(label) {
  return label.includes("(optional)") ? <>{label.replace(" (optional)", "")} <span className="account-create-optional">Optional</span></> : label;
}

export const accountCreationPlaceholders = { username: "e.g. Alex Morgan", email: "name@company.com", companyName: "e.g. Northstar Media", phone: "+91 98765 43210", password: "At least 8 characters", ratePerMsg: "e.g. 1.00" };
