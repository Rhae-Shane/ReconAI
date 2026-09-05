import {
  Activity,
  Calculator,
  Coins,
  CreditCard,
  GitCompare,
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
 * ReconAI sidebar — Close cockpit and its sub-pages only.
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
        id: "close-tax",
        title: "Tax / GST",
        url: "/dashboard/close/tax",
        icon: Calculator,
      },
      {
        id: "close-diff",
        title: "Run diff",
        url: "/dashboard/close/diff",
        icon: GitCompare,
        badge: "new",
      },
      {
        id: "close-metrics",
        title: "Analytics",
        url: "/dashboard/close/metrics",
        icon: Activity,
      },
      {
        id: "close-billing",
        title: "Billing",
        url: "/dashboard/close/billing",
        icon: CreditCard,
      },
    ],
  },
];
