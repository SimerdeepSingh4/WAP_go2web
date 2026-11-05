const AUTH_TOKEN_KEY = "authToken";
const IMPERSONATION_TOKEN_KEY = "impersonationToken";

export function getSessionToken() {
    const impersonationToken = sessionStorage.getItem(IMPERSONATION_TOKEN_KEY);
    if (impersonationToken) return impersonationToken;

    let token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
        token = localStorage.getItem("token");
        if (token) {
            sessionStorage.setItem(AUTH_TOKEN_KEY, token);
            localStorage.removeItem("token");
        }
    }
    return token;
}

export function setSessionToken(token) {
    if (!token) return;
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.removeItem("token");
}

export function setImpersonationToken(token) {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, token);
}

export function clearCurrentSessionToken() {
    if (sessionStorage.getItem(IMPERSONATION_TOKEN_KEY)) {
        sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
    } else {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
    localStorage.removeItem("token");
}