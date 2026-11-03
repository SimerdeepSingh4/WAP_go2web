# go2web responsive dashboard update

## Apply the update

1. Replace the five JSX files at their existing locations in your project. Keep their current filenames and relative locations.
2. Put `admin-dashboard.css` in the **same directory as `AdminLayout.jsx`**. The updated layout imports it with `import "./admin-dashboard.css"`.
3. Keep your existing shared components, chart components, hooks, utilities, routes, and auth services. No new runtime packages are required beyond the dependencies already imported by the original files.
4. Run your project's normal build and check the actual API responses and custom charts before deploying.

The ZIP contains the five replacement components, the required CSS file, and this guide. It does not contain a replacement application, mock data, or preview dependencies.

| File | Changes |
| --- | --- |
| `AdminLayout.jsx` | Quieter navigation, green active states, compact account menu, mobile drawer links, correct active states for nested routes, keyboard skip link. |
| `Overview.jsx` | Clear page hierarchy, linked metric cards, explicit missing values, consistent actions, partial refresh failure feedback. |
| `OverviewWorkPanel.jsx` | Campaign queue with responsive rows, compact operational shortcuts, reseller list, brown credit panel. |
| `OverviewCharts.jsx` | Consistent chart containers, responsive legends and delivery totals, native date-range selector, accessible data tables, empty states. |
| `OperatingRules.jsx` | Responsive settings categories, keyboard tabs, larger controls, field validation, draft reset, unsaved-change feedback, sticky save controls, session error handling. |
| `admin-dashboard.css` | Scoped light theme, container-based grids, mobile layout rules, focus styles, reduced-motion support. |

## Design choices

The palette combines deep green `#166B50`, warm brown `#805B3C`, off-white `#F6F8F7`, white cards, and muted borders. Green marks primary actions; brown distinguishes credit-related content.

The layout adapts to the available **content width**, including when the sidebar is expanded or collapsed. Totals use one, two, or four columns. Operational and settings panels stack when their content becomes too narrow. Campaign titles and reseller emails truncate within their rows; large numeric values can wrap without pushing cards outside the viewport.

Design references reviewed:

- [Linear's March 2026 UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh): consistent view controls, restrained navigation, and clearer emphasis on the main workspace.
- [shadcn Base UI sidebar](https://ui.shadcn.com/docs/components/base/sidebar): existing sidebar composition and responsive behavior. The original `render` API is preserved.

## Existing behavior and integration limits

- Existing routes, query names, analytics helper calls, report semantics, and auth service imports are preserved.
- **Operating preferences still save to `localStorage` under `admin_platform_settings`.** The supplied code has no server settings API. These files do not enforce campaign, billing, refund, or device rules on the server. That limitation is now visible in Settings.
- Device session listing and sign-out retain the existing `getSessions`, `logoutSession`, and `logoutAll` services. The interface describes them as account sessions; it does not claim to sign out every user in the platform.
- Session polling runs while the Devices category is open. Failed requests have an error state rather than appearing to be an empty session list. Missing IP addresses show “Unavailable”.
- Restore defaults updates the draft. Save changes persists that draft. Input values are validated before saving; storage failures keep the changes unsaved.
- The existing “Unlimited” admin balance display is retained. No new balance or growth figures are fabricated.
- The stylesheet sets a light theme for this portal. It relies on modern CSS container queries, supported by current mainstream browsers.

## Validation completed

The supplied files were compiled in an isolated React/Vite + Tailwind preview using real shadcn Base UI primitives and sample data. Because only five components were supplied, backend hooks, analytics helpers, the time picker, and custom chart internals were represented by preview adapters.

- Production preview build passed.
- Overview layout measured at 320, 360, 390, 430, 768, 820, 1024, 1280, 1440, 1920, and 2560 CSS pixels.
- All three Settings categories checked at 320, 390, 768, 1024, 1440, and 2560 CSS pixels.
- No document-level horizontal overflow was observed at the checked widths.
- Long campaign titles, long reseller emails, large credit totals, and IPv6 addresses checked for overflow.
- Mobile drawer navigation, keyboard tab switching, invalid-rate validation and focus, successful saving, and saved-value persistence checked.
- Empty, loading, dashboard error, and session error states checked.
- Individual disconnect and sign-out cancellation checked against sample sessions.

The full project and live backend were not available, so final integration, custom chart rendering, and server behavior must be verified in your application. No live account sessions were changed during these checks.
