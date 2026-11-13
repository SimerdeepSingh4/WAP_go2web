import { createContext, useContext, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMe, login as loginApi, register as registerApi, logout as logoutApi, logoutAll as logoutAllApi } from "../services/auth.api.js";
import { clearCurrentSessionToken, setSessionToken } from "@/api/sessionToken";
import { toast } from "@/components/ui/toast";
import { isSessionRejection } from "../lib/sessionFailure";
import AuthConnectionNotice from "../components/AuthConnectionNotice";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const queryClient = useQueryClient();

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
        queryFn: async () => {
            try {
                const response = await getMe();
                if (!response.user) throw new Error("Session verification returned an incomplete response.");
                return response.user;
            } catch (err) {
                if (isSessionRejection(err, true)) {
                    clearCurrentSessionToken();
                    return null;
                }
                // React Query retains the last verified user when a refresh fails.
                throw err;
            }
        },
        retry: false,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });

    const user = authData ?? null;

    // 2. Login Mutation
    const loginMutation = useMutation({
        mutationFn: (credentials) => loginApi(credentials),
        onSuccess: (data) => {
            if (data.token) {
                setSessionToken(data.token);
            }
            // Update query cache with logged-in user
            queryClient.setQueryData(["authUser"], data.user);
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
        onSuccess: (data) => {
            if (data.token) {
                setSessionToken(data.token);
            }
            queryClient.setQueryData(["authUser"], data.user);
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
        },
    });

    // 4. Logout Mutation
    const logoutMutation = useMutation({
        mutationFn: logoutApi,
        onSuccess: () => {
            clearCurrentSessionToken();
            queryClient.setQueryData(["authUser"], null);
            queryClient.removeQueries({ queryKey: ["activeSessions"] });
        },
        onError: () => {
            // Even if server request fails, clear local session
            clearCurrentSessionToken();
            queryClient.setQueryData(["authUser"], null);
        },
    });

    // 5. Logout All Devices Mutation
    const logoutAllMutation = useMutation({
        mutationFn: logoutAllApi,
        onSuccess: () => {
            clearCurrentSessionToken();
            queryClient.setQueryData(["authUser"], null);
            queryClient.removeQueries({ queryKey: ["activeSessions"] });
        },
        onError: () => {
            clearCurrentSessionToken();
            queryClient.setQueryData(["authUser"], null);
        },
    });

    // 5. Listen for auto-logout (e.g. 1st device evicted when 4th logs in)
    useEffect(() => {
        const handleUnauthorized = () => {
            clearCurrentSessionToken();
            queryClient.setQueryData(["authUser"], null);
        };

        const handleAccountExpired = (event) => {
            queryClient.setQueryData(["authUser"], (current) => current ? ({
                ...current,
                isExpired: true,
                expiresAt: event.detail?.expiresAt || current.expiresAt,
            }) : current);
        };

        window.addEventListener("auth:unauthorized", handleUnauthorized);
        window.addEventListener("auth:expired", handleAccountExpired);
        return () => {
            window.removeEventListener("auth:unauthorized", handleUnauthorized);
            window.removeEventListener("auth:expired", handleAccountExpired);
        };
    }, [queryClient]);

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
        isLoading,
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
    return <AuthContext.Provider value={value}>
        {connectionIssue && !user ? <AuthConnectionNotice fullPage retrying={isFetching && !isPaused} onRetry={() => checkAuth()} /> : children}
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
