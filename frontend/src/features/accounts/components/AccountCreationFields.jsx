import { useState } from "react";
import { Eye, EyeOff, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { generateTemporaryPassword } from "../lib/accountCredentials";
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

export function AccountCreationPassword({ onChange, ...props }) {
  const [visible, setVisible] = useState(false);

  function handleGenerate() {
    const generated = generateTemporaryPassword();
    setVisible(true);
    onChange?.({ target: { value: generated } });
  }

  return (
    <div className="account-create-password">
      <Input {...props} onChange={onChange} type={visible ? "text" : "password"} />
      <div className="account-create-password-actions">
        <button
          type="button"
          className="account-create-password-generate"
          onClick={handleGenerate}
          aria-label="Generate random password"
          title="Generate random password"
        >
          <RefreshCw aria-hidden="true" />
          <span>Generate</span>
        </button>
        <button
          type="button"
          className="account-create-password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function AccountCreationLabel({ label }) {
  return label.includes("(optional)") ? <>{label.replace(" (optional)", "")} <span className="account-create-optional">Optional</span></> : label;
}
