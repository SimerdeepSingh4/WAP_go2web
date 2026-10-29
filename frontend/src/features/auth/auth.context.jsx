import { createContext, useContext, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMe, login as loginApi, register as registerApi, logout as logoutApi, logoutAll as logoutAllApi } from "./services/auth.api";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const queryClient = useQueryClient();

    // 1. Fetch current authenticated user via TanStack Query
    const {
        data: authData,
        isLoading,
        isFetching,
        refetch: checkAuth,
    } = useQuery({
        queryKey: ["authUser"],
        queryFn: async () => {
            try {
                const response = await getMe();
                return response.user ?? null;
            } catch (err) {
                // If 401 or not logged in, return null
                return null;
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
                localStorage.setItem("token", data.token);
            }
            // Update query cache with logged-in user
            queryClient.setQueryData(["authUser"], data.user);
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
        },
    });

    // 3. Register Mutation
    const registerMutation = useMutation({
        mutationFn: (credentials) => registerApi(credentials),
        onSuccess: (data) => {
            if (data.token) {
                localStorage.setItem("token", data.token);
            }
            queryClient.setQueryData(["authUser"], data.user);
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
        },
    });

    // 4. Logout Mutation
    const logoutMutation = useMutation({
        mutationFn: logoutApi,
        onSuccess: () => {
            localStorage.removeItem("token");
            queryClient.setQueryData(["authUser"], null);
            queryClient.removeQueries({ queryKey: ["activeSessions"] });
        },
        onError: () => {
            // Even if server request fails, clear local session
            localStorage.removeItem("token");
            queryClient.setQueryData(["authUser"], null);
        },
    });

    // 5. Logout All Devices Mutation
    const logoutAllMutation = useMutation({
        mutationFn: logoutAllApi,
        onSuccess: () => {
            localStorage.removeItem("token");
            queryClient.setQueryData(["authUser"], null);
            queryClient.removeQueries({ queryKey: ["activeSessions"] });
        },
        onError: () => {
            localStorage.removeItem("token");
            queryClient.setQueryData(["authUser"], null);
        },
    });

    // 5. Listen for auto-logout (e.g. 1st device evicted when 4th logs in)
    useEffect(() => {
        const handleUnauthorized = () => {
            localStorage.removeItem("token");
            queryClient.setQueryData(["authUser"], null);
        };

        window.addEventListener("auth:unauthorized", handleUnauthorized);
        return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
    }, [queryClient]);

    const value = {
        user,
        isLoading,
        isFetching,
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

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuthContext must be used within an AuthProvider");
    }
    return context;
};
