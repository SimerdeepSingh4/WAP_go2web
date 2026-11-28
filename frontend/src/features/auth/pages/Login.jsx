import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { DEFAULT_BRANDING, useBranding } from "@/features/branding/context/branding-context";
import { useAuth } from "../hooks/useAuth";
import { forgotPassword as forgotPasswordApi } from "../services/auth.api";
import "./login.css";

const inputClasses =
  "min-h-12 w-full rounded-lg border border-muted-foreground/60 bg-card px-3.5 py-2.5 text-base outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:bg-muted";

const labelClasses = "mb-2 block text-sm leading-6 font-medium";

const primaryButtonClasses =
  "flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-65";

const textButtonClasses =
  "inline-flex min-h-6 cursor-pointer items-center gap-1.5 rounded-sm text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const errorClasses =
  "rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm leading-relaxed text-destructive";

export default function LoginPage({ onLogin, panelName: propPanelName }) {
  const { branding } = useBranding();
  const panelName = propPanelName || branding.brandName || DEFAULT_BRANDING.brandName;
  const brandLogo = branding.logoUrl || DEFAULT_BRANDING.logoUrl;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const errorRef = useRef(null);
  const identifierRef = useRef(null);

  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState("");

  const { login, isLoggingIn } = useAuth();

  function returnToSignIn() {
    setIsForgotPassword(false);
    setForgotSent(false);
    setForgotError("");
    requestAnimationFrame(() => identifierRef.current?.focus());
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    const query = forgotIdentifier.trim();
    if (!query) return;

    setForgotLoading(true);
    setForgotError("");
    try {
      const res = await forgotPasswordApi(query);
      setForgotSent(true);
      setForgotMsg(
        res?.message ||
          "If an account with that email or username exists, a password reset notification has been sent."
      );
    } catch (err) {
      setForgotError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to submit request. Please try again."
      );
    } finally {
      setForgotLoading(false);
    }
  }

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
      setErrorMsg(
        err.message || "Unable to sign in. Check your details and try again."
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  const headingId = isForgotPassword ? "forgot-heading" : "login-heading";

  return (
    <main className="login-page grid min-h-dvh bg-card font-sans text-card-foreground antialiased">
      <header className="login-page__brand flex min-w-0 items-center gap-3">
        <img
          src={brandLogo}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 object-contain"
        />
        <span className="min-w-0 wrap-anywhere text-xl font-semibold tracking-tight">
          {panelName}
        </span>
      </header>

      <section aria-labelledby={headingId} className="login-page__form min-w-0">
        <h1 id={headingId} className="text-[2rem] leading-tight font-semibold tracking-tight sm:text-4xl">
          {isForgotPassword ? "Forgot password?" : "Welcome back."}
        </h1>

        {isForgotPassword ? (
          <>
            {forgotSent ? (
              <div
                role="status"
                className="mt-7 flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Request sent</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{forgotMsg}</p>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Enter your email or username to request a password reset.
                </p>

                <form onSubmit={handleForgotSubmit} aria-busy={forgotLoading} className="mt-7 space-y-5">
                  {forgotError && (
                    <div role="alert" className={errorClasses}>
                      {forgotError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="forgot-identifier" className={labelClasses}>
                      Email or username
                    </label>
                    <input
                      id="forgot-identifier"
                      name="forgot-identifier"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoFocus
                      required
                      value={forgotIdentifier}
                      onChange={(event) => setForgotIdentifier(event.target.value)}
                      disabled={forgotLoading}
                      className={inputClasses}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotIdentifier.trim()}
                    className={primaryButtonClasses}
                  >
                    <span role="status">
                      {forgotLoading ? "Sending request…" : "Send reset request"}
                    </span>
                    {forgotLoading ? (
                      <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </form>
              </>
            )}

            <button
              type="button"
              onClick={returnToSignIn}
              className={`mt-5 ${textButtonClasses}`}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Sign in to your messaging workspace.
            </p>

            <form onSubmit={handleSubmit} aria-busy={isLoggingIn} className="mt-6 space-y-5">
              {errorMsg && (
                <div
                  ref={errorRef}
                  id="login-error"
                  role="alert"
                  tabIndex={-1}
                  className={`${errorClasses} outline-none focus-visible:ring-2 focus-visible:ring-destructive/30`}
                >
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="identifier" className={labelClasses}>
                  Email or username
                </label>
                <input
                  ref={identifierRef}
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                  disabled={isLoggingIn}
                  aria-describedby={errorMsg ? "login-error" : undefined}
                  className={inputClasses}
                />
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
                  <label htmlFor="password" className="text-sm leading-6 font-medium">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setForgotIdentifier(identifier.trim());
                      setForgotSent(false);
                      setForgotMsg("");
                      setForgotError("");
                    }}
                    className={textButtonClasses}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={isLoggingIn}
                    aria-describedby={errorMsg ? "login-error" : undefined}
                    className={`${inputClasses} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-controls="password"
                    className="absolute inset-y-1 right-1 grid w-10 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="size-[18px]" aria-hidden="true" />
                    ) : (
                      <Eye className="size-[18px]" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoggingIn} className={primaryButtonClasses}>
                <span role="status">{isLoggingIn ? "Signing in…" : "Sign in"}</span>
                {isLoggingIn ? (
                  <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            </form>

            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Need access? Contact your account administrator.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="login-intro" className="login-page__intro min-w-0">
        <h2
          id="login-intro"
          className="text-[clamp(2.5rem,4vw,3.375rem)] leading-[1.06] font-semibold tracking-[-0.045em]"
        >
          Direct outreach.
          <br />
          Reliable delivery.
        </h2>
        <p className="mt-4 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
          Send targeted campaigns and see which messages reach your contacts.
        </p>
      </section>
    </main>
  );
}
