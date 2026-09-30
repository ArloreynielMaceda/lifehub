import type { Enums } from "@/types/database";

export type TransactionType = Enums<"transaction_type">;
export type PaymentMethod = Enums<"payment_method">;

export const TRANSACTION_TYPES = ["expense", "income"] as const satisfies readonly TransactionType[];

export const TYPE_LABELS: Record<TransactionType, string> = { expense: "Expense", income: "Income" };

export const PAYMENT_METHODS = [
  "cash",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "e_wallet",
  "other",
] as const satisfies readonly PaymentMethod[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  debit_card: "Debit card",
  credit_card: "Credit card",
  bank_transfer: "Bank transfer",
  e_wallet: "E-wallet",
  other: "Other",
};

export const EXPENSE_CATEGORIES = [
  "Food & dining",
  "Groceries",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Education",
  "Shopping",
  "Entertainment",
  "Personal care",
  "Family",
  "Travel",
  "Subscriptions",
  "Gifts & donations",
  "Other",
];

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Allowance",
  "Gifts",
  "Refunds",
  "Interest",
  "Other",
];

export const RANGE_PRESETS = ["this_month", "last_month", "last_3_months", "this_year", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  this_year: "This year",
  custom: "Custom range",
};

export const TRANSACTION_PAGE_SIZE = 25;
export const TREND_MONTHS = 6;
/** Category breakdown shows the top N-1 categories and folds the rest into "Other". */
export const MAX_CATEGORY_BARS = 7;
