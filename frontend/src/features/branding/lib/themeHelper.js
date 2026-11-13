/**
 * Dynamically applies white-label branding (colors, title, favicon) to the DOM.
 */
export function applyBrandColors(branding) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    // Remove legacy inline overrides so derived tokens also respond to dark mode.
    for (const token of ["primary", "primary-hover", "ring", "sidebar-primary", "secondary", "secondary-hover", "accent"]) {
        root.style.removeProperty(`--${token}`);
    }
    const validColor = color => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color || "");
    const primary = branding?.primaryColor;
    if (!validColor(primary)) {
        delete root.dataset.branded;
        for (const token of ["brand-primary", "brand-secondary", "brand-accent", "brand-button-text"]) root.style.removeProperty(`--${token}`);
        return;
    }
    let hex = primary.slice(1);
    if (hex.length === 3) hex = [...hex].map(char => char + char).join("");
    const channels = hex.match(/../g).map(value => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-secondary", validColor(branding.secondaryColor) ? branding.secondaryColor : primary);
    root.style.setProperty("--brand-accent", validColor(branding.accentColor) ? branding.accentColor : primary);
    root.style.setProperty("--brand-button-text", luminance > 0.179 ? "#1f1a1a" : "#ffffff");
    root.dataset.branded = "true";
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

