import React, { useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";

function PortalIcon({ type = "network", className = "size-5" }) {
  const paths = {
    network:
      "M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4 M6 16v-4h12v4",
    credits:
      "M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v2 M20 10h-6v5h6 M16 12.5h.01",
    campaign: "m21 3-7 18-4-7-7-4L21 3Z M21 3 10 14",
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[type]} />
    </svg>
  );
}

function PanelBrand({ name }) {
  return (
    <div className="inline-flex items-center gap-3 text-foreground">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-accent text-primary shadow-xs">
        <PortalIcon type="network" className="size-5" />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.3px]">
        {name}
      </span>
    </div>
  );
}

function CampaignWorkflowIllustration() {
  const stages = [
    {
      title: "Audience & Contacts",
      description: "Organize customer lists and targeted segments.",
      icon: "network",
    },
    {
      title: "Create & Personalize",
      description: "Draft rich broadcast templates and media messages.",
      icon: "credits",
    },
    {
      title: "High-Speed Delivery",
      description: "Send instantly with real-time delivery reports.",
      icon: "campaign",
    },
  ];

  return (
    <div aria-hidden="true" className="mt-8 border-y border-border py-5">
      <div className="flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[1.8px] text-muted-foreground">
        <span>Campaign workflow</span>
      </div>

      <ol className="pt-5 pb-4 space-y-4">
        {stages.map((stage, index) => (
          <li
            key={stage.title}
            className="relative flex items-center gap-3.5"
          >
            {index < stages.length - 1 && (
              <span className="absolute top-9 bottom-[-16px] left-[19px] w-px bg-border" />
            )}
            <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground shadow-xs">
              <PortalIcon type={stage.icon} className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-foreground">
                  {stage.title}
                </p>
                <span className="font-mono text-[11px] font-semibold text-primary">
                  0{index + 1}
                </span>
              </div>
              <p className="text-xs leading-normal text-muted-foreground mt-0.5">
                {stage.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function LoginPage({ onLogin, panelName = "go2web" }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const errorRef = useRef(null);

  const { login, isLoggingIn } = useAuth();

  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoggingIn) return;

    setErrorMsg("");

    try {
      const data = await login({
        identifier: identifier.trim(),
        password,
      });

      if (data?.success && data?.user) {
        if (onLogin) {
          onLogin(data.user);
        }
      } else {
        setErrorMsg(data?.message || "Invalid credentials.");
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch (err) {
      setErrorMsg(err.message || "Unable to sign in. Check your details and try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  const inputClasses =
    "min-h-[46px] w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-3 focus:ring-primary/15 disabled:cursor-wait disabled:bg-muted transition-all";

  return (
    <main className="grid h-screen max-h-screen w-full bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-primary md:grid-cols-[0.95fr_1.05fr] lg:grid-cols-2 overflow-hidden">
      {/* Left Column: Branding & Editorial Story */}
      <section
        aria-label="About your business messaging portal"
        className="hidden min-w-0 h-full flex-col justify-between border-r border-border bg-muted/40 px-10 py-10 md:flex lg:px-14 xl:px-20 lg:py-12 overflow-hidden"
      >
        <PanelBrand name={panelName} />

        <div className="w-full max-w-[480px] my-auto py-4">
          <p className="text-xs font-semibold uppercase tracking-[2px] text-primary">
            Connect • Broadcast • Engage
          </p>
          <h1 className="mt-3.5 mb-3.5 text-3xl lg:text-[40px] xl:text-[44px] leading-[1.12] font-semibold tracking-tight text-foreground">
            Direct outreach.
            <br />
            Reliable delivery.
          </h1>
          <p className="max-w-[400px] text-sm leading-relaxed text-muted-foreground">
            Launch targeted WhatsApp campaigns, manage customer directories, and track deliverability metrics with enterprise precision.
          </p>
          <CampaignWorkflowIllustration />
        </div>

        <p className="text-xs text-muted-foreground">
          Built for dependable, high-volume customer communication.
        </p>
      </section>

      {/* Right Column: Clean Editorial Form */}
      <section
        aria-labelledby="login-heading"
        className="flex h-full min-w-0 flex-col justify-between bg-background px-8 py-10 sm:px-12 md:px-12 lg:px-16 xl:px-24 lg:py-12 overflow-y-auto md:overflow-hidden"
      >
        <div className="md:hidden">
          <PanelBrand name={panelName} />
        </div>

        <div className="flex flex-1 items-center justify-center py-4">
          <div className="w-full max-w-[420px]">
            <p className="text-[11px] font-semibold uppercase tracking-[2px] text-primary">
              Messaging Workspace
            </p>
            <h2
              id="login-heading"
              className="mt-2 text-3xl sm:text-[36px] font-bold tracking-tight text-foreground"
            >
              Welcome back.
            </h2>
            <p className="mt-1.5 mb-7 text-sm text-muted-foreground">
              Sign in to manage campaigns, audience directories, and credits.
            </p>

            {errorMsg && (
              <div
                ref={errorRef}
                id="login-error"
                role="alert"
                tabIndex={-1}
                className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} aria-busy={isLoggingIn} className="space-y-5">
              <div>
                <label htmlFor="identifier" className="mb-2 block text-sm font-medium text-foreground">
                  Email or Username
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="Enter your email or username"
                  required
                  disabled={isLoggingIn}
                  aria-describedby={errorMsg ? "login-error" : undefined}
                  className={inputClasses}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-foreground">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={isLoggingIn}
                    aria-describedby={errorMsg ? "login-error" : undefined}
                    className={`${inputClasses} pr-18`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-controls="password"
                    aria-pressed={showPassword}
                    className="absolute inset-y-1 right-1.5 min-w-14 cursor-pointer rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none transition-colors"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="flex min-h-[46px] w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-primary hover:bg-primary/90 px-5 py-3 text-sm font-semibold text-primary-foreground transition-all shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70 mt-3"
              >
                <span role="status" aria-live="polite">
                  {isLoggingIn ? "Signing in…" : "Sign in"}
                </span>
                {isLoggingIn ? (
                  <svg aria-hidden="true" className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h15m-6-6 6 6-6 6" />
                  </svg>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Need access? Contact your account administrator.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {panelName}
          <span aria-hidden="true" className="mx-2.5 text-border">/</span>
          Business Messaging Platform
        </p>
      </section>
    </main>
  );
}
