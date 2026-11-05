import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { setImpersonationToken } from "@/api/sessionToken";

export default function ImpersonationHandoff() {
  const { checkAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(() => window.opener ? "" : "Open this page from the superadmin account list.");

  useEffect(() => {
    const opener = window.opener;
    if (!opener) return undefined;

    let active = true;
    async function receiveSession(event) {
      if (
        event.origin !== window.location.origin ||
        event.source !== opener ||
        event.data?.type !== "FULL_ACCESS_SESSION" ||
        typeof event.data.token !== "string"
      ) return;

      window.removeEventListener("message", receiveSession);
      setImpersonationToken(event.data.token);
      try {
        const result = await checkAuth();
        const account = result.data;
        if (!active) return;
        if (!account?.isImpersonation) {
          sessionStorage.removeItem("impersonationToken");
          setError("The account session could not be verified. Close this tab and try again.");
          return;
        }
        navigate(account.role === "Reseller" ? "/reseller" : "/user", { replace: true });
      } catch {
        if (active) setError("The account session could not be verified. Close this tab and try again.");
      }
    }

    window.addEventListener("message", receiveSession);
    opener.postMessage({ type: "FULL_ACCESS_READY" }, window.location.origin);
    return () => {
      active = false;
      window.removeEventListener("message", receiveSession);
    };
  }, [checkAuth, navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-lg font-semibold text-foreground">Opening account</h1>
        <p className="text-sm text-muted-foreground">
          {error || "Waiting for a secure account session from the superadmin tab…"}
        </p>
      </div>
    </main>
  );
}