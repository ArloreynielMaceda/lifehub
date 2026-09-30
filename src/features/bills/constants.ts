import type { Enums } from "@/types/database";

export type BillKind = Enums<"bill_kind">;

export const BILL_KINDS = ["bill", "reminder"] as const satisfies readonly BillKind[];

export const KIND_LABELS: Record<BillKind, string> = { bill: "Bill", reminder: "Reminder" };

export const BILL_VIEWS = ["upcoming", "overdue", "paid", "all"] as const;
export type BillView = (typeof BILL_VIEWS)[number];

export const VIEW_LABELS: Record<BillView, string> = {
  upcoming: "Upcoming",
  overdue: "Overdue",
  paid: "History",
  all: "All",
};

export const BILL_PAGE_SIZE = 20;
export const UPCOMING_WINDOW_DAYS = 30;

export const SUGGESTED_BILL_CATEGORIES = [
  "Utilities",
  "Rent",
  "Internet",
  "Mobile",
  "Insurance",
  "Subscriptions",
  "Loan",
  "Credit card",
  "Tuition",
  "Health",
];
