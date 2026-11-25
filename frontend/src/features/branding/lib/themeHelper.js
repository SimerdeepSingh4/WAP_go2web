import { BRAND_COLOR_FIELDS, BRAND_COLOR_PATTERN } from "../../../../../shared/brandingColors.js";

export function pickerColor(value, fallback) {
    const color = value?.trim();
    if (!BRAND_COLOR_PATTERN.test(color || "")) return fallback;
    return color.length === 4 ? "#" + [...color.slice(1)].map(char => char + char).join("") : color;
}

function contrastingText(hex) {
    const channels = hex.slice(1).match(/../g).map(value => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return luminance > 0.179 ? "#000000" : "#ffffff";
}

export function applyBrandColors(branding, preview) {
    if (typeof document === "undefined") return;
    const root = preview || document.documentElement;
    function applyColor(property, value) {
        if (value || preview) root.style.setProperty(property, value || "initial");
        else root.style.removeProperty(property);
    }
    for (const [key, [, token]] of Object.entries(BRAND_COLOR_FIELDS)) {
        if (token.endsWith("-foreground")) continue;
        const color = pickerColor(branding?.[key]);
        applyColor("--brand-" + token, color);
        if (["primary", "sidebar", "header", "kpi"].includes(token) || token.startsWith("kpi-")) {
            const foreground = "--brand-" + token + "-foreground";
            const text = color && contrastingText(color);
            applyColor(foreground, text);
            if (token.startsWith("kpi")) {
                applyColor("--brand-" + token + "-shade", text && (text === "#ffffff" ? "#000000" : "#ffffff"));
            }
        }
    }
    const autoContrasted = new Set([
        "primary-foreground",
        "sidebar-foreground",
        "header-foreground",
        "kpi-campaigns-foreground",
        "kpi-network-foreground",
        "kpi-users-foreground",
        "kpi-credits-foreground",
    ]);
    for (const [key, [, token]] of Object.entries(BRAND_COLOR_FIELDS)) {
        if (!token.endsWith("-foreground")) continue;
        const color = pickerColor(branding?.[key]);
        if (color || !autoContrasted.has(token)) {
            applyColor("--brand-" + token, color);
        }
        if (color && token.startsWith("kpi-")) {
            const base = token.slice(0, -"-foreground".length);
            applyColor("--brand-" + base + "-shade", contrastingText(color) === "#000000" ? "#000000" : "#ffffff");
        }
    }
    if (pickerColor(branding?.primaryColor)) root.dataset.branded = "true";
    else delete root.dataset.branded;
    root.toggleAttribute("data-custom-kpi", Boolean(pickerColor(branding?.kpiColor)));
}

export function applyBrandingToDOM(branding) {
    if (typeof document === "undefined") return;
    applyBrandColors(branding);

    // 2. Document Title
    const brandTitle = branding?.brandName?.trim();
    if (brandTitle) {
        if (!document.title.includes(brandTitle)) {
            document.title = brandTitle;
        }
    }

    // 3. Favicon
    if (branding?.logoUrl) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement("link");
            link.rel = "shortcut icon";
            document.head.appendChild(link);
        }
        link.href = branding.logoUrl;
    }
}

