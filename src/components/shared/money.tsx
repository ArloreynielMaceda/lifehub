import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Money({
  minor,
  currency,
  className,
  signed,
  tone,
}: {
  minor: number;
  currency: string;
  className?: string;
  /** Prefix with + / − according to the tone (income / expense). */
  signed?: boolean;
  tone?: "income" | "expense" | "neutral";
}) {
  const text = formatMoney(minor, currency);
  const prefix = signed ? (tone === "income" ? "+" : tone === "expense" ? "−" : "") : "";
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        tone === "income" && "text-success",
        className,
      )}
    >
      {prefix}
      {text}
    </span>
  );
}
