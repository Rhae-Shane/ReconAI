import {
  Activity,
  Calculator,
  Coins,
  Gauge,
  ListTodo,
  type LucideIcon,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/**
 * ReconAI sidebar navigation — trimmed to the Close cockpit and its sub-pages.
 * All template demo group headers (Dashboards / Pages / Legacy / Misc) were removed
 * along with their routes; the UI shell itself is preserved.
 *
 * NavMain renders groups in order; group `id` is only used for React keys.
 */
export const sidebarItems: NavGroup[] = [
  {
    id: 0,
    label: "ReconAI",
    items: [
      {
        id: "close",
        title: "Close Cockpit",
        url: "/dashboard/close",
        icon: ListTodo,
      },
      {
        id: "close-exceptions",
        title: "Exceptions",
        url: "/dashboard/close/exceptions",
        icon: ReceiptText,
      },
      {
        id: "close-trust",
        title: "Trust",
        url: "/dashboard/close/trust",
        icon: ShieldCheck,
        badge: "new",
      },
      {
        id: "close-settlement",
        title: "Settlement",
        url: "/dashboard/close/settlement",
        icon: Coins,
      },
      {
        id: "close-forecast",
        title: "Cash Forecast",
        url: "/dashboard/close/forecast",
        icon: Gauge,
      },
      {
        id: "close-tax",
        title: "Tax / HSN",
        url: "/dashboard/close/tax",
        icon: Calculator,
      },
      {
        id: "close-metrics",
        title: "Analytics",
        url: "/dashboard/close/metrics",
        icon: Activity,
      },
    ],
  },
];
