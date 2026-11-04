import axios from "axios";

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
    withCredentials: true, // Sends HTTP-only session cookies automatically
    headers: {
        "Content-Type": "application/json",
    },
});

// Request Interceptor: attaches Bearer token if stored in localStorage (fallback for mobile/non-cookie environments)
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: global error handling & auto logout trigger
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.data?.isAccountExpired) {
            window.dispatchEvent(new CustomEvent("auth:expired", {
                detail: error.response.data,
            }));
        }

        // Handle 401 Unauthorized (e.g. session evicted when 4th device logged in)
        if (error.response?.status === 401 || error.response?.data?.isAccountBlocked) {
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
        normalizedError.isAccountBlocked = Boolean(error.response?.data?.isAccountBlocked);
        return Promise.reject(normalizedError);
    }
);

export default apiClient;
