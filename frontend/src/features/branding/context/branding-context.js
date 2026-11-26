import { createContext, useContext } from "react";
import { brandColors } from "../../../../../shared/brandingColors.js";

export const DEFAULT_BRANDING = {
    isWhiteLabeled: false,
    brandName: "Promotion",
    logoUrl: "https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp",
    ...brandColors(),
    subdomain: "",
};

export const BrandingContext = createContext({
    branding: DEFAULT_BRANDING,
    isWhiteLabeled: false,
    isLoading: true,
    refreshBranding: async () => {},
    setCustomBranding: () => {},
});

export function useBranding() {
    return useContext(BrandingContext);
}
