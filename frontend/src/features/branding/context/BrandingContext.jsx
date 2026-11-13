import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { resolveBranding } from "../services/branding.api.js";
import { applyBrandingToDOM } from "../lib/themeHelper";
import { useAuthContext } from "@/features/auth/context/auth.context.jsx";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULT_BRANDING = {
    isWhiteLabeled: false,
    brandName: "Promotion",
    logoUrl: "https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp",
    primaryColor: "",
    secondaryColor: "",
    accentColor: "",
    subdomain: "",
};

const BrandingContext = createContext({
    branding: DEFAULT_BRANDING,
    isWhiteLabeled: false,
    isLoading: true,
    refreshBranding: async () => {},
    setCustomBranding: () => {},
});

export function BrandingProvider({ children }) {
    const queryClient = useQueryClient();
    const auth = useAuthContext();
    const user = auth?.user;
    const [subdomainBranding, setSubdomainBranding] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const detectSubdomain = useCallback(() => {
        if (typeof window === "undefined") return null;

        // Check for test/preview override query parameter e.g. "?brand=acme"
        const params = new URLSearchParams(window.location.search);
        const queryBrand = params.get("brand");
        if (queryBrand) return queryBrand.trim().toLowerCase();

        // Check window.location.hostname
        const host = window.location.hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1") return null;

        const parts = host.split(".");
        // e.g. "acme.localhost" -> length 2 and ends with localhost
        if (parts.length === 2 && parts[1] === "localhost") {
            return parts[0];
        }

        // e.g. "acme.wapgo2web.com" or "acme.onrender.com"
        if (parts.length >= 3) {
            const sub = parts[0];
            if (sub && sub !== "www" && sub !== "api" && sub !== "admin") {
                return sub;
            }
        }

        return null;
    }, []);

    const fetchBranding = useCallback(async () => {
        try {
            const subdomain = detectSubdomain();
            if (subdomain) {
                const res = await resolveBranding({ subdomain });
                if (res) {
                    setSubdomainBranding(res);
                }
            } else {
                setSubdomainBranding(null);
            }
        } catch (err) {
            console.warn("Could not resolve subdomain branding:", err);
            setSubdomainBranding(null);
        } finally {
            setIsLoading(false);
        }
    }, [detectSubdomain]);

    useEffect(() => {
        fetchBranding();
    }, [fetchBranding]);

    // Compute effective branding:
    // Priority:
    // 1. If Super Admin: always default platform view.
    // 2. If logged in Reseller with active white-label: use their own white-label.
    // 3. If logged in User with reseller white-label: use their reseller's white-label.
    // 4. If visitor on a resolved subdomain: use subdomain branding.
    // 5. Otherwise: default platform branding.
    const effectiveBranding = useMemo(() => {
        if (user?.role === "Super Admin") {
            return DEFAULT_BRANDING;
        }

        if (user?.whiteLabel?.isActive) {
            return {
                isWhiteLabeled: true,
                subdomain: user.whiteLabel.subdomain || "",
                brandName: user.whiteLabel.brandName || DEFAULT_BRANDING.brandName,
                logoUrl: user.whiteLabel.logoUrl || DEFAULT_BRANDING.logoUrl,
                primaryColor: user.whiteLabel.primaryColor || "",
                secondaryColor: user.whiteLabel.secondaryColor || "",
                accentColor: user.whiteLabel.accentColor || "",
            };
        }

        if (subdomainBranding && subdomainBranding.isWhiteLabeled) {
            return subdomainBranding;
        }

        return DEFAULT_BRANDING;
    }, [user, subdomainBranding]);

    // Apply colors, favicon, title whenever effective branding changes
    useEffect(() => {
        applyBrandingToDOM(effectiveBranding);
    }, [effectiveBranding]);

    const setCustomBranding = useCallback((newBranding) => {
        // Keep authenticated branding in sync; it has priority over subdomain data.
        if (user?.role === "Reseller" && user.whiteLabel?.isActive) {
            queryClient.setQueryData(["authUser"], current => current ? {
                ...current,
                whiteLabel: { ...current.whiteLabel, ...newBranding },
            } : current);
        }
        setSubdomainBranding((prev) => ({
            ...prev,
            ...newBranding,
            isWhiteLabeled: true,
        }));
    }, [queryClient, user?.role, user?.whiteLabel?.isActive]);

    const value = useMemo(
        () => ({
            branding: effectiveBranding,
            isWhiteLabeled: Boolean(effectiveBranding?.isWhiteLabeled),
            isLoading,
            refreshBranding: fetchBranding,
            setCustomBranding,
        }),
        [effectiveBranding, isLoading, fetchBranding, setCustomBranding]
    );

    return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
    return useContext(BrandingContext);
}

