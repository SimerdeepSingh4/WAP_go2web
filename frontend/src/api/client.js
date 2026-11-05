import axios from "axios";
import { attachCreditRequestKey, settleCreditRequest } from "./creditRequest";
import { getSessionToken } from "./sessionToken";

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? "/api" : "http://localhost:3000/api"),
    withCredentials: true, // Sends HTTP-only session cookies automatically
    headers: {
        "Content-Type": "application/json",
    },
});

// Request Interceptor: attaches Bearer token if stored in localStorage (fallback for mobile/non-cookie environments)
apiClient.interceptors.request.use(
    async (config) => {
        const token = getSessionToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return attachCreditRequestKey(config);
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: global error handling & auto logout trigger
apiClient.interceptors.response.use(
    (response) => { settleCreditRequest(response.config); return response; },
    (error) => {
        // A timeout or server error can occur after commit. Retain the request
        // reference so retrying returns its receipt instead of moving credits twice.
        if (error.response?.status >= 400 && error.response.status < 500 && error.response.status !== 409) settleCreditRequest(error.config);
        if (error.response?.data?.isAccountExpired) {
            window.dispatchEvent(new CustomEvent("auth:expired", {
                detail: error.response.data,
            }));
        }

        // Handle 401 Unauthorized (e.g. session evicted when 4th device logged in)
        const isAuthCheck = /\/auth\/me(?:\?|$)/.test(error.config?.url || "");
        if (error.response?.data?.isLoggedOut || isAuthCheck || error.response?.data?.isAccountBlocked) {
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
