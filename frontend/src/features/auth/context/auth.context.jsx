import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMe, sessionUser, login as loginApi, register as registerApi, logout as logoutApi, logoutAll as logoutAllApi } from "../services/auth.api.js";
import { clearCurrentSessionToken, getAccountContext, getSessionToken, leaveAccountContext, invalidateSessionRequests, rememberVerifiedSession, publishBrowserSessionChange, subscribeBrowserSessionChanges, browserSessionRevision } from "@/api/sessionToken";
import { toast } from "@/components/ui/toast";
import { isSessionRejection } from "../lib/sessionFailure";
import AuthConnectionNotice from "../components/AuthConnectionNotice";

export const AuthContext = createContext(null);
const identityKey = user => user ? `${user.id || user._id}:${user.sessionId || ""}:${user.role}:${Boolean(user.isPreview)}:${Boolean(user.isImpersonation)}` : "";

export const AuthProvider = ({ children }) => {
    const queryClient = useQueryClient();
    const previousIdentity = useRef(undefined);
    const syncing = useRef(false);
    const syncAgain = useRef(false);
    const [transitioning, setTransitioning] = useState(false);
    const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
    const clearWorkspace = useCallback(async () => {
        await queryClient.cancelQueries({ predicate: query => query.queryKey[0] !== "authUser" });
        queryClient.removeQueries({ predicate: query => query.queryKey[0] !== "authUser" });
        queryClient.getMutationCache().clear();
    }, [queryClient]);
    const applyIdentity = useCallback(async next => {
        const key = identityKey(next);
        if (previousIdentity.current !== undefined && previousIdentity.current !== key) {
            invalidateSessionRequests();
            await clearWorkspace();
            setWorkspaceGeneration(value => value + 1);
        }
        previousIdentity.current = key;
        rememberVerifiedSession(next);
        return next;
    }, [clearWorkspace]);

    // 1. Fetch current authenticated user via TanStack Query
    const {
        data: authData,
        isLoading,
        isFetching,
        isPaused,
        error: authError,
        refetch: checkAuth,
    } = useQuery({
        queryKey: ["authUser"],
        queryFn: async ({ signal }) => {
            try {
                const response = await getMe(signal);
                if (!response.user) throw new Error("Session verification returned an incomplete response.");
                return await applyIdentity(sessionUser(response));
            } catch (err) {
                if (isSessionRejection(err, true)) {
                    clearCurrentSessionToken();
                    return await applyIdentity(null);
                }
                // React Query retains the last verified user when a refresh fails.
                throw err;
            }
        },
        retry: false,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        refetchInterval: 30000,
    });

    const identityPending = previousIdentity.current !== undefined && identityKey(authData) !== previousIdentity.current;
    const user = transitioning || identityPending ? null : authData ?? null;

    // 2. Login Mutation
    const loginMutation = useMutation({
        mutationFn: (credentials) => loginApi(credentials),
        onSuccess: async (data) => {
            leaveAccountContext();
            publishBrowserSessionChange("login");
            const next = await applyIdentity(sessionUser(data));
            queryClient.setQueryData(["authUser"], next);
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
            if (data?.user?.username) {
                toast.add({
                    title: `Welcome back, ${data.user.username}!`,
                    type: "success",
                });
            }
        },
    });

    // 3. Register Mutation
    const registerMutation = useMutation({
        mutationFn: (credentials) => registerApi(credentials),
        onSuccess: () => {
            // Registration creates a managed account; it never signs in as it.
            queryClient.invalidateQueries({ queryKey: ["admin"] });
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
        },
    });

    const finishLogout = async () => {
        if (!getAccountContext()) publishBrowserSessionChange("logout");
        clearCurrentSessionToken();
        const next = await applyIdentity(null);
        queryClient.setQueryData(["authUser"], next);
    };

    // A failed network request cannot clear an HttpOnly cookie, so keep the
    // verified session until the server confirms sign-out.
    const logoutMutation = useMutation({
        mutationFn: logoutApi,
        onSuccess: finishLogout,
    });

    // 5. Logout All Devices Mutation
    const logoutAllMutation = useMutation({
        mutationFn: logoutAllApi,
        onSuccess: finishLogout,
    });

    // 5. Listen for auto-logout (e.g. 1st device evicted when 4th logs in)
    useEffect(() => {
        const synchronize = async (browserChange = false) => {
            if (syncing.current) { syncAgain.current = true; return; }
            syncing.current = true;
            setTransitioning(true);
            try {
                do {
                    syncAgain.current = false;
                    const revision = browserSessionRevision();
                    invalidateSessionRequests();
                    if (getAccountContext() && browserChange) clearCurrentSessionToken();
                    await queryClient.cancelQueries();
                    await clearWorkspace();
                    queryClient.setQueryData(["authUser"], null);
                    await queryClient.refetchQueries({ queryKey: ["authUser"], exact: true });
                    if (browserSessionRevision() !== revision) syncAgain.current = true;
                } while (syncAgain.current);
            }
            finally { syncing.current = false; setTransitioning(false); }
        };
        const handleUnauthorized = () => { void synchronize(); };
        const handleBrowserChange = () => { void synchronize(true); };
        const recheck = () => { if (document.visibilityState !== "hidden") void queryClient.invalidateQueries({ queryKey: ["authUser"] }); };
        const unsubscribe = subscribeBrowserSessionChanges(handleBrowserChange);

        const handleAccountExpired = (event) => {
            queryClient.setQueryData(["authUser"], (current) => current ? ({
                ...current,
                status: event.detail?.status || (event.detail?.isAccountBlocked ? "blocked" : "expired"),
                isExpired: Boolean(event.detail?.isAccountExpired),
                isBlocked: Boolean(event.detail?.isAccountBlocked),
                accessReason: event.detail?.accessReason ?? current.accessReason,
                expiresAt: event.detail?.expiresAt ?? current.expiresAt,
            }) : current);
        };

        window.addEventListener("auth:unauthorized", handleUnauthorized);
        window.addEventListener("auth:session-changed", handleBrowserChange);
        window.addEventListener("focus", recheck);
        window.addEventListener("pageshow", recheck);
        document.addEventListener("visibilitychange", recheck);
        window.addEventListener("auth:access-changed", handleAccountExpired);
        return () => {
            window.removeEventListener("auth:unauthorized", handleUnauthorized);
            window.removeEventListener("auth:session-changed", handleBrowserChange);
            window.removeEventListener("focus", recheck);
            window.removeEventListener("pageshow", recheck);
            document.removeEventListener("visibilitychange", recheck);
            unsubscribe();
            window.removeEventListener("auth:access-changed", handleAccountExpired);
        };
    }, [queryClient, clearWorkspace]);

    useEffect(() => {
        if (!user?.expiresAt || user.isExpired) return undefined;
        const expiresAt = new Date(user.expiresAt).getTime();
        if (!Number.isFinite(expiresAt)) return undefined;

        let timer;
        const checkExpiry = () => {
            const remaining = expiresAt - Date.now();
            if (remaining <= 0) {
                queryClient.setQueryData(["authUser"], (current) => current ? ({ ...current, isExpired: true }) : current);
                return;
            }
            timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_000_000));
        };
        checkExpiry();
        return () => clearTimeout(timer);
    }, [user?.expiresAt, user?.isExpired, queryClient]);

    const value = {
        user,
        isLoading: isLoading || transitioning || identityPending,
        workspaceGeneration,
        isFetching,
        authError,
        isAuthenticated: !!user,
        login: loginMutation.mutateAsync,
        isLoggingIn: loginMutation.isPending,
        loginError: loginMutation.error,
        register: registerMutation.mutateAsync,
        isRegistering: registerMutation.isPending,
        registerError: registerMutation.error,
        logout: logoutMutation.mutateAsync,
        isLoggingOut: logoutMutation.isPending,
        logoutAll: logoutAllMutation.mutateAsync,
        isLoggingOutAll: logoutAllMutation.isPending,
        checkAuth,
    };

    const connectionIssue = Boolean(authError || isPaused);
    const contextEnded = getAccountContext() && !user && !isLoading && !transitioning;
    if (transitioning || identityPending) return <main role="status" className="grid min-h-svh place-items-center bg-background text-sm">Updating your browser session…</main>;
    return <AuthContext.Provider value={value}>
        {contextEnded && !getSessionToken() ? <main className="grid min-h-svh place-items-center bg-background p-6"><div className="max-w-md space-y-4 text-center"><h1 className="text-lg font-semibold">Account access ended</h1><p className="text-sm text-muted-foreground">Your manager session changed or this account access session ended.</p><button className="rounded-md border px-4 py-2 text-sm" onClick={() => { leaveAccountContext(); window.location.replace("/"); }}>Return to signed-in account</button></div></main> : connectionIssue && !user ? <AuthConnectionNotice fullPage retrying={isFetching && !isPaused} onRetry={() => checkAuth()} /> : <div className="contents" key={workspaceGeneration}>{children}</div>}
        {connectionIssue && user && <AuthConnectionNotice retrying={isFetching && !isPaused} onRetry={() => checkAuth()} />}
    </AuthContext.Provider>;
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuthContext must be used within an AuthProvider");
    }
    return context;
};
