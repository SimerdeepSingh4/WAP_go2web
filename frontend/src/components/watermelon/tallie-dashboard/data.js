import {
  CheckCircleIcon,
  ClockIcon,
  FadersHorizontalIcon,
  FileIcon,
  FolderIcon,
  GearIcon,
  HomeIcon,
  LinkIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  SpinnerGapIcon,
  StatusWarningIcon,
  UsersIcon,
  WarningIcon,
} from "./components/tallie/icons";


export const navigationGroups = [
  {
    label: "Main",
    items: [
      { name: "Dashboard", href: "/", icon: HomeIcon },
      { name: "Activity", href: "/activity", icon: ClockIcon },
      {
        name: "Exception",
        href: "/exception",
        icon: WarningIcon,
        badge: "3,154",
      },
      { name: "Transactions", href: "/transactions", icon: FileIcon },
    ],
  },
  {
    label: "Workflow",
    items: [
      { name: "Controls", href: "/controls", icon: ShieldCheckIcon },
      { name: "Audit Runs", href: "/audit-runs", icon: PlayCircleIcon },
      { name: "Reports", href: "/reports", icon: FolderIcon },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Integrations", href: "/integrations", icon: LinkIcon },
      { name: "Team", href: "/team", icon: UsersIcon },
      { name: "Settings", href: "/settings", icon: GearIcon },
    ],
  },
];

export const currentUser = {
  name: "Alex Morgan",
  email: "alex@tallie.com",
  initials: "AM",
  avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent("Alex Morgan")}`,
};

export const notifications = [
  {
    id: "exception-spike",
    title: "Exception volume spike",
    description: "3,154 open exceptions need review this week.",
    time: "2 min ago",
  },
  {
    id: "audit-complete",
    title: "Audit run completed",
    description: "Controls audit finished with 12 flagged items.",
    time: "1 hour ago",
  },
  {
    id: "integration-sync",
    title: "Integration synced",
    description: "ERP connector finished its latest sync.",
    time: "Yesterday",
  },
] ;


export const metrics = [
  {
    id: "total-processed",
    label: "Total processed",
    value: "147,392",
    icon: "clock" ,
    trend: { value: "+2.4%", label: "vs last run", tone: "up"  },
  },
  {
    id: "matched",
    label: "Matched",
    value: "12,847",
    icon: "seal" ,
    trend: { value: "+97.86%", label: "match rate" },
  },
  {
    id: "exceptions",
    label: "Exceptions",
    value: "12,847",
    icon: "warning" ,
    trend: { value: "2.14%", label: "exception rate" },
  },
  {
    id: "processing",
    label: "Processing",
    value: "12,847",
    icon: "arrows" ,
    trend: { value: "Live", label: "in queue", tone: "live"  },
  },
] ;

export const batchTransactions = [
  {
    id: "1",
    status: "processing",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "sharepoint"],
    confidence: 72,
  },
  {
    id: "2",
    status: "processing",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "concur"],
    confidence: 58,
  },
  {
    id: "3",
    status: "completed",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "concur", "email"],
    confidence: 99,
  },
  {
    id: "4",
    status: "processing",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "concur"],
    confidence: 58,
  },
  {
    id: "5",
    status: "processing",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "concur"],
    confidence: 58,
  },
  {
    id: "6",
    status: "exception",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "email", "concur"],
    confidence: 34,
    confidenceNote: "Amount Variance",
  },
  {
    id: "7",
    status: "completed",
    transactionId: "TXN-84921",
    po: "PO-6952",
    vendor: "Accenture LTD",
    amount: "$42,200.00",
    sources: ["oracle", "concur"],
    confidence: 97,
  },
] ;

export const sourceLabels = {
  oracle: "Oracle ERP",
  sharepoint: "Sharepoint",
  concur: "Concur",
  email: "Email",
};

export const batchStatusFilters = [
  { value: "all", label: "All statuses", icon: FadersHorizontalIcon },
  { value: "processing", label: "Processing", icon: SpinnerGapIcon },
  { value: "completed", label: "Completed", icon: CheckCircleIcon },
  { value: "exception", label: "Exception", icon: StatusWarningIcon },
];

export function getTransactionDetails(row) {
  const isException = row.status === "exception";
  const isComplete = row.status === "completed";

  return {
    customer: "Consulting Corp",
    batchId: "BAT-2026-0407",
    date: "Apr 7, 2026",
    flagged: isException,
    purchaseOrder: {
      status: "matched",
      amount: isException ? "$417,301.00" : row.amount,
      reference: row.po.startsWith("PO")
        ? `PO-2026-${row.po.replace(/\D/g, "")}`
        : row.po,
      source: sourceLabels[row.sources[0] ?? "oracle"],
    },
    invoice: {
      status: isException ? "mismatched" : isComplete ? "matched" : "partial",
      amount: row.amount,
      reference: `INV-CC-${row.id.padStart(4, "0")}`,
      deltaVsPo: isException ? "+$12,450" : isComplete ? "$0.00" : "+$420.00",
    },
    goodsReceipt: {
      status: isException ? "partial" : isComplete ? "matched" : "partial",
      amount: isException ? "$394,100.00" : row.amount,
      reference: `GR-0407-${row.id.padStart(3, "0")}`,
      fulfillment: isException ? "91.7%" : isComplete ? "100%" : "86.4%",
    },
    timeline: [
      ...(isException
        ? [
            {
              title: "Flagged as exception",
              parts: [
                "Audit AI",
                "Audit AI",
                `Confidence dropped to ${row.confidence}%`,
              ],
            },
          ]
        : []),
      {
        title: "Viewed by J. Hartwell",
        parts: ["Manual review", "Today 11:38 AM"],
      },
      {
        title: "Three-way match processed",
        parts: ["Manual review", "Today 11:38 AM"],
      },
      {
        title: isException ? "Flagged as exception" : "Match checks completed",
        parts: ["Automated", "Today 11:34 AM", "PO, Invoice, GR ingested"],
      },
      {
        title: "Transaction Submitted",
        parts: ["Oracle ERP sync", "Today 11:30 AM", "BAT-2026-0407"],
      },
    ],
  };
}


export const auditControls = {
  defaultLive: true,
} ;

export function filterBatchTransactions(transactions, statusFilter) {
  if (statusFilter === "all") return [...transactions];
  return transactions.filter((row) => row.status === statusFilter);
}

export function buildBatchExportCsv(transactions) {
  const header = [
    "Status",
    "Transaction ID",
    "PO",
    "Vendor",
    "Amount",
    "Sources",
    "Confidence",
    "Note",
  ];

  const rows = transactions.map((row) => [
    row.status,
    row.transactionId,
    row.po,
    row.vendor,
    row.amount,
    row.sources.map((source) => sourceLabels[source]).join(" | "),
    `${row.confidence}%`,
    "confidenceNote" in row && row.confidenceNote ? row.confidenceNote : "",
  ]);

  return [header, ...rows]
    .map((cells) =>
      cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
}
