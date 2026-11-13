import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Public companion exports are intentional parts of these existing APIs.
// Keep component checks enabled while declaring their hooks, helpers and styles.
const companionExports = {
  'src/components/charts/chart-legend-hover.jsx': ['useChartLegendHover'],
  'src/components/charts/chart-parent-size.jsx': ['useIsomorphicLayoutEffect', 'useElementSize'],
  'src/components/charts/chart-stat-flow.jsx': ['defaultChartStatFlowFormat'],
  'src/components/charts/context/chart-config-context.jsx': ['DEFAULT_CHART_CONFIG', 'useChartConfig', 'resolveTooltipBoxMotion'],
  'src/components/charts/context/chart-context.jsx': [
    'chartCssVars',
    'defaultScatterColors',
    'useChartStable',
    'useChartPortalContainer',
    'useYScale',
    'useSettledYScale',
    'useChartHover',
    'useChart',
  ],
  'src/components/charts/context/pie-context.jsx': ['pieCssVars', 'defaultPieColors', 'usePieStable', 'usePieHover', 'usePie'],
  'src/components/charts/context/static-chart-preview-context.jsx': ['useStaticChartPreview'],
  'src/components/charts/grid-lines.jsx': ['gridTickValues', 'gridLinePositions'],
  'src/components/charts/line-loading-pulse.jsx': ['resolveLineLoadingPulseMode'],
  'src/components/charts/line-path.jsx': ['linePathD', 'areaClosedD'],
  'src/components/charts/loading-sweep.jsx': ['getSkeletonHeights'],
  'src/components/charts/patterns/lines.jsx': ['pathForOrientation'],
  'src/components/charts/series-point-marker.jsx': ['getSeriesMarkerVisualExtent'],
  'src/components/charts/x-axis.jsx': ['selectEvenlySpacedIndices'],
  'src/components/guards/RoleRoute.jsx': ['hasRolePermission'],
  'src/components/ui/badge.jsx': ['badgeVariants'],
  'src/components/ui/button.jsx': ['buttonVariants'],
  'src/components/ui/sidebar.jsx': ['useSidebar'],
  'src/components/ui/tabs.jsx': ['tabsListVariants'],
  'src/components/ui/toast.jsx': ['createToastManager', 'toast', 'useToastManager'],
  'src/features/accounts/components/AccountCreationFields.jsx': ['accountCreationLabel', 'accountCreationPlaceholders'],
  'src/features/auth/context/auth.context.jsx': ['AuthContext', 'useAuthContext'],
  'src/features/branding/context/BrandingContext.jsx': ['useBranding'],
  'src/features/branding/context/ThemeProvider.jsx': ['initializeTheme', 'useTheme'],
  'src/features/campaigns/components/create/CampaignMediaUploader.jsx': ['MEDIA_KINDS', 'formatFileSize'],
  'src/features/campaigns/components/detail/CampaignRecipientsTable.jsx': ['buildCampaignContacts', 'getStatusBadge'],
  'src/features/campaigns/components/detail/RecipientNumberHighlight.jsx': ['recipientMarkMap'],
  'src/features/campaigns/components/report/CampaignReportDistribution.jsx': ['BUCKET_COLORS'],
  'src/features/campaigns/components/report/CampaignReportNotes.jsx': ['STATUS_OPTIONS'],
  'src/features/dashboard/components/MobileTableRows.jsx': ['mobileTableLayout'],
  'src/features/socket/context/socket.context.jsx': ['useSocket', 'SocketContext'],
  'src/features/support/components/SupportMessage.jsx': ['messageDay'],
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Router composition is not a component refresh boundary.
    files: ['src/app.routes.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  ...Object.entries(companionExports).map(([file, allowExportNames]) => ({
    files: [file],
    rules: {
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames }],
    },
  })),
])
