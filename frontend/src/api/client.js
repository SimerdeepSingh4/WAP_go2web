import axios from "axios";
import { attachCreditRequestKey, settleCreditRequest } from "./creditRequest";
import { getSessionRequestScope, isSessionRequestCurrent, isSessionControlInProgress } from "./sessionToken";
import { isSessionRejection } from "@/features/auth/lib/sessionFailure";

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3000/api" : "/api"),
    withCredentials: true, // Sends HTTP-only session cookies automatically
    headers: {
        "Content-Type": "application/json",
        "X-App-Request": "1",
    },
});

function sessionChangedError() {
    return Object.assign(new Error("Your browser session changed. Please try again after this tab refreshes."), { code: "BROWSER_SESSION_CHANGED" });
}

// Ordinary requests use cookies; only explicit account access sends a Bearer token.
apiClient.interceptors.request.use(
    async (config) => {
        const scope = getSessionRequestScope();
        config.sessionScope = scope;
        const context = config.accountContextOverride || scope.context;
        if (context) {
            config.headers["X-Account-Context"] = context;
            if (!config.accountContextOverride && scope.token) config.headers.Authorization = `Bearer ${scope.token}`;
        } else {
            config.headers.delete("Authorization");
        }
        const authCheck = /\/auth\/(?:me|login)(?:\?|$)/.test(config.url || "");
        if (!authCheck && !config.accountContextOverride && scope.accountId) {
            config.headers["X-Expected-Account"] = scope.accountId;
            if (scope.sessionId) config.headers["X-Expected-Session"] = scope.sessionId;
        }
        if (typeof FormData !== "undefined" && config.data instanceof FormData) {
            config.headers.delete("Content-Type");
        }
        return attachCreditRequestKey(config);
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: global error handling & auto logout trigger
apiClient.interceptors.response.use(
    (response) => {
        if (!isSessionRequestCurrent(response.config.sessionScope, response.config.sessionControl)) throw sessionChangedError();
        settleCreditRequest(response.config);
        return response;
    },
    (error) => {
        if (!isSessionRequestCurrent(error.config?.sessionScope, error.config?.sessionControl)) return Promise.reject(sessionChangedError());
        if (error.response?.data?.code === "BROWSER_SESSION_CHANGED") {
            window.dispatchEvent(new CustomEvent("auth:session-changed"));
            return Promise.reject(sessionChangedError());
        }
        // A timeout or server error can occur after commit. Retain the request
        // reference so retrying returns its receipt instead of moving credits twice.
        if (error.response?.status >= 400 && error.response.status < 500 && error.response.status !== 409) settleCreditRequest(error.config);
        if (error.response?.data?.isAccountExpired || error.response?.data?.isAccountBlocked) {
            window.dispatchEvent(new CustomEvent("auth:access-changed", {
                detail: error.response.data,
            }));
        }

        // Handle 401 Unauthorized (e.g. session evicted when 4th device logged in)
        const isAuthCheck = /\/auth\/me(?:\?|$)/.test(error.config?.url || "");
        if (!isAuthCheck && !isSessionControlInProgress() && isSessionRejection(error, false)) {
            // Optional: notify app or clear local auth state if needed
            window.dispatchEvent(new CustomEvent("auth:unauthorized", {
                detail: error.response?.data || { message: "Session expired" }
            }));
        }

        // Return standardized error message
        const message =
            error.response?.data?.message ||
            error.message ||
            "Something went wrong. Please try again.";

        const normalizedError = new Error(message);
        normalizedError.response = error.response;
        normalizedError.code = error.code;
        normalizedError.isAccountBlocked = Boolean(error.response?.data?.isAccountBlocked);
        return Promise.reject(normalizedError);
    }
);

export default apiClient;
