import type { SoneSpec } from "./types";

export interface PromptExample {
  label: string;
  spec: SoneSpec;
}

const metricCard: SoneSpec = {
  root: "root",
  elements: {
    root: {
      type: "Column",
      props: { padding: 26, background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 52%, #e0f2fe 100%)", width: 520 },
      children: ["header", "metrics"],
    },
    header: {
      type: "Column",
      props: {},
      children: ["title", "subtitle"],
    },
    title: {
      type: "Text",
      props: { segments: [{ text: "Q2 Growth Report" }], size: 24, weight: "800", color: "#0f172a" },
      children: [],
    },
    subtitle: {
      type: "Text",
      props: { segments: [{ text: "Performance across revenue and retention" }], size: 12, lineHeight: 1.5, color: "#64748b", marginTop: 6 },
      children: [],
    },
    metrics: {
      type: "Row",
      props: { gap: 14, marginTop: 20, alignItems: "stretch" },
      children: ["metricRevenue", "metricUsers", "metricRetention"],
    },
    metricRevenue: {
      type: "Column",
      props: { flexGrow: 1, padding: 18, background: "white", cornerRadius: [16], borderWidth: 1, borderColor: "#d1d5db" },
      children: ["metricRevenueLabel", "metricRevenueValue", "metricRevenueChange"],
    },
    metricRevenueLabel: {
      type: "Text",
      props: { segments: [{ text: "Revenue" }], size: 11, weight: "600", color: "#6b7280" },
      children: [],
    },
    metricRevenueValue: {
      type: "Text",
      props: { segments: [{ text: "$184.2K" }], size: 24, weight: "800", color: "#111827", marginTop: 8 },
      children: [],
    },
    metricRevenueChange: {
      type: "Text",
      props: { segments: [{ text: "+18.4%" }], size: 11, weight: "700", color: "#16a34a", marginTop: 6 },
      children: [],
    },
    metricUsers: {
      type: "Column",
      props: { flexGrow: 1, padding: 18, background: "white", cornerRadius: [16], borderWidth: 1, borderColor: "#d1d5db" },
      children: ["metricUsersLabel", "metricUsersValue", "metricUsersChange"],
    },
    metricUsersLabel: {
      type: "Text",
      props: { segments: [{ text: "New Users" }], size: 11, weight: "600", color: "#6b7280" },
      children: [],
    },
    metricUsersValue: {
      type: "Text",
      props: { segments: [{ text: "12,480" }], size: 24, weight: "800", color: "#111827", marginTop: 8 },
      children: [],
    },
    metricUsersChange: {
      type: "Text",
      props: { segments: [{ text: "+9.7%" }], size: 11, weight: "700", color: "#16a34a", marginTop: 6 },
      children: [],
    },
    metricRetention: {
      type: "Column",
      props: { flexGrow: 1, padding: 18, background: "white", cornerRadius: [16], borderWidth: 1, borderColor: "#d1d5db" },
      children: ["metricRetentionLabel", "metricRetentionValue", "metricRetentionChange"],
    },
    metricRetentionLabel: {
      type: "Text",
      props: { segments: [{ text: "Retention" }], size: 11, weight: "600", color: "#6b7280" },
      children: [],
    },
    metricRetentionValue: {
      type: "Text",
      props: { segments: [{ text: "74.8%" }], size: 24, weight: "800", color: "#111827", marginTop: 8 },
      children: [],
    },
    metricRetentionChange: {
      type: "Text",
      props: { segments: [{ text: "+4.1%" }], size: 11, weight: "700", color: "#16a34a", marginTop: 6 },
      children: [],
    },
  },
};

const socialPoster: SoneSpec = {
  root: "root",
  elements: {
    root: {
      type: "Column",
      props: { padding: 32, background: "#1a1a2e", width: 420, height: 420 },
      children: ["topBar", "heroSection", "statsRow", "cta"],
    },
    topBar: {
      type: "Row",
      props: { alignItems: "center", marginBottom: 32 },
      children: ["topBarLeft", "liveBadge"],
    },
    topBarLeft: {
      type: "Column",
      props: { flexGrow: 1 },
      children: ["topBarTitle", "topBarIssue"],
    },
    topBarTitle: {
      type: "Text",
      props: { segments: [{ text: "DESIGN WEEKLY" }], size: 9, weight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 2 },
      children: [],
    },
    topBarIssue: {
      type: "Text",
      props: { segments: [{ text: "Issue #48" }], size: 10, color: "rgba(255,255,255,0.4)" },
      children: [],
    },
    liveBadge: {
      type: "Text",
      props: { segments: [{ text: "LIVE" }], size: 9, weight: "700", color: "white", letterSpacing: 1, background: "rgba(255,255,255,0.1)", paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 10, cornerRadius: [20] },
      children: [],
    },
    heroSection: {
      type: "Column",
      props: { marginBottom: 40 },
      children: ["heroTag", "heroHeadline", "heroDescription"],
    },
    heroTag: {
      type: "Text",
      props: { segments: [{ text: "TREND" }], size: 10, weight: "600", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.15)", paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 10, cornerRadius: [20] },
      children: [],
    },
    heroHeadline: {
      type: "Text",
      props: {
        segments: [
          { text: "Design\n", style: { weight: "800" } },
          { text: "Trends", style: { weight: "800", color: "rgba(255,255,255,0.35)" } },
        ],
        size: 52, color: "white", lineHeight: 1.05, letterSpacing: -2, marginTop: 16,
      },
      children: [],
    },
    heroDescription: {
      type: "Text",
      props: { segments: [{ text: "Shaping the future of digital interfaces and visual communication." }], size: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, marginTop: 16, maxWidth: 340 },
      children: [],
    },
    statsRow: {
      type: "Row",
      props: { gap: 24, alignItems: "center", justifyContent: "center", marginBottom: 40 },
      children: ["stat1", "stat2", "stat3"],
    },
    stat1: {
      type: "Column",
      props: { alignItems: "center", gap: 2 },
      children: ["stat1Value", "stat1Label"],
    },
    stat1Value: {
      type: "Text",
      props: { segments: [{ text: "12.4K" }], size: 22, weight: "800", color: "white" },
      children: [],
    },
    stat1Label: {
      type: "Text",
      props: { segments: [{ text: "READERS" }], size: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 1, weight: "600" },
      children: [],
    },
    stat2: {
      type: "Column",
      props: { alignItems: "center", gap: 2 },
      children: ["stat2Value", "stat2Label"],
    },
    stat2Value: {
      type: "Text",
      props: { segments: [{ text: "248" }], size: 22, weight: "800", color: "white" },
      children: [],
    },
    stat2Label: {
      type: "Text",
      props: { segments: [{ text: "ARTICLES" }], size: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 1, weight: "600" },
      children: [],
    },
    stat3: {
      type: "Column",
      props: { alignItems: "center", gap: 2 },
      children: ["stat3Value", "stat3Label"],
    },
    stat3Value: {
      type: "Text",
      props: { segments: [{ text: "96%" }], size: 22, weight: "800", color: "white" },
      children: [],
    },
    stat3Label: {
      type: "Text",
      props: { segments: [{ text: "SATISFACTION" }], size: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 1, weight: "600" },
      children: [],
    },
    cta: {
      type: "Row",
      props: { alignItems: "center", background: "rgba(255,255,255,0.08)", padding: 16, cornerRadius: [16] },
      children: ["ctaText", "ctaButton"],
    },
    ctaText: {
      type: "Column",
      props: { flexGrow: 1 },
      children: ["ctaTitle", "ctaUrl"],
    },
    ctaTitle: {
      type: "Text",
      props: { segments: [{ text: "Read this week's edition" }], size: 12, weight: "600", color: "white" },
      children: [],
    },
    ctaUrl: {
      type: "Text",
      props: { segments: [{ text: "designweekly.io/issue-48" }], size: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 },
      children: [],
    },
    ctaButton: {
      type: "Text",
      props: { segments: [{ text: "READ NOW →" }], size: 10, weight: "700", color: "#1a1a2e", background: "white", paddingTop: 10, paddingBottom: 10, paddingLeft: 18, paddingRight: 18, cornerRadius: [24] },
      children: [],
    },
  },
};

const invoiceTable: SoneSpec = {
  root: "root",
  elements: {
    root: {
      type: "Column",
      props: { padding: 40, background: "white", width: 600 },
      children: ["header", "billTo", "table", "totals"],
    },
    header: {
      type: "Row",
      props: { alignItems: "flex-start", marginBottom: 32 },
      children: ["headerLeft", "headerRight"],
    },
    headerLeft: {
      type: "Column",
      props: { flexGrow: 1 },
      children: ["invoiceTitle", "invoiceNumber"],
    },
    invoiceTitle: {
      type: "Text",
      props: { segments: [{ text: "INVOICE" }], size: 24, weight: "700", color: "#111827", letterSpacing: -0.5 },
      children: [],
    },
    invoiceNumber: {
      type: "Text",
      props: { segments: [{ text: "#INV-2024-0042" }], size: 11, color: "#9ca3af", marginTop: 2 },
      children: [],
    },
    headerRight: {
      type: "Column",
      props: { alignItems: "flex-end" },
      children: ["companyName", "companyEmail"],
    },
    companyName: {
      type: "Text",
      props: { segments: [{ text: "Acme Studio" }], size: 13, weight: "600", color: "#111827", align: "right" },
      children: [],
    },
    companyEmail: {
      type: "Text",
      props: { segments: [{ text: "hello@acmestudio.io" }], size: 11, color: "#6b7280", align: "right" },
      children: [],
    },
    billTo: {
      type: "Column",
      props: { marginBottom: 28 },
      children: ["billToLabel", "billToName", "billToCompany"],
    },
    billToLabel: {
      type: "Text",
      props: { segments: [{ text: "BILL TO" }], size: 9, weight: "700", color: "#9ca3af", letterSpacing: 1 },
      children: [],
    },
    billToName: {
      type: "Text",
      props: { segments: [{ text: "Sarah Johnson" }], size: 12, weight: "600", color: "#111827", marginTop: 6 },
      children: [],
    },
    billToCompany: {
      type: "Text",
      props: { segments: [{ text: "Bright Future Inc." }], size: 11, color: "#6b7280" },
      children: [],
    },
    table: {
      type: "Table",
      props: {
        spacing: [8, 0],
        marginBottom: 16,
        rows: [
          {
            cells: [
              { text: "Description", header: true, width: 280, padding: 10 },
              { text: "Qty", header: true, width: 50, padding: 10 },
              { text: "Rate", header: true, width: 100, padding: 10 },
              { text: "Amount", header: true, width: 100, padding: 10 },
            ],
          },
          {
            cells: [
              { text: "UI Design System", width: 280, padding: 10 },
              { text: "1", width: 50, padding: 10 },
              { text: "$4,800.00", width: 100, padding: 10 },
              { text: "$4,800.00", width: 100, padding: 10 },
            ],
          },
          {
            cells: [
              { text: "Frontend Development", width: 280, padding: 10 },
              { text: "3", width: 50, padding: 10 },
              { text: "$2,400.00", width: 100, padding: 10 },
              { text: "$7,200.00", width: 100, padding: 10 },
            ],
          },
        ],
      },
      children: [],
    },
    totals: {
      type: "Column",
      props: { alignItems: "stretch", marginTop: 8 },
      children: ["subtotalRow", "divider", "totalRow"],
    },
    subtotalRow: {
      type: "Row",
      props: { alignItems: "center", paddingTop: 8, paddingBottom: 8 },
      children: ["subtotalLabel", "subtotalValue"],
    },
    subtotalLabel: {
      type: "Text",
      props: { segments: [{ text: "Subtotal" }], size: 11, color: "#6b7280", flexGrow: 1 },
      children: [],
    },
    subtotalValue: {
      type: "Text",
      props: { segments: [{ text: "$12,000.00" }], size: 11, color: "#111827" },
      children: [],
    },
    divider: {
      type: "Column",
      props: { height: 1, background: "#e5e7eb" },
      children: [],
    },
    totalRow: {
      type: "Row",
      props: { alignItems: "center", paddingTop: 12 },
      children: ["totalLabel", "totalValue"],
    },
    totalLabel: {
      type: "Text",
      props: { segments: [{ text: "Total" }], size: 13, weight: "700", color: "#111827", flexGrow: 1 },
      children: [],
    },
    totalValue: {
      type: "Text",
      props: { segments: [{ text: "$13,200.00" }], size: 14, weight: "700", color: "#111827" },
      children: [],
    },
  },
};

export const PROMPT_EXAMPLES: PromptExample[] = [
  { label: "Dashboard metric cards", spec: metricCard },
  { label: "Dark social poster", spec: socialPoster },
  { label: "Invoice with table", spec: invoiceTable },
];

export const DESIGN_RULES = [
  "Text color hierarchy: #111827 (primary), #374151 (secondary), #6b7280 (muted), #9ca3af (subtle/labels).",
  "Use generous padding (20-40px on root containers, 14-20px on cards). Never have zero padding on root.",
  "Use cornerRadius on cards and buttons (12-24 for cards, 20-999 for pills/badges).",
  "Labels and captions: size 9-11, weight 600-700, letterSpacing 0.5-2, uppercase.",
  "Headlines: size 20-52, weight 700-800, letterSpacing -0.5 to -2 for large text.",
  "Body text: size 11-13, lineHeight 1.5-1.65, color #374151 or #6b7280.",
  "Use borderWidth 1 with borderColor #d1d5db for subtle card borders.",
  "Stats/metrics pattern: large value (size 20-24 weight 800) with small label below (size 9-11 weight 600).",
  "Use flexGrow 1 on elements that should fill remaining space in a Row.",
  "Dividers: Column with height 1 and background #e5e7eb.",
  "Badges/tags: small text with background, paddingTop/Bottom 3-5, paddingLeft/Right 8-12, cornerRadius 20.",
  "Always set explicit width on root container (400-760 typical range).",
] as const;
